import { z } from 'zod';

const isoDateTimeSchema = z
  .string()
  .datetime({ message: 'Invalid ISO 8601 datetime format' })
  .optional();

export const createCheckinSchema = z
  .object({
    registrationNumber: z.string().min(1, 'Registration number is required'),
    activityId: z.number().int().positive('Activity ID must be a positive integer'),
    checkInTime: isoDateTimeSchema,
    checkOutTime: isoDateTimeSchema,
    visitReason: z.string().max(500, 'Visit reason must be less than 500 characters').optional(),
  })
  .refine(
    (data) => {
      if (data.checkInTime && data.checkOutTime) {
        return new Date(data.checkOutTime) > new Date(data.checkInTime);
      }
      return true;
    },
    {
      message: 'Check-out time must be after check-in time',
      path: ['checkOutTime'],
    }
  );

export const checkinQuerySchema = z.object({
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 0)),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = val ? Number.parseInt(val, 10) : 50;
      return Math.min(parsed, 100); // Max 100
    }),
  memberId: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : undefined)),
  activityId: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : undefined)),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  sortBy: z.enum(['id', 'checkInTime', 'createdAt']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateCheckinInput = z.infer<typeof createCheckinSchema>;
export type CheckinQueryInput = z.infer<typeof checkinQuerySchema>;
