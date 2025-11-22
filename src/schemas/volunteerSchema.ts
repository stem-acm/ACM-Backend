import { z } from 'zod';

export const createVolunteerSchema = z.object({
  memberId: z.number(),
  joinDate: z.string().date().nullable(),
  expirationDate: z.string().date().nullable(),
  createdBy: z.number(),
});

export const updateVolunteerSchema = createVolunteerSchema.partial();

export const volunteerQuerySchema = z.object({
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
  sortBy: z
    .enum(['id', 'memberId', 'joinDate', 'expirationDate', 'createdAt'])
    .optional()
    .default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});
export type CreateVolunteerInput = z.infer<typeof createVolunteerSchema>;
export type UpdateVolunteerInput = z.infer<typeof updateVolunteerSchema>;
export type VolunteerQueryInput = z.infer<typeof volunteerQuerySchema>;
