import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'errors.UsernameMust3Characters')
    .regex(/^[a-zA-Z0-9]+$/, 'errors.UsernameMustAlphanumeric'),
  email: z.string().email('errors.InvalidEmailFormat'),
  password: z
    .string()
    .min(8, 'errors.passwordMust8Characters')
    .regex(/[a-zA-Z]/, 'errors.passwordMustContainLetter')
    .regex(/[0-9]/, 'errors.passwordMustContainNumber'),
  role: z.enum(['admin', 'intern', 'volunteer']),
});

export const updateProfileSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .regex(/^[a-zA-Z0-9]+$/)
      .optional(),
    email: z.string().email().optional(),
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8)
      .regex(/[a-zA-Z]/)
      .regex(/[0-9]/)
      .optional(),
  })
  .refine(
    (input) =>
      input.username !== undefined || input.email !== undefined || input.newPassword !== undefined,
    'At least one profile field is required'
  );

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
