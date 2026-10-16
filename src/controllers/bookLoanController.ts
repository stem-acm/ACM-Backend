import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { bookLoanQuerySchema, bookTitleQuerySchema } from '@/schemas/bookLoanSchema';
import {
  createBookLoan,
  getBookLoanById,
  getBookLoans,
  getBookTitles,
  returnBookLoan,
  updateBookLoan,
} from '@/services/bookLoanService';

function requestId(req: Request) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid book loan ID');
  return id;
}

function errorStatus(message: string) {
  if (message === 'Book loan not found' || message === 'Member not found') return 404;
  return 400;
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized', data: null });
      return;
    }
    const result = await createBookLoan(req.body, req.user.id);
    res
      .status(201)
      .json({ success: true, message: 'Book loan created successfully', data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create book loan';
    res.status(errorStatus(message)).json({ success: false, message, data: null });
  }
}

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const result = await getBookLoans(bookLoanQuerySchema.parse(req.query));
    res.status(200).json({
      success: true,
      message: 'All book loans',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve book loans';
    res.status(400).json({ success: false, message, data: null });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const result = await getBookLoanById(requestId(req));
    if (!result) {
      res.status(404).json({ success: false, message: 'Book loan not found', data: null });
      return;
    }
    res.status(200).json({ success: true, message: 'Book loan found', data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve book loan';
    res.status(errorStatus(message)).json({ success: false, message, data: null });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const result = await updateBookLoan(requestId(req), req.body);
    res
      .status(200)
      .json({ success: true, message: 'Book loan updated successfully', data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update book loan';
    res.status(errorStatus(message)).json({ success: false, message, data: null });
  }
}

export async function markReturned(req: Request, res: Response): Promise<void> {
  try {
    const result = await returnBookLoan(requestId(req), req.body.effectiveReturnDate);
    res.status(200).json({ success: true, message: 'Book returned successfully', data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to return book';
    res.status(errorStatus(message)).json({ success: false, message, data: null });
  }
}

export async function getTitles(req: Request, res: Response): Promise<void> {
  try {
    const { search, limit } = bookTitleQuerySchema.parse(req.query);
    const data = await getBookTitles(search, limit);
    res.status(200).json({ success: true, message: 'Matching book titles', data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve book titles';
    res.status(400).json({ success: false, message, data: null });
  }
}
