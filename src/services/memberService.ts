import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { checkins, members } from '@/db/schema';
import type {
  CreateMemberInput,
  MemberQueryInput,
  UpdateMemberInput,
} from '@/schemas/memberSchema';

export async function createMember(input: CreateMemberInput) {
  const [newMember] = await db
    .insert(members)
    .values({
      ...input,
      registrationNumber: '', // Will be updated after insert
    })
    .returning();

  // Update registration number based on ID
  const [updatedMember] = await db
    .update(members)
    .set({ registrationNumber: "ACMJN-" + `${newMember.id.toString()}`.padStart(6, '0') })
    .where(eq(members.id, newMember.id))
    .returning();

  return updatedMember;
}

export async function getMembers(query: MemberQueryInput) {
  const { offset, limit, search, sortBy, order } = query;

  // Build where conditions
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(members.firstName, `%${search}%`),
        like(members.lastName, `%${search}%`),
        like(members.registrationNumber, `%${search}%`)
      )
    );
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
      dataQuery = dataQuery.orderBy(orderBy(members.id)) as typeof dataQuery;
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
  const [member] = await db.select().from(members).where(eq(members.id, id)).limit(1);
  return member || null;
}

export async function getMemberByRegistrationNumber(registrationNumber: string) {
  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.registrationNumber, registrationNumber))
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
    .where(eq(members.id, id))
    .returning();

  if (!updatedMember) {
    throw new Error('Member not found');
  }

  return updatedMember;
}

export async function deleteMember(id: number) {
  // Check if member has associated check-ins
  const [checkin] = await db.select().from(checkins).where(eq(checkins.memberId, id)).limit(1);

  if (checkin) {
    throw new Error('Cannot delete member with associated check-ins');
  }

  const [deletedMember] = await db.delete(members).where(eq(members.id, id)).returning();

  if (!deletedMember) {
    throw new Error('Member not found');
  }

  return deletedMember;
}
