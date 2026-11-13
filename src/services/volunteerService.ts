import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { members, volunteers } from '@/db/schema';
import type {
  CreateVolunteerInput,
  UpdateVolunteerInput,
  VolunteerQueryInput,
} from '@/schemas/volunteerSchema';
import {
  type Actor,
  diffRows,
  memberLabel,
  snapshot,
  type Transaction,
  VOLUNTEER_WITHOUT_MEMBER_LABEL,
  writeLog,
} from '@/services/auditService';

/** Labels of volunteer rows: the member name, or a constant text without a member. */
async function volunteerLabels(tx: Transaction, registrationNumbers: (number | null)[]) {
  const numbers = [...new Set(registrationNumbers.filter((n): n is number => n !== null))];
  const rows = numbers.length
    ? await tx
        .select({
          registrationNumber: members.registrationNumber,
          firstName: members.firstName,
          lastName: members.lastName,
        })
        .from(members)
        .where(inArray(members.registrationNumber, numbers))
    : [];
  const names = new Map(rows.map((row) => [row.registrationNumber, memberLabel(row)]));
  return (registrationNumber: number | null) =>
    (registrationNumber !== null ? names.get(registrationNumber) : undefined) ??
    VOLUNTEER_WITHOUT_MEMBER_LABEL;
}

export async function createVolunteer(input: CreateVolunteerInput, actor: Actor) {
  const rows = (Array.isArray(input) ? input : [input]).map((volunteer) => ({
    ...volunteer,
    createdBy: actor.id,
  }));

  const newVolunteers = await db.transaction(async (tx) => {
    const created = await tx.insert(volunteers).values(rows).returning();
    const labelOf = await volunteerLabels(
      tx,
      created.map((volunteer) => volunteer.registrationNumber)
    );
    // One log for each inserted row.
    for (const volunteer of created) {
      await writeLog(tx, actor, {
        type: 'volunteer.created',
        entity: 'volunteers',
        entityId: volunteer.id,
        entityLabel: labelOf(volunteer.registrationNumber),
        changes: snapshot(volunteer),
      });
    }
    return created;
  });

  return Array.isArray(input) ? newVolunteers : newVolunteers[0];
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
  const [result] = await db
    .select()
    .from(volunteers)
    .leftJoin(members, eq(volunteers.registrationNumber, members.registrationNumber))
    .where(eq(volunteers.id, id))
    .limit(1);
  return result ? { ...result.volunteers, Member: result.members } : null;
}

export async function updateVolunteer(id: number, input: UpdateVolunteerInput, actor: Actor) {
  // Build update object with only defined fields
  const updateData: Partial<UpdateVolunteerInput> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (input.registrationNumber !== undefined)
    updateData.registrationNumber = input.registrationNumber;
  if (input.joinDate !== undefined) updateData.joinDate = input.joinDate;
  if (input.expirationDate !== undefined) updateData.expirationDate = input.expirationDate;

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(volunteers).where(eq(volunteers.id, id)).limit(1);
    if (!before) {
      throw new Error('Volunteer not found');
    }

    const [updatedVolunteer] = await tx
      .update(volunteers)
      .set(updateData)
      .where(eq(volunteers.id, id))
      .returning();

    if (!updatedVolunteer) {
      throw new Error('Volunteer not found');
    }

    const changes = diffRows(before, updatedVolunteer);
    if (Object.keys(changes).length > 0) {
      const labelOf = await volunteerLabels(tx, [updatedVolunteer.registrationNumber]);
      await writeLog(tx, actor, {
        type: 'volunteer.updated',
        entity: 'volunteers',
        entityId: updatedVolunteer.id,
        entityLabel: labelOf(updatedVolunteer.registrationNumber),
        changes,
      });
    }
    return updatedVolunteer;
  });
}

export async function deleteVolunteer(id: number, actor: Actor) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(volunteers).where(eq(volunteers.id, id)).limit(1);
    if (!before) {
      throw new Error('Volunteer not found');
    }
    // Resolve the label before the row is deleted.
    const labelOf = await volunteerLabels(tx, [before.registrationNumber]);

    const [deletedVolunteer] = await tx.delete(volunteers).where(eq(volunteers.id, id)).returning();

    if (!deletedVolunteer) {
      throw new Error('Volunteer not found');
    }

    await writeLog(tx, actor, {
      type: 'volunteer.deleted',
      entity: 'volunteers',
      entityId: deletedVolunteer.id,
      entityLabel: labelOf(deletedVolunteer.registrationNumber),
      changes: snapshot(deletedVolunteer),
    });

    return deletedVolunteer;
  });
}
