import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { volunteerQuerySchema } from '@/schemas/volunteerSchema';
import {
  createVolunteer,
  deleteVolunteer,
  getVolunteerById,
  getVolunteers,
  updateVolunteer,
} from '@/services/volunteerService';

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

    const result = await createVolunteer(req.body, req.user.id);
    res.status(201).json({
      success: true,
      message: 'Volunteer created successfully',
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
    const query = volunteerQuerySchema.parse(req.query);
    const result = await getVolunteers(query);
    res.status(200).json({
      success: true,
      message: 'All volunteers',
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
    const volunteer = await getVolunteerById(id);

    if (!volunteer) {
      res.status(404).json({
        success: false,
        message: 'Volunteer not found',
        data: null,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Volunteer found',
      data: volunteer,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve volunteer';
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
    const result = await updateVolunteer(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Volunteer updated successfully',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update volunteer';
    const statusCode = message === 'Volunteer not found' ? 404 : 400;
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
    await deleteVolunteer(id);
    res.status(200).json({
      success: true,
      message: 'Volunteer deleted successfully',
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
