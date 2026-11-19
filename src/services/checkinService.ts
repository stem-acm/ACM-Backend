import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activities, checkins, members } from '@/db/schema';
import type { CheckinQueryInput, CreateCheckinInput } from '@/schemas/checkinSchema';
import { getTimezone } from '@/services/appSettingsService';
import { type Actor, memberLabel, snapshot, writeLog } from '@/services/auditService';
import { getCheckinSchedule } from '@/services/checkinScheduleService';
import { getCheckinSlot, getZoneDayBounds, validateCheckinTime } from '@/utils/checkinUtils';
import { verifyQRCode } from '@/utils/qrUtils';

/**
 * Creates a check-in at `now`. The HTTP route always passes the server clock: the
 * `checkInTime` of a request is not used, so a client cannot scan outside the schedule by
 * sending another time. Tests pass `now` to scan at a chosen instant.
 */
export async function createCheckin(input: CreateCheckinInput, now: Date = new Date()) {
  // Verify QR code signature to prevent forged badges
  if (!verifyQRCode({ registrationNumber: input.registrationNumber, signature: input.signature })) {
    throw new Error('Invalid QR code signature');
  }

  // Find member by registration number
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.registrationNumber, input.registrationNumber))
    .limit(1);

  if (!member) {
    throw new Error('Member not found');
  }

  // Verify activity exists
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, input.activityId))
    .limit(1);

  if (!activity) {
    throw new Error('Activity not found');
  }

  const checkInTime = now;
  const checkOutTime = input.checkOutTime ? new Date(input.checkOutTime) : undefined;
  if (checkOutTime && checkOutTime <= checkInTime) {
    throw new Error('Check-out time must be after check-in time');
  }

  // Read the schedule and the time zone once: the new scan and the earlier scans use the
  // same ones.
  const [schedule, timeZone] = await Promise.all([getCheckinSchedule(), getTimezone()]);
  const validation = validateCheckinTime(checkInTime, schedule, timeZone);
  if (!validation.allowed) {
    throw new Error(validation.reason);
  }

  // One scan per slot: refuse the scan if the member already has a scan of this day
  // in the same slot. The slot of an earlier scan comes from the current schedule; an
  // earlier scan that is now outside all slots (the schedule changed) has no slot and
  // does not block the new scan.
  const currentSlot = validation.slot;
  if (currentSlot) {
    const { start, end } = getZoneDayBounds(checkInTime, timeZone);
    const todaysCheckins = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.registrationNumber, member.registrationNumber),
          gte(checkins.checkInTime, start),
          lte(checkins.checkInTime, end)
        )
      );

    for (const checkin of todaysCheckins) {
      if (getCheckinSlot(checkin.checkInTime, schedule, timeZone) === currentSlot) {
        throw new Error('Already scanned for this half day');
      }
    }
  }

  const [newCheckin] = await db
    .insert(checkins)
    .values({
      registrationNumber: member.registrationNumber,
      activityId: input.activityId,
      checkInTime,
      checkOutTime,
      visitReason: input.visitReason,
    })
    .returning();

  // Return the complete checkin with member and activity details for SSE
  return {
    ...newCheckin,
    registrationNumber: member.registrationNumber,
    Member: member,
    Activity: activity,
  };
}

export async function getCheckins(query: CheckinQueryInput) {
  const { offset, limit, memberId, activityId, date, sortBy, order } = query;

  let queryBuilder = db
    .select({
      id: checkins.id,
      registrationNumber: checkins.registrationNumber,
      activityId: checkins.activityId,
      checkInTime: checkins.checkInTime,
      checkOutTime: checkins.checkOutTime,
      visitReason: checkins.visitReason,
      createdAt: checkins.createdAt,
      updatedAt: checkins.updatedAt,
    })
    .from(checkins);

  // Apply filters
  const conditions = [];
  if (memberId) {
    conditions.push(eq(checkins.registrationNumber, memberId));
  }
  if (activityId) {
    conditions.push(eq(checkins.activityId, activityId));
  }
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    conditions.push(gte(checkins.checkInTime, startOfDay));
    conditions.push(lte(checkins.checkInTime, endOfDay));
  }

  // Get total count with same conditions
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(checkins);
  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
  }
  const totalResult = await countQuery;
  const total = Number(totalResult[0]?.count || 0);

  // Apply filters to data query
  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(and(...conditions)) as typeof queryBuilder;
  }

  // Apply sorting
  const orderBy = order === 'desc' ? desc : asc;
  let sortedQuery = queryBuilder;
  switch (sortBy) {
    case 'checkInTime':
      sortedQuery = queryBuilder.orderBy(orderBy(checkins.checkInTime)) as typeof queryBuilder;
      break;
    case 'createdAt':
      sortedQuery = queryBuilder.orderBy(orderBy(checkins.createdAt)) as typeof queryBuilder;
      break;
    default:
      sortedQuery = queryBuilder.orderBy(orderBy(checkins.id)) as typeof queryBuilder;
  }

  // Apply pagination
  const data = await sortedQuery.limit(limit).offset(offset);

  // Get member and activity details for each checkin
  const checkinsWithMembersAndActivities = await Promise.all(
    data.map(async (checkins) => {
      const [member] = await db
        .select()
        .from(members)
        .where(eq(members.registrationNumber, checkins.registrationNumber))
        .limit(1);

      const [activity] = await db
        .select()
        .from(activities)
        .where(eq(activities.id, checkins.activityId))
        .limit(1);

      return {
        ...checkins,
        Member: member || null,
        Activity: activity || null,
      };
    })
  );

  return {
    data: checkinsWithMembersAndActivities,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total,
    },
  };
}

export async function getCheckinsByRegistrationNumber(
  registrationNumber: string,
  query: Omit<CheckinQueryInput, 'memberId'>
) {
  const parsedRegNum = Number.parseInt(registrationNumber, 10);
  if (Number.isNaN(parsedRegNum)) {
    throw new Error('Invalid registration number');
  }

  // Find member by registration number
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.registrationNumber, parsedRegNum))
    .limit(1);

  if (!member) {
    throw new Error('Member not found');
  }

  return getCheckins({ ...query, memberId: member.registrationNumber });
}

export async function getCheckinById(id: number) {
  const [checkin] = await db.select().from(checkins).where(eq(checkins.id, id)).limit(1);
  return checkin || null;
}

export async function deleteCheckin(id: number, actor: Actor) {
  return db.transaction(async (tx) => {
    // Resolve the label before the row is deleted.
    const [names] = await tx
      .select({
        firstName: members.firstName,
        lastName: members.lastName,
        activityName: activities.name,
      })
      .from(checkins)
      .innerJoin(members, eq(checkins.registrationNumber, members.registrationNumber))
      .innerJoin(activities, eq(checkins.activityId, activities.id))
      .where(eq(checkins.id, id))
      .limit(1);

    const [deletedCheckin] = await tx.delete(checkins).where(eq(checkins.id, id)).returning();

    if (!deletedCheckin) {
      throw new Error('Check-in not found');
    }

    await writeLog(tx, actor, {
      type: 'checkin.deleted',
      entity: 'checkins',
      entityId: deletedCheckin.id,
      entityLabel: names
        ? `${memberLabel(names)}, ${names.activityName}`
        : String(deletedCheckin.id),
      changes: snapshot(deletedCheckin),
    });

    return deletedCheckin;
  });
}
