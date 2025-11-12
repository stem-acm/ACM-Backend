import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { checkinQuerySchema } from '@/schemas/checkinSchema';
import {
  createCheckin,
  deleteCheckin,
  getCheckins,
  getCheckinsByRegistrationNumber,
} from '@/services/checkinService';

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const result = await createCheckin(req.body);
    res.status(201).json({
      success: true,
      message: 'Checkin created successfully',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create check-in';
    const statusCode =
      message === 'Member not found' || message === 'Activity not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const query = checkinQuerySchema.parse(req.query);
    const result = await getCheckins(query);
    res.status(200).json({
      success: true,
      message: 'All checkins',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve check-ins';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function getByRegistrationNumber(req: Request, res: Response): Promise<void> {
  try {
    const { registrationNumber } = req.params;
    const query = checkinQuerySchema.parse(req.query);
    const result = await getCheckinsByRegistrationNumber(registrationNumber, query);
    res.status(200).json({
      success: true,
      message: 'Checkins found',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve check-ins';
    const statusCode = message === 'Member not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function remove(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await deleteCheckin(id);
    res.status(200).json({
      success: true,
      message: 'Checkin deleted successfully',
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete check-in';
    const statusCode = message === 'Check-in not found' ? 404 : 400;
    res.status(statusCode).json({
      success: false,
      message,
      data: null,
    });
  }
}
