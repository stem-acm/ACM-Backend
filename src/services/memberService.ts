import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activities, checkins, members, volunteers } from '@/db/schema';
import type {
  CreateMemberInput,
  MemberQueryInput,
  UpdateMemberInput,
} from '@/schemas/memberSchema';
import { type Actor, diffRows, memberLabel, snapshot, writeLog } from '@/services/auditService';
import { signQRCode } from '@/utils/qrUtils';

type MemberPhotoInput = { profileImage?: string | null };

export async function createMember(input: CreateMemberInput & MemberPhotoInput, actor: Actor) {
  return db.transaction(async (tx) => {
    const [newMember] = await tx.insert(members).values(input).returning();
    await writeLog(tx, actor, {
      type: 'member.created',
      entity: 'members',
      entityId: newMember.registrationNumber,
      entityLabel: memberLabel(newMember),
      changes: snapshot(newMember),
    });
    return newMember;
  });
}

export async function getStudyPlaces() {
  const rows = await db
    .selectDistinct({ value: members.studyOrWorkPlace })
    .from(members)
    .where(
      and(sql`${members.studyOrWorkPlace} IS NOT NULL`, sql`${members.studyOrWorkPlace} != ''`)
    )
    .orderBy(members.studyOrWorkPlace);

  // Deduplicate case-insensitively and trim whitespace
  // (PG SELECT DISTINCT is case-sensitive and treats trailing spaces as significant)
  const seen = new Set<string>();
  return rows
    .map((r) => r.value?.trim() ?? '')
    .filter((place) => {
      if (!place) return false;
      const key = place.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort();
}

export async function getMembers(query: MemberQueryInput) {
  const { offset, limit, search, studyPlaces, sortBy, order } = query;

  // Build where conditions
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(members.firstName, `%${search}%`),
        ilike(members.lastName, `%${search}%`),
        ilike(sql<string>`cast(${members.registrationNumber} as text)`, `%${search}%`)
      )
    );
  }
  if (studyPlaces) {
    const places = studyPlaces
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (places.length > 0) {
      conditions.push(inArray(members.studyOrWorkPlace, places));
    }
  }

  // Get total count
  let countQuery = db.select({ count: sql<number>`count(*)` }).from(members);
  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
  }
  const totalResult = await countQuery;
  const total = Number(totalResult[0]?.count || 0);

  // Build query
  let dataQuery = db.select().from(members);
  if (conditions.length > 0) {
    dataQuery = dataQuery.where(and(...conditions)) as typeof dataQuery;
  }

  // Apply sorting
  const orderBy = order === 'desc' ? desc : asc;
  switch (sortBy) {
    case 'firstName':
      dataQuery = dataQuery.orderBy(orderBy(members.firstName)) as typeof dataQuery;
      break;
    case 'lastName':
      dataQuery = dataQuery.orderBy(orderBy(members.lastName)) as typeof dataQuery;
      break;
    case 'joinDate':
      dataQuery = dataQuery.orderBy(orderBy(members.joinDate)) as typeof dataQuery;
      break;
    default:
      dataQuery = dataQuery.orderBy(orderBy(members.registrationNumber)) as typeof dataQuery;
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

export async function getMemberById(id: number) {
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.registrationNumber, id))
    .limit(1);
  return member || null;
}

export async function getMemberByRegistrationNumber(registrationNumber: string) {
  const parsedRegNum = Number.parseInt(registrationNumber, 10);
  if (Number.isNaN(parsedRegNum)) {
    return null;
  }
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.registrationNumber, parsedRegNum))
    .limit(1);
  return member || null;
}

export async function updateMember(
  id: number,
  input: UpdateMemberInput & MemberPhotoInput,
  actor: Actor
) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(members)
      .where(eq(members.registrationNumber, id))
      .limit(1);
    if (!before) {
      throw new Error('Member not found');
    }

    const [updatedMember] = await tx
      .update(members)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(members.registrationNumber, id))
      .returning();

    if (!updatedMember) {
      throw new Error('Member not found');
    }

    const changes = diffRows(before, updatedMember);
    if (Object.keys(changes).length > 0) {
      await writeLog(tx, actor, {
        type: 'member.updated',
        entity: 'members',
        entityId: updatedMember.registrationNumber,
        entityLabel: memberLabel(updatedMember),
        changes,
      });
    }
    return updatedMember;
  });
}

export async function isMemberPhotoReferenced(reference: string) {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(members)
    .where(eq(members.profileImage, reference));
  return Number(count ?? 0) > 0;
}

export function getQRCodeData(registrationNumber: number) {
  return signQRCode(registrationNumber);
}

export async function deleteMember(id: number, actor: Actor) {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(members)
      .where(eq(members.registrationNumber, id))
      .limit(1);
    if (!member) {
      throw new Error('Member not found');
    }
    const parent = {
      parentEntity: 'members' as const,
      parentId: member.registrationNumber,
      parentLabel: memberLabel(member),
    };

    // Resolve the labels of the linked rows before they are deleted.
    const checkinActivities = await tx
      .select({ id: checkins.id, activityName: activities.name })
      .from(checkins)
      .innerJoin(activities, eq(checkins.activityId, activities.id))
      .where(eq(checkins.registrationNumber, id));
    const activityNames = new Map(checkinActivities.map((row) => [row.id, row.activityName]));

    // Delete associated check-ins
    const deletedCheckins = await tx
      .delete(checkins)
      .where(eq(checkins.registrationNumber, id))
      .returning();

    // Delete associated volunteer records
    const deletedVolunteers = await tx
      .delete(volunteers)
      .where(eq(volunteers.registrationNumber, id))
      .returning();

    const [deletedMember] = await tx
      .delete(members)
      .where(eq(members.registrationNumber, id))
      .returning();

    if (!deletedMember) {
      throw new Error('Member not found');
    }

    for (const checkin of deletedCheckins) {
      await writeLog(tx, actor, {
        type: 'checkin.cascade_deleted',
        entity: 'checkins',
        entityId: checkin.id,
        entityLabel: `${parent.parentLabel}, ${activityNames.get(checkin.id) ?? ''}`,
        ...parent,
        changes: snapshot(checkin),
      });
    }
    for (const volunteer of deletedVolunteers) {
      await writeLog(tx, actor, {
        type: 'volunteer.cascade_deleted',
        entity: 'volunteers',
        entityId: volunteer.id,
        entityLabel: parent.parentLabel,
        ...parent,
        changes: snapshot(volunteer),
      });
    }
    // Written last so that, newest first, the member comes before its linked rows.
    await writeLog(tx, actor, {
      type: 'member.deleted',
      entity: 'members',
      entityId: deletedMember.registrationNumber,
      entityLabel: parent.parentLabel,
      changes: snapshot(deletedMember),
    });

    return deletedMember;
  });
}
