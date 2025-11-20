import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activities, checkins, members } from '@/db/schema';

export async function getDashboardStats(date?: string) {
  // Parse date or use today
  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0);
  const startOfDay = new Date(targetDate);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  // Get check-ins for the date
  const checkinsList = await db
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
    .from(checkins)
    .where(and(gte(checkins.checkInTime, startOfDay), lte(checkins.checkInTime, endOfDay)));

  // Get member and activity details for each check-in
  const checkinsWithDetails = await Promise.all(
    checkinsList.map(async (checkin) => {
      const [member] = await db
        .select()
        .from(members)
        .where(eq(members.id, checkin.memberId))
        .limit(1);

      const [activity] = await db
        .select()
        .from(activities)
        .where(eq(activities.id, checkin.activityId))
        .limit(1);

      return {
        ...checkin,
        Member: member || null,
        Activity: activity || null,
      };
    })
  );

  // Get total counts
  const [membersCount] = await db.select({ count: sql<number>`count(*)` }).from(members);

  const [activitiesCount] = await db.select({ count: sql<number>`count(*)` }).from(activities);

  return {
    checkins: checkinsWithDetails,
    members: Number(membersCount?.count || 0),
    activities: Number(activitiesCount?.count || 0),
  };
}
