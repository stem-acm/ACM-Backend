import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { checkinQuerySchema, type InRoomQueryInput } from '@/schemas/checkinSchema';
import { getRolePolicy } from '@/services/accessService';
import { getTimezone } from '@/services/appSettingsService';
import { getCheckinSchedule } from '@/services/checkinScheduleService';
import {
  createCheckin,
  deleteCheckin,
  getCheckins,
  getCheckinsByRegistrationNumber,
  getInRoomCheckins,
  verifyBadge,
} from '@/services/checkinService';
import eventEmitter from '@/utils/eventEmitter';

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const result = await createCheckin(req.body);

    // Emit real-time event for new check-in
    console.log('Emitting new check-in event:', result);
    eventEmitter.checkinEmitter.emitCheckin(result);

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
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized', data: null });
      return;
    }
    const id = Number.parseInt(req.params.id, 10);
    await deleteCheckin(id, req.user);
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

export async function getSchedule(_req: Request, res: Response): Promise<void> {
  try {
    const [timezone, schedule] = await Promise.all([getTimezone(), getCheckinSchedule()]);
    res
      .status(200)
      .json({ success: true, message: 'Check-in schedule', data: { timezone, schedule } });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve the check-in schedule',
      data: null,
    });
  }
}

export async function verify(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized', data: null });
      return;
    }
    const result = await verifyBadge(req.body, req.user);
    res.status(200).json({ success: true, message: 'Badge verified', data: result });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to verify the badge', data: null });
  }
}

export async function getInRoom(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized', data: null });
      return;
    }
    // Users who can read check-ins get the full rows, as the dashboard; the others get the
    // reduced member.
    const policy = await getRolePolicy(req.user.role);
    const result = await getInRoomCheckins(
      req.query as unknown as InRoomQueryInput,
      policy.permissions['checkins.view']
    );
    res.status(200).json({
      success: true,
      message: 'Members in room',
      data: result.data,
      pagination: result.pagination,
    });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve the members in the room',
      data: null,
    });
  }
}
