import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { memberQuerySchema } from '@/schemas/memberSchema';
import {
  createMember,
  deleteMember,
  getMemberById,
  getMemberByRegistrationNumber,
  getMembers,
  updateMember,
} from '@/services/memberService';

export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await createMember(req.body);
    res.status(201).json({
      success: true,
      message: 'Member created successfully',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create member';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function getAll(req: Request, res: Response): Promise<void> {
  try {
    const query = memberQuerySchema.parse(req.query);
    const result = await getMembers(query);
    res.status(200).json({
      success: true,
      message: 'Members retrieved successfully',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve members';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function getById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const member = await getMemberById(id);

    if (!member) {
      res.status(404).json({
        success: false,
        message: 'Member not found',
        data: null,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Member retrieved successfully',
      data: member,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve member';
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
    const member = await getMemberByRegistrationNumber(registrationNumber);

    if (!member) {
      res.status(404).json({
        success: false,
        message: 'Member not found',
        data: null,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Member retrieved successfully',
      data: member,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve member';
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
    const result = await updateMember(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Member updated successfully',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update member';
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
    await deleteMember(id);
    res.status(200).json({
      success: true,
      message: 'Member deleted successfully',
      data: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete member';
    const statusCode =
      message === 'Member not found' ? 404 : message.includes('associated check-ins') ? 400 : 400;
    res.status(statusCode).json({
      success: false,
      message,
      data: null,
    });
  }
}
