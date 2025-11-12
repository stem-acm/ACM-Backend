import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activities, checkins, members } from '@/db/schema';
import type { CheckinQueryInput, CreateCheckinInput } from '@/schemas/checkinSchema';

export async function createCheckin(input: CreateCheckinInput) {
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

  const checkInTime = input.checkInTime ? new Date(input.checkInTime) : new Date();

  const [newCheckin] = await db
    .insert(checkins)
    .values({
      memberId: member.id,
      activityId: input.activityId,
      checkInTime,
      checkOutTime: input.checkOutTime ? new Date(input.checkOutTime) : undefined,
      visitReason: input.visitReason,
    })
    .returning();

  return newCheckin;
}

export async function getCheckins(query: CheckinQueryInput) {
  const { offset, limit, memberId, activityId, date, sortBy, order } = query;

  let queryBuilder = db
    .select({
      id: checkins.id,
      memberId: checkins.memberId,
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
    conditions.push(eq(checkins.memberId, memberId));
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

  return {
    data,
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
  // Find member by registration number
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.registrationNumber, registrationNumber))
    .limit(1);

  if (!member) {
    throw new Error('Member not found');
  }

  return getCheckins({ ...query, memberId: member.id });
}

export async function getCheckinById(id: number) {
  const [checkin] = await db.select().from(checkins).where(eq(checkins.id, id)).limit(1);
  return checkin || null;
}

export async function deleteCheckin(id: number) {
  const [deletedCheckin] = await db.delete(checkins).where(eq(checkins.id, id)).returning();

  if (!deletedCheckin) {
    throw new Error('Check-in not found');
  }

  return deletedCheckin;
}
