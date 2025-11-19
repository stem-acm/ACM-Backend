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
        firstName: 'John',
        lastName: 'Doe',
        birthDate: '1990-01-15',
        birthPlace: 'New York',
        address: '123 Main St, New York, NY 10001',
        occupation: 'employee' as const,
        phoneNumber: '+1234567890',
        studyOrWorkPlace: 'Tech Corp',
        joinDate: '2023-01-01',
        registrationNumber: 'MEM001',
      },
      {
        firstName: 'Jane',
        lastName: 'Smith',
        birthDate: '1995-05-20',
        birthPlace: 'Los Angeles',
        address: '456 Oak Ave, Los Angeles, CA 90001',
        occupation: 'student' as const,
        phoneNumber: '+1234567891',
        studyOrWorkPlace: 'State University',
        joinDate: '2023-02-01',
        registrationNumber: 'MEM002',
      },
      {
        firstName: 'Michael',
        lastName: 'Johnson',
        birthDate: '1988-08-10',
        birthPlace: 'Chicago',
        address: '789 Elm St, Chicago, IL 60601',
        occupation: 'entrepreneur' as const,
        phoneNumber: '+1234567892',
        studyOrWorkPlace: 'Startup Inc',
        joinDate: '2023-03-15',
        registrationNumber: 'MEM003',
      },
      {
        firstName: 'Sarah',
        lastName: 'Williams',
        birthDate: '1992-12-05',
        birthPlace: 'Boston',
        address: '321 Pine Rd, Boston, MA 02101',
        occupation: 'unemployed' as const,
        phoneNumber: '+1234567893',
        studyOrWorkPlace: null,
        joinDate: '2023-04-10',
        registrationNumber: 'MEM004',
      },
      {
        firstName: 'David',
        lastName: 'Brown',
        birthDate: '1985-03-22',
        birthPlace: 'Seattle',
        address: '654 Maple Dr, Seattle, WA 98101',
        occupation: 'employee' as const,
        phoneNumber: '+1234567894',
        studyOrWorkPlace: 'Microsoft',
        joinDate: '2023-05-20',
        registrationNumber: 'MEM005',
      },
    ];

    const insertedMembers = await db.insert(members).values(membersData).returning();

    console.log(`Created ${insertedMembers.length} sample members`);

    // Create sample activities
    const activitiesData = [
      {
        name: 'Tech Workshop',
        description: 'Hands-on workshop on modern web development technologies',
        isPeriodic: true,
        dayOfWeek: 'tuesday' as const,
        startTime: '10:00:00',
        endTime: '12:00:00',
        createdBy: adminUser.id,
      },
      {
        name: 'Monthly Meeting',
        description: 'Regular monthly organization meeting',
        isPeriodic: true,
        dayOfWeek: 'saturday' as const,
        startTime: '13:00:00',
        endTime: '16:00:00',
        createdBy: adminUser.id,
      },
      {
        name: 'Networking Event',
        description: 'Professional networking and social gathering',
        isPeriodic: false,
        startDate: '2025-11-19',
        endDate: '2025-11-19',
        startTime: '10:00:00',
        endTime: '12:00:00',
        createdBy: adminUser.id,
      },
      {
        name: 'Training Session',
        description: 'Leadership and communication skills training',
        isPeriodic: false,
        startDate: '2025-11-24',
        endDate: '2025-11-26',
        startTime: '10:00:00',
        endTime: '12:00:00',
        createdBy: adminUser.id,
      },
      {
        name: 'Old Event',
        description: 'This event is no longer active',
        isPeriodic: true,
        dayOfWeek: 'wednesday' as const,
        startTime: '13:00:00',
        endTime: '16:00:00',
        createdBy: adminUser.id,
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
      {
        memberId: insertedMembers[4].id,
        activityId: insertedActivities[3].id,
        checkInTime: new Date(yesterday.getTime() - 4 * 60 * 60 * 1000),
        checkOutTime: new Date(yesterday.getTime() - 2 * 60 * 60 * 1000),
        visitReason: 'Skills development training',
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
