import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

// Occupation enum
export const occupationEnum = pgEnum('occupation', [
  'student',
  'unemployed',
  'employee',
  'entrepreneur',
]);

// Day of week enum
export const dayOfWeekEnum = pgEnum('day_of_week', [
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]);

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Members table
export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  registrationNumber: varchar('registration_number', { length: 255 }).notNull().unique(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }).notNull(),
  birthDate: date('birth_date'),
  birthPlace: varchar('birth_place', { length: 255 }),
  address: text('address'),
  occupation: occupationEnum('occupation'),
  phoneNumber: varchar('phone_number', { length: 255 }),
  studyOrWorkPlace: varchar('study_or_work_place', { length: 255 }),
  joinDate: date('join_date'),
  profileImage: varchar('profile_image', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Activities table
export const activities = pgTable('activities', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  image: varchar('image', { length: 500 }),
  emoji: varchar('emoji', { length: 10 }),
  //isActive: boolean('is_active').notNull().default(true),
  isPeriodic: boolean('is_periodic').notNull().default(true),
  dayOfWeek: dayOfWeekEnum('day_of_week'),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Checkins table
export const checkins = pgTable('checkins', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id')
    .notNull()
    .references(() => members.id),
  activityId: integer('activity_id')
    .notNull()
    .references(() => activities.id),
  checkInTime: timestamp('check_in_time').notNull().defaultNow(),
  checkOutTime: timestamp('check_out_time'),
  visitReason: varchar('visit_reason', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Type exports for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;

export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;
