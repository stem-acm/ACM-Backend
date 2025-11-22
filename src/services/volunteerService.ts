import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { members, volunteers } from '@/db/schema';
import type {
  VolunteerQueryInput,
  CreateVolunteerInput,
  UpdateVolunteerInput,     
} from '@/schemas/volunteerSchema';

export async function createVolunteer(input: CreateVolunteerInput, createdBy: number) {
  const [newVolunteer] = await db
    .insert(volunteers)
    .values({
      ...input,
      createdBy
    })
    .returning();

  return newVolunteer;
}

export async function getVolunteers(query: VolunteerQueryInput) {
  const { offset, limit, sortBy, order } = query;

  // Get total count
  const countQuery = db.select({ count: sql<number>`count(*)` }).from(volunteers);
  const totalResult = await countQuery;
  const total = Number(totalResult[0]?.count || 0);

  // Build query
  let dataQuery = db.select().from(volunteers);
    
  // Apply sorting
  const orderBy = order === 'desc' ? desc : asc;
  switch (sortBy) {
    case 'memberId':
      dataQuery = dataQuery.orderBy(orderBy(volunteers.memberId)) as typeof dataQuery;
      break;
    case 'joinDate':
      dataQuery = dataQuery.orderBy(orderBy(volunteers.joinDate)) as typeof dataQuery;
      break;
    case 'expirationDate':
      dataQuery = dataQuery.orderBy(orderBy(volunteers.expirationDate)) as typeof dataQuery;
      break;    
    case 'createdAt':
      dataQuery = dataQuery.orderBy(orderBy(volunteers.createdAt)) as typeof dataQuery;
      break;
    default:
      dataQuery = dataQuery.orderBy(orderBy(volunteers.id)) as typeof dataQuery;
  }

  // Apply pagination
  const data = await dataQuery.limit(limit).offset(offset);

   // Get member details for each volunteer
    const volunteersWithMembers = await Promise.all(
      data.map(async (volunteer) => {
        const [member] = await db
          .select()
          .from(members)
          .where(eq(members.id, volunteer.memberId))
          .limit(1);
  
        return {
          ...volunteer,
          Member: member || null
        };
      })
    );

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

  if (input.memberId !== undefined) updateData.memberId = input.memberId;
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
