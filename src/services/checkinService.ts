import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or, type SQL, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activities, checkins, members } from '@/db/schema';
import type { CheckinSchedule } from '@/schemas/checkinScheduleSchema';
import type {
  CheckinQueryInput,
  CreateCheckinInput,
  InRoomQueryInput,
  VerifyBadgeInput,
} from '@/schemas/checkinSchema';
import { getTimezone } from '@/services/appSettingsService';
import { type Actor, memberLabel, snapshot, writeLog } from '@/services/auditService';
import { getCheckinSchedule } from '@/services/checkinScheduleService';
import {
  type CheckinSlot,
  getCheckinSlot,
  getSlotOverview,
  getZoneDayBounds,
  validateCheckinTime,
} from '@/utils/checkinUtils';
import { verifyQRCode } from '@/utils/qrUtils';

/**
 * The check-in of the member on the day of `now` (in the time zone of the app) that is in
 * `slot`, or `undefined`. The slot of a check-in comes from the current schedule: a check-in
 * that is now outside all slots (the schedule changed) has no slot and is never returned.
 */
export async function findCheckinInSlot(
  registrationNumber: number,
  slot: CheckinSlot,
  now: Date,
  schedule: CheckinSchedule,
  timeZone: string
) {
  const { start, end } = getZoneDayBounds(now, timeZone);
  const todaysCheckins = await db
    .select()
    .from(checkins)
    .where(
      and(
        eq(checkins.registrationNumber, registrationNumber),
        gte(checkins.checkInTime, start),
        lte(checkins.checkInTime, end)
      )
    )
    .orderBy(asc(checkins.id));
  return todaysCheckins.find(
    (checkin) => getCheckinSlot(checkin.checkInTime, schedule, timeZone) === slot
  );
}

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
  if (
    currentSlot &&
    (await findCheckinInSlot(
      member.registrationNumber,
      currentSlot,
      checkInTime,
      schedule,
      timeZone
    ))
  ) {
    throw new Error('Already scanned for this half day');
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

export const VERIFY_STATUSES = [
  'CHECKED_IN',
  'NOT_CHECKED_IN',
  'NO_SLOT',
  'INVALID_BADGE',
] as const;
export type VerifyStatus = (typeof VERIFY_STATUSES)[number];

/** The URL path of the photo of a member, or `null` without a photo. */
function photoUrl(profileImage: string | null): string | null {
  return profileImage ? `/uploads/${profileImage}` : null;
}

/**
 * Tells whether the member of a badge has a check-in in the current slot. It changes no
 * check-in. Each call writes one `member.badge_verified` audit row, in a transaction: when the
 * row cannot be written, the call fails and gives no result.
 *
 * A wrong signature and an unknown member give the same `INVALID_BADGE` answer, so that the
 * answer does not tell which registration numbers exist.
 */
export async function verifyBadge(input: VerifyBadgeInput, actor: Actor, now: Date = new Date()) {
  const { registrationNumber, signature } = input;
  const [member] = verifyQRCode({ registrationNumber, signature })
    ? await db
        .select()
        .from(members)
        .where(eq(members.registrationNumber, registrationNumber))
        .limit(1)
    : [];

  // Read the schedule and the time zone once, as `createCheckin` does.
  const [schedule, timeZone] = await Promise.all([getCheckinSchedule(), getTimezone()]);
  const overview = getSlotOverview(now, schedule, timeZone);

  let status: VerifyStatus;
  let checkIn: { id: number; time: Date; activity: string } | null = null;
  if (!member) {
    status = 'INVALID_BADGE';
  } else if (!overview.slot) {
    status = 'NO_SLOT';
  } else {
    const found = await findCheckinInSlot(
      member.registrationNumber,
      overview.slot.id,
      now,
      schedule,
      timeZone
    );
    if (found) {
      const [activity] = await db
        .select({ name: activities.name })
        .from(activities)
        .where(eq(activities.id, found.activityId))
        .limit(1);
      checkIn = { id: found.id, time: found.checkInTime, activity: activity?.name ?? '' };
      status = 'CHECKED_IN';
    } else {
      status = 'NOT_CHECKED_IN';
    }
  }

  const slot = member && overview.slot ? overview.slot : null;
  // The signature is never stored.
  await db.transaction(async (tx) => {
    await writeLog(tx, actor, {
      type: 'member.badge_verified',
      entity: 'members',
      entityId: registrationNumber,
      entityLabel: member ? memberLabel(member) : `Unknown badge #${registrationNumber}`,
      changes: { status, slot: slot?.id ?? null, checkinId: checkIn?.id ?? null },
    });
  });

  return {
    status,
    member: member
      ? {
          registrationNumber: member.registrationNumber,
          firstName: member.firstName,
          lastName: member.lastName,
          photoUrl: photoUrl(member.profileImage),
        }
      : null,
    slot: slot ? { day: slot.day, start: slot.start, end: slot.end } : null,
    checkIn,
    nextSlot: overview.nextSlot,
    todaySlots: overview.todaySlots,
    closedToday: overview.closedToday,
    now: { day: overview.day, time: overview.time },
    timezone: timeZone,
    serverTime: now.toISOString(),
  };
}

/** The fields of a check-in that `toInRoomItem` reads. */
export interface InRoomSource {
  id: number;
  registrationNumber: number;
  activityId: number;
  checkInTime: Date | string;
  checkOutTime: Date | string | null;
  visitReason: string | null;
  Member: {
    registrationNumber: number;
    firstName: string;
    lastName: string | null;
    profileImage: string | null;
  };
  Activity: { id: number; name: string };
}

/**
 * The reduced check-in that a user without `checkins.view` receives: no address, phone number
 * or other personal field of the member.
 */
export function toInRoomItem(row: InRoomSource) {
  return {
    id: row.id,
    registrationNumber: row.registrationNumber,
    activityId: row.activityId,
    checkInTime: row.checkInTime,
    checkOutTime: row.checkOutTime ?? null,
    visitReason: row.visitReason ?? null,
    Member: {
      registrationNumber: row.Member.registrationNumber,
      firstName: row.Member.firstName,
      lastName: row.Member.lastName,
      profileImage: row.Member.profileImage,
    },
    Activity: { id: row.Activity.id, name: row.Activity.name },
  };
}

/**
 * The check-ins of today (in the time zone of the app) that are still in the room: without a
 * check-out time or with a check-out time after `now`. Newest first, with cursor pagination
 * on the id: `before` returns the rows with a smaller id, so a new check-in between two pages
 * does not move the rows of the next page. Since #65 the check-in time is the server clock,
 * so the order of the ids is the order of the check-in times.
 *
 * `full` gives the full member and activity rows (users with `checkins.view`); else each row
 * is reduced by `toInRoomItem`.
 */
export async function getInRoomCheckins(
  { limit, before }: InRoomQueryInput,
  full: boolean,
  now: Date = new Date()
) {
  const [schedule, timeZone] = await Promise.all([getCheckinSchedule(), getTimezone()]);
  const { start, end } = getZoneDayBounds(now, timeZone);
  const inRoom: SQL[] = [
    gte(checkins.checkInTime, start),
    lte(checkins.checkInTime, end),
    or(isNull(checkins.checkOutTime), gt(checkins.checkOutTime, now)) as SQL,
  ];

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(checkins)
    .where(and(...inRoom));

  const rows = await db
    .select({ checkin: checkins, Member: members, Activity: activities })
    .from(checkins)
    .innerJoin(members, eq(checkins.registrationNumber, members.registrationNumber))
    .innerJoin(activities, eq(checkins.activityId, activities.id))
    .where(and(...inRoom, ...(before ? [lt(checkins.id, before)] : [])))
    .orderBy(desc(checkins.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).map(({ checkin, Member, Activity }) => {
    const row = { ...checkin, Member, Activity };
    return full ? row : toInRoomItem(row);
  });
  const slot = getSlotOverview(now, schedule, timeZone).slot;

  return {
    data: {
      checkins: page,
      slot: slot ? { day: slot.day, start: slot.start, end: slot.end } : null,
      timezone: timeZone,
      serverTime: now.toISOString(),
    },
    pagination: {
      limit,
      total: Number(count ?? 0),
      hasMore,
      nextBefore: hasMore ? page[page.length - 1].id : null,
    },
  };
}
