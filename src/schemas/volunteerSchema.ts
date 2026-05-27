import { z } from 'zod';

// Base volunteer object schema (without createdBy - that's added server-side)
const volunteerObjectSchema = z.object({
  registrationNumber: z.number().nullable(),
  role: z.string().nullable(),
  joinDate: z.string().date().nullable(),
  expirationDate: z.string().date().nullable(),
});

// Schema for creating volunteers (can be array or single object)
export const createVolunteerSchema = z.union([
  z.array(volunteerObjectSchema),
  volunteerObjectSchema,
]);

// Schema for updating a volunteer (all fields optional)
export const updateVolunteerSchema = volunteerObjectSchema.partial();

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
    .enum(['id', 'registrationNumber', 'role', 'joinDate', 'expirationDate', 'createdAt'])
    .optional()
    .default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});
export type CreateVolunteerInput = z.infer<typeof createVolunteerSchema>;
export type UpdateVolunteerInput = z.infer<typeof updateVolunteerSchema>;
export type VolunteerQueryInput = z.infer<typeof volunteerQuerySchema>;
