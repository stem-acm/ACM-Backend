import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';
import { db } from '@/db/drizzle';
import { activities, checkins, members, users } from '@/db/schema';

async function seed() {
  try {
    console.log('Starting database seed...');

    // Clear existing data using TRUNCATE CASCADE (handles foreign keys automatically)
    console.log('Clearing existing data...');
    await db.execute(
      sql`TRUNCATE TABLE checkins, activities, members, users RESTART IDENTITY CASCADE`
    );
    console.log('Existing data cleared');

    // Create admin user
    const hashedPassword = await bcrypt.hash('password123', 10);
    const [adminUser] = await db
      .insert(users)
      .values({
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
      })
      .returning();

    console.log('Created admin user:', adminUser.username);

    // Create sample members with diverse data
    const membersData = [
      {
        firstName: 'Linus',
        lastName: 'Torvalds',
        birthDate: '1998-04-16',
        birthPlace: 'New York',
        address: '123 Main St, New York, NY 10001',
        occupation: 'entrepreneur' as const,
        phoneNumber: '555-123-4567',
        studyOrWorkPlace: 'NY University',
        joinDate: '2022-03-10',
        registrationNumber: 'ACMJN-000001',
        profileImage: "",
      },
      {
        firstName: 'Emily',
        lastName: 'Johnson',
        birthDate: '2000-07-09',
        birthPlace: 'Los Angeles',
        address: '45 Sunset Blwd, Los Angeles, CA 90001',
        occupation: 'student' as const,
        phoneNumber: '555-987-6543',
        studyOrWorkPlace: 'UCLA',
        joinDate: '2023-01-12',
        registrationNumber: 'ACMJN-000002',
        profileImage: "",
      },
      {
        firstName: 'Michael',
        lastName: 'Brown',
        birthDate: '1995-02-20',
        birthPlace: 'Chicago',
        address: '67 Lakeview Ave, Chicago, IL 60601',
        occupation: 'employee' as const,
        phoneNumber: '555-111-2222',
        studyOrWorkPlace: 'TechCorp',
        joinDate: '2021-11-05',
        registrationNumber: 'ACMJN-000003',
        profileImage: "",
      },
      {
        firstName: 'Sarah',
        lastName: 'Davis',
        birthDate: '1999-10-30',
        birthPlace: 'Houston',
        address: '12 Greenway, Houston, TX 77002',
        occupation: 'student' as const,
        phoneNumber: '555-333-4444',
        studyOrWorkPlace: 'Houston University',
        joinDate: '2023-06-10',
        registrationNumber: 'ACMJN-000004',
        profileImage: "",
      },
    ];

    const insertedMembers = await db.insert(members).values(membersData).returning();

    console.log(`Created ${insertedMembers.length} sample members`);

    // Create sample activities
    const activitiesData = [
      {
        emoji: '💻',
        name: 'Tech Workshop',
        description: 'Hands-on workshop on modern web development technologies',
        isPeriodic: true,
        dayOfWeek: 'tuesday' as const,
        startTime: '10:00:00',
        endTime: '12:00:00',
        createdBy: adminUser.id,
        image: "",
      },
      {
        emoji: '👥',
        name: 'Monthly Meeting',
        description: 'Regular monthly organization meeting',
        isPeriodic: true,
        dayOfWeek: 'saturday' as const,
        startTime: '13:00:00',
        endTime: '16:00:00',
        createdBy: adminUser.id,
        image: "",
      },
      {
        emoji: '🤝',
        name: 'Networking Event',
        description: 'Professional networking and social gathering',
        isPeriodic: false,
        startDate: '2025-11-19',
        endDate: '2025-11-19',
        startTime: '10:00:00',
        endTime: '12:00:00',
        createdBy: adminUser.id,
        image: "",
      },
      {
        emoji: '🎓',
        name: 'Training Session',
        description: 'Leadership and communication skills training',
        isPeriodic: false,
        startDate: '2025-11-24',
        endDate: '2025-11-26',
        startTime: '10:00:00',
        endTime: '12:00:00',
        createdBy: adminUser.id,
        image: "",
      },
      {
        emoji: '🎓',
        name: 'Old Event',
        description: 'This event is no longer active',
        isPeriodic: true,
        dayOfWeek: 'wednesday' as const,
        startTime: '13:00:00',
        endTime: '16:00:00',
        createdBy: adminUser.id,
        image: "",
      },
    ];

    const insertedActivities = await db.insert(activities).values(activitiesData).returning();

    console.log(`Created ${insertedActivities.length} sample activities`);

    // Create sample check-ins with realistic timestamps
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const checkinsData = [
      // Today's check-ins (some with check-out)
      {
        memberId: insertedMembers[0].id,
        activityId: insertedActivities[0].id,
        checkInTime: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
        checkOutTime: new Date(now.getTime() - 30 * 60 * 1000), // 30 minutes ago
        visitReason: 'Attending tech workshop',
      },
      {
        memberId: insertedMembers[1].id,
        activityId: insertedActivities[0].id,
        checkInTime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        checkOutTime: null,
        visitReason: 'Learning new technologies',
      },
      {
        memberId: insertedMembers[2].id,
        activityId: insertedActivities[1].id,
        checkInTime: new Date(now.getTime() - 3 * 60 * 60 * 1000), // 3 hours ago
        checkOutTime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        visitReason: 'Monthly organization meeting',
      },
      // Yesterday's check-ins
      {
        memberId: insertedMembers[3].id,
        activityId: insertedActivities[2].id,
        checkInTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000),
        checkOutTime: new Date(yesterday.getTime() - 30 * 60 * 1000),
        visitReason: 'Networking with professionals',
      },
      // Last week's check-ins
      {
        memberId: insertedMembers[0].id,
        activityId: insertedActivities[1].id,
        checkInTime: new Date(lastWeek.getTime() - 2 * 60 * 60 * 1000),
        checkOutTime: new Date(lastWeek.getTime() - 1 * 60 * 60 * 1000),
        visitReason: 'Monthly meeting attendance',
      },
      {
        memberId: insertedMembers[1].id,
        activityId: insertedActivities[2].id,
        checkInTime: new Date(lastWeek.getTime() - 3 * 60 * 60 * 1000),
        checkOutTime: null,
        visitReason: 'Building professional connections',
      },
      // Two weeks ago
      {
        memberId: insertedMembers[2].id,
        activityId: insertedActivities[0].id,
        checkInTime: new Date(twoWeeksAgo.getTime() - 2 * 60 * 60 * 1000),
        checkOutTime: new Date(twoWeeksAgo.getTime() - 30 * 60 * 1000),
        visitReason: 'Previous workshop session',
      },
    ];

    await db.insert(checkins).values(checkinsData);

    console.log(`Created ${checkinsData.length} sample check-ins`);
    console.log('Database seed completed successfully!');
  } catch (error: unknown) {
    console.error('Error seeding database:', error);

    // Provide helpful error message for connection issues
    if (error instanceof Error && 'cause' in error) {
      const cause = (error as { cause?: unknown }).cause;
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOTFOUND') {
        console.error('\n❌ Database connection failed!');
        console.error('The hostname in your DATABASE_URL cannot be resolved.');
        console.error('\n💡 Solutions:');
        console.error('1. For local development, ensure your .env has:');
        console.error('   DATABASE_URL=postgresql://acm_user:acm_password@localhost:5434/acm_db');
        console.error('2. Make sure PostgreSQL is running (docker-compose up -d postgres)');
        console.error(
          '3. Or run the seed script inside Docker: docker-compose exec backend pnpm seed'
        );
      }
    }

    throw error;
  }
}

seed()
  .then(() => {
    console.log('Seed script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  });
