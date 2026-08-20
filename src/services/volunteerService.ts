import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { members, volunteers } from '@/db/schema';
import type {
  CreateVolunteerInput,
  UpdateVolunteerInput,
  VolunteerQueryInput,
} from '@/schemas/volunteerSchema';

export async function createVolunteer(input: CreateVolunteerInput, createdBy: number) {
  if (Array.isArray(input)) {
    const allVolunteers: Array<{
      registrationNumber: number | null;
      joinDate: string | null;
      role: string | null;
      expirationDate: string | null;
      createdBy: number;
    }> = input.map((volunteer) => ({
      ...volunteer,
      createdBy,
    }));

    const newVolunteers = await db.insert(volunteers).values(allVolunteers).returning();

    return newVolunteers;
  } else {
    const [newVolunteer] = await db
      .insert(volunteers)
      .values({
        ...input,
        createdBy,
      })
      .returning();

    return newVolunteer;
  }
}

export async function getVolunteers(query: VolunteerQueryInput) {
  const { offset, limit, search, sortBy, order } = query;

  // Build where conditions
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(members.firstName, `%${search}%`),
        ilike(members.lastName, `%${search}%`),
        ilike(sql<string>`cast(${volunteers.registrationNumber} as text)`, `%${search}%`)
      )
    );
  }

  // Get total count with search filter
  let countQuery = db
    .select({ count: sql<number>`count(*)` })
    .from(volunteers)
    .leftJoin(members, eq(volunteers.registrationNumber, members.registrationNumber));
  if (conditions.length > 0) {
    countQuery = countQuery.where(and(...conditions)) as typeof countQuery;
  }
  const totalResult = await countQuery;
  const total = Number(totalResult[0]?.count || 0);

  // Build query with LEFT JOIN
  let dataQuery = db
    .select()
    .from(volunteers)
    .leftJoin(members, eq(volunteers.registrationNumber, members.registrationNumber));
  if (conditions.length > 0) {
    dataQuery = dataQuery.where(and(...conditions)) as typeof dataQuery;
  }

  // Apply sorting
  const orderByFn = order === 'desc' ? desc : asc;
  switch (sortBy) {
    case 'registrationNumber':
      dataQuery = dataQuery.orderBy(orderByFn(volunteers.registrationNumber)) as typeof dataQuery;
      break;
    case 'joinDate':
      dataQuery = dataQuery.orderBy(orderByFn(volunteers.joinDate)) as typeof dataQuery;
      break;
    case 'expirationDate':
      dataQuery = dataQuery.orderBy(orderByFn(volunteers.expirationDate)) as typeof dataQuery;
      break;
    case 'createdAt':
      dataQuery = dataQuery.orderBy(orderByFn(volunteers.createdAt)) as typeof dataQuery;
      break;
    default:
      dataQuery = dataQuery.orderBy(orderByFn(volunteers.id)) as typeof dataQuery;
  }

  // Apply pagination
  const results = await dataQuery.limit(limit).offset(offset);

  // Map joined results to the expected format
  const volunteersWithMembers = results.map((row) => ({
    ...row.volunteers,
    Member: row.members,
  }));

  return {
    data: volunteersWithMembers,
    pagination: {
      offset,
      limit,
      total,
      hasMore: offset + limit < total,
    },
  };
}

export async function getVolunteerById(id: number) {
  const [volunteer] = await db.select().from(volunteers).where(eq(volunteers.id, id)).limit(1);
  return volunteer || null;
}

export async function updateVolunteer(id: number, input: UpdateVolunteerInput) {
  // Build update object with only defined fields
  const updateData: Partial<UpdateVolunteerInput> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (input.registrationNumber !== undefined)
    updateData.registrationNumber = input.registrationNumber;
  if (input.joinDate !== undefined) updateData.joinDate = input.joinDate;
  if (input.expirationDate !== undefined) updateData.expirationDate = input.expirationDate;

  const [updatedVolunteer] = await db
    .update(volunteers)
    .set(updateData)
    .where(eq(volunteers.id, id))
    .returning();

  if (!updatedVolunteer) {
    throw new Error('Volunteer not found');
  }

  return updatedVolunteer;
}

export async function deleteVolunteer(id: number) {
  const [deletedVolunteer] = await db.delete(volunteers).where(eq(volunteers.id, id)).returning();

  if (!deletedVolunteer) {
    throw new Error('Volunteer not found');
  }

  return deletedVolunteer;
}
