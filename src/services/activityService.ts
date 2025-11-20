import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activities, checkins } from '@/db/schema';
import type {
  ActivityQueryInput,
  CreateActivityInput,
  UpdateActivityInput,
} from '@/schemas/activitySchema';

export async function createActivity(input: CreateActivityInput, createdBy: number) {
  const [newActivity] = await db
    .insert(activities)
    .values({
      ...input,
      createdBy,
    })
    .returning();

  return newActivity;
}

export async function getActivities(query: ActivityQueryInput) {
  const { offset, limit, isActive, sortBy, order } = query;

  // Build where conditions
 // const conditions = [];
/*   if (isActive !== undefined) {
    conditions.push(eq(activities.isActive, isActive));
  } */

  // Get total count
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(activities);
  /* if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
  } */
  const totalResult = await countQuery;
  const total = Number(totalResult[0]?.count || 0);

  // Build query
  let dataQuery = db.select().from(activities);
/*   if (conditions.length > 0) {
    dataQuery = dataQuery.where(and(...conditions)) as typeof dataQuery;
  } */

  // Apply sorting
  const orderBy = order === 'desc' ? desc : asc;
  switch (sortBy) {
    case 'name':
      dataQuery = dataQuery.orderBy(orderBy(activities.name)) as typeof dataQuery;
      break;
    case 'createdAt':
      dataQuery = dataQuery.orderBy(orderBy(activities.createdAt)) as typeof dataQuery;
      break;
    default:
      dataQuery = dataQuery.orderBy(orderBy(activities.id)) as typeof dataQuery;
  }

  // Apply pagination
  const data = await dataQuery.limit(limit).offset(offset);

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

export async function getActivityById(id: number) {
  const [activity] = await db.select().from(activities).where(eq(activities.id, id)).limit(1);
  return activity || null;
}

export async function updateActivity(id: number, input: UpdateActivityInput) {
  const [updatedActivity] = await db
    .update(activities)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(activities.id, id))
    .returning();

  if (!updatedActivity) {
    throw new Error('Activity not found');
  }

  return updatedActivity;
}

export async function deleteActivity(id: number) {
  // Check if activity has associated check-ins
  const [checkin] = await db.select().from(checkins).where(eq(checkins.activityId, id)).limit(1);

  if (checkin) {
    throw new Error('Cannot delete activity with associated check-ins');
  }

  const [deletedActivity] = await db.delete(activities).where(eq(activities.id, id)).returning();

  if (!deletedActivity) {
    throw new Error('Activity not found');
  }

  return deletedActivity;
}
