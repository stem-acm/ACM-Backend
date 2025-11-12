import { z } from 'zod';

export const createActivitySchema = z.object({
  name: z
    .string()
    .min(1, 'Activity name is required')
    .max(255, 'Activity name must be less than 255 characters'),
  description: z.string().optional(),
  image: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateActivitySchema = createActivitySchema.partial();

export const activityQuerySchema = z.object({
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
  isActive: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),
  sortBy: z.enum(['id', 'name', 'createdAt']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
export type ActivityQueryInput = z.infer<typeof activityQuerySchema>;
