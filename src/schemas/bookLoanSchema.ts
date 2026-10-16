import { z } from 'zod';

const dateFieldsSchema = z
  .object({
    borrowingDate: z.string().date(),
    expectedReturnDate: z.string().date(),
    effectiveReturnDate: z.string().date().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.expectedReturnDate < value.borrowingDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expectedReturnDate'],
        message: 'Expected return date cannot be before borrowing date',
      });
    }
    if (value.effectiveReturnDate && value.effectiveReturnDate < value.borrowingDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveReturnDate'],
        message: 'Effective return date cannot be before borrowing date',
      });
    }
  });

export const createBookLoanSchema = z
  .object({
    registrationNumber: z.number().int().positive(),
    bookTitle: z.string().trim().min(1, 'Book title is required').max(255),
  })
  .and(dateFieldsSchema);

export const updateBookLoanSchema = z
  .object({
    registrationNumber: z.number().int().positive().optional(),
    bookTitle: z.string().trim().min(1, 'Book title is required').max(255).optional(),
    borrowingDate: z.string().date().optional(),
    expectedReturnDate: z.string().date().optional(),
    effectiveReturnDate: z.string().date().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const returnBookLoanSchema = z.object({
  effectiveReturnDate: z.string().date(),
});

export const bookLoanQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).optional().default(0),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  search: z.string().trim().optional().default(''),
  status: z.enum(['borrowed', 'overdue', 'returned']).optional(),
  sortBy: z
    .enum(['id', 'bookTitle', 'borrowingDate', 'expectedReturnDate', 'createdAt'])
    .optional()
    .default('id'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateBookLoanInput = z.infer<typeof createBookLoanSchema>;
export type UpdateBookLoanInput = z.infer<typeof updateBookLoanSchema>;
export type BookLoanQueryInput = z.infer<typeof bookLoanQuerySchema>;
