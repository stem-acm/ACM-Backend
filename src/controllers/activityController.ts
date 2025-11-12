import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { activityQuerySchema } from '@/schemas/activitySchema';
import {
  createActivity,
  deleteActivity,
  getActivities,
  getActivityById,
  updateActivity,
} from '@/services/activityService';

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized',
        data: null,
      });
      return;
    }

    const result = await createActivity(req.body, req.user.id);
    res.status(201).json({
      success: true,
      message: 'Activity created successfully',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create activity';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const query = activityQuerySchema.parse(req.query);
    const result = await getActivities(query);
    res.status(200).json({
      success: true,
      message: 'All activities',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve activities';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const activity = await getActivityById(id);

    if (!activity) {
      res.status(404).json({
        success: false,
        message: 'Activity not found',
        data: null,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Activity found',
      data: activity,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve activity';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const result = await updateActivity(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Activity updated successfully',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update activity';
    const statusCode = message === 'Activity not found' ? 404 : 400;
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
    await deleteActivity(id);
    res.status(200).json({
      success: true,
      message: 'Activity deleted successfully',
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete activity';
    const statusCode =
      message === 'Activity not found' ? 404 : message.includes('associated check-ins') ? 400 : 400;
    res.status(statusCode).json({
      success: false,
      message,
      data: null,
    });
  }
}
