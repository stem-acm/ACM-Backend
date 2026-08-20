import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { checkins, members, volunteers } from '@/db/schema';
import type {
  CreateMemberInput,
  MemberQueryInput,
  UpdateMemberInput,
} from '@/schemas/memberSchema';

export async function createMember(input: CreateMemberInput) {
  const [newMember] = await db.insert(members).values(input).returning();

  return newMember;
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
    .map((r) => r.value.trim())
    .filter((place) => {
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

export async function updateMember(id: number, input: UpdateMemberInput) {
  const [updatedMember] = await db
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

  return updatedMember;
}

export async function deleteMember(id: number) {
  // Delete associated check-ins
  await db.delete(checkins).where(eq(checkins.registrationNumber, id));

  // Delete associated volunteer records
  await db.delete(volunteers).where(eq(volunteers.registrationNumber, id));

  const [deletedMember] = await db
    .delete(members)
    .where(eq(members.registrationNumber, id))
    .returning();

  if (!deletedMember) {
    throw new Error('Member not found');
  }

  return deletedMember;
}
