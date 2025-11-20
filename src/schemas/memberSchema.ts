import { z } from 'zod';

const occupationEnum = z.enum(['student', 'unemployed', 'employee', 'entrepreneur']);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(
    (date) => {
      const parsedDate = new Date(date);
      return !Number.isNaN(parsedDate.getTime());
    },
    { message: 'Invalid date format' }
  );

const pastDateSchema = dateSchema.refine(
  (date) => {
    const parsedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return parsedDate < today;
  },
  { message: 'Date must be in the past' }
);

export const createMemberSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  birthDate: pastDateSchema.optional(),
  birthPlace: z.string().optional(),
  address: z.string().optional(),
  occupation: occupationEnum.optional(),
  phoneNumber: z.string().optional(),
  studyOrWorkPlace: z.string().optional(),
  joinDate: dateSchema.optional(),
  profileImage: z.string().optional(),
});

export const updateMemberSchema = createMemberSchema.partial();

export const memberQuerySchema = z.object({
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 0)),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const parsed = val ? Number.parseInt(val, 10) : 50;
      return Math.min(parsed, 100);
    }),
  search: z.string().optional(),
  sortBy: z.enum(['id', 'firstName', 'lastName', 'joinDate']).optional().default('id'),
  order: z.enum(['asc', 'desc']).optional().default('asc'),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type MemberQueryInput = z.infer<typeof memberQuerySchema>;
