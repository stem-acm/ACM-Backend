import {
  boolean,
  date,
  index,
  integer,
  jsonb,
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
  'everyday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]);

// Title enum
export const titleEnum = pgEnum('title', ['Miss', 'Mr', 'Mrs']);

// Gender enum
export const genderEnum = pgEnum('gender', ['male', 'female']);

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: varchar('role', { length: 20 }).notNull().default('volunteer'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const rolePolicies = pgTable('role_policies', {
  role: varchar('role', { length: 20 }).primaryKey(),
  active: boolean('active').notNull().default(true),
  permissions: jsonb('permissions').$type<Record<string, boolean>>().notNull().default({}),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Members table
export const members = pgTable('members', {
  registrationNumber: serial('registration_number').primaryKey(),
  firstName: varchar('first_name', { length: 255 }).notNull(),
  lastName: varchar('last_name', { length: 255 }),
  title: titleEnum('title'),
  gender: genderEnum('gender'),
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
  registrationNumber: integer('registration_number')
    .notNull()
    .references(() => members.registrationNumber),
  activityId: integer('activity_id')
    .notNull()
    .references(() => activities.id),
  checkInTime: timestamp('check_in_time').notNull().defaultNow(),
  checkOutTime: timestamp('check_out_time'),
  visitReason: varchar('visit_reason', { length: 500 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const volunteers = pgTable('volunteers', {
  id: serial('id').primaryKey(),
  registrationNumber: integer('registration_number').references(() => members.registrationNumber),
  joinDate: date('join_date'),
  role: varchar('role', { length: 255 }),
  expirationDate: date('expiration_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
});

export const bookLoans = pgTable('book_loans', {
  id: serial('id').primaryKey(),
  registrationNumber: integer('registration_number')
    .notNull()
    .references(() => members.registrationNumber),
  bookTitle: varchar('book_title', { length: 255 }).notNull(),
  borrowingDate: date('borrowing_date').notNull(),
  expectedReturnDate: date('expected_return_date').notNull(),
  effectiveReturnDate: date('effective_return_date'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Audit logs: one row per logged insert, update or delete. Rows are only added, never changed.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    actorId: integer('actor_id').notNull(),
    actorUsername: varchar('actor_username', { length: 255 }).notNull(),
    actorRole: varchar('actor_role', { length: 20 }).notNull(),
    type: varchar('type', { length: 64 }).notNull(),
    entity: varchar('entity', { length: 64 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull(),
    entityLabel: varchar('entity_label', { length: 1024 }).notNull(),
    parentEntity: varchar('parent_entity', { length: 64 }),
    parentId: varchar('parent_id', { length: 64 }),
    parentLabel: varchar('parent_label', { length: 1024 }),
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index('audit_logs_created_at_idx').on(table.createdAt),
    index('audit_logs_type_idx').on(table.type),
    index('audit_logs_entity_entity_id_idx').on(table.entity, table.entityId),
    index('audit_logs_actor_id_idx').on(table.actorId),
  ]
);

// Type exports for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;

export type Checkin = typeof checkins.$inferSelect;
export type NewCheckin = typeof checkins.$inferInsert;

export type Volunteer = typeof volunteers.$inferSelect;
export type NewVolunteer = typeof volunteers.$inferInsert;

export type BookLoan = typeof bookLoans.$inferSelect;
export type NewBookLoan = typeof bookLoans.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
