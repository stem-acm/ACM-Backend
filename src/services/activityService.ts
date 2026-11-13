import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activities, checkins, members } from '@/db/schema';
import type {
  ActivityQueryInput,
  CreateActivityInput,
  UpdateActivityInput,
} from '@/schemas/activitySchema';
import { type Actor, diffRows, memberLabel, snapshot, writeLog } from '@/services/auditService';

export async function createActivity(input: CreateActivityInput, actor: Actor) {
  return db.transaction(async (tx) => {
    const [newActivity] = await tx
      .insert(activities)
      .values({
        ...input,
        createdBy: actor.id,
      })
      .returning();
    await writeLog(tx, actor, {
      type: 'activity.created',
      entity: 'activities',
      entityId: newActivity.id,
      entityLabel: newActivity.name,
      changes: snapshot(newActivity),
    });
    return newActivity;
  });
}

export async function getActivities(query: ActivityQueryInput) {
  const { offset, limit, sortBy, order, search } = query;

  // Build where conditions
  const conditions = [];
  if (search) {
    conditions.push(or(ilike(activities.name, `%${search}%`)));
  }

  // Get total count
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(activities);
  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
  }
  const totalResult = await countQuery;
  const total = Number(totalResult[0]?.count || 0);

  // Build query
  let dataQuery = db.select().from(activities);
  if (conditions.length > 0) {
    dataQuery = dataQuery.where(and(...conditions)) as typeof dataQuery;
  }

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

export async function updateActivity(id: number, input: UpdateActivityInput, actor: Actor) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(activities).where(eq(activities.id, id)).limit(1);
    if (!before) {
      throw new Error('Activity not found');
    }

    const [updatedActivity] = await tx
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

    const changes = diffRows(before, updatedActivity);
    if (Object.keys(changes).length > 0) {
      await writeLog(tx, actor, {
        type: 'activity.updated',
        entity: 'activities',
        entityId: updatedActivity.id,
        entityLabel: updatedActivity.name,
        changes,
      });
    }
    return updatedActivity;
  });
}

export async function deleteActivity(id: number, actor: Actor) {
  return db.transaction(async (tx) => {
    const [activity] = await tx.select().from(activities).where(eq(activities.id, id)).limit(1);
    if (!activity) {
      throw new Error('Activity not found');
    }
    const parent = {
      parentEntity: 'activities' as const,
      parentId: activity.id,
      parentLabel: activity.name,
    };

    // Resolve the labels of the linked check-ins before they are deleted.
    const checkinMembers = await tx
      .select({ id: checkins.id, firstName: members.firstName, lastName: members.lastName })
      .from(checkins)
      .innerJoin(members, eq(checkins.registrationNumber, members.registrationNumber))
      .where(eq(checkins.activityId, id));
    const memberNames = new Map(checkinMembers.map((row) => [row.id, memberLabel(row)]));

    // Delete associated check-ins
    const deletedCheckins = await tx
      .delete(checkins)
      .where(eq(checkins.activityId, id))
      .returning();

    const [deletedActivity] = await tx.delete(activities).where(eq(activities.id, id)).returning();

    if (!deletedActivity) {
      throw new Error('Activity not found');
    }

    for (const checkin of deletedCheckins) {
      await writeLog(tx, actor, {
        type: 'checkin.cascade_deleted',
        entity: 'checkins',
        entityId: checkin.id,
        entityLabel: `${memberNames.get(checkin.id) ?? ''}, ${parent.parentLabel}`,
        ...parent,
        changes: snapshot(checkin),
      });
    }
    // Written last so that, newest first, the activity comes before its check-ins.
    await writeLog(tx, actor, {
      type: 'activity.deleted',
      entity: 'activities',
      entityId: deletedActivity.id,
      entityLabel: parent.parentLabel,
      changes: snapshot(deletedActivity),
    });

    return deletedActivity;
  });
}
