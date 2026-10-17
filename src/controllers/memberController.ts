import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { memberQuerySchema } from '@/schemas/memberSchema';
import {
  createMember,
  deleteMember,
  getMemberById,
  getMemberByRegistrationNumber,
  getMembers,
  getQRCodeData,
  getStudyPlaces,
  isMemberPhotoReferenced,
  updateMember,
} from '@/services/memberService';
import { deleteMemberPhoto, saveMemberPhoto } from '@/utils/memberPhoto';

async function deletePhotoWhenUnused(reference: string | null | undefined) {
  try {
    if (reference && !(await isMemberPhotoReferenced(reference)))
      await deleteMemberPhoto(reference);
  } catch {
    // The member mutation has already succeeded; a cleanup failure must not corrupt its response.
  }
}

async function discardNewPhoto(reference: string | undefined) {
  try {
    await deleteMemberPhoto(reference);
  } catch {
    // Preserve the original member-operation error if filesystem cleanup also fails.
  }
}

export async function create(req: AuthRequest, res: Response): Promise<void> {
  let newPhoto: string | undefined;
  try {
    if (req.file) newPhoto = await saveMemberPhoto(req.file);
    const result = await createMember({ ...req.body, profileImage: newPhoto ?? null });
    res.status(201).json({
      success: true,
      message: 'Member created successfully',
      data: result,
    });
  } catch (error) {
    await discardNewPhoto(newPhoto);
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

export async function getStudyPlacesHandler(_req: Request, res: Response): Promise<void> {
  try {
    const places = await getStudyPlaces();
    res.status(200).json({
      success: true,
      message: 'Study places retrieved successfully',
      data: places,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve study places';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function getQRCode(req: Request, res: Response): Promise<void> {
  try {
    const { registrationNumber } = req.params;
    const parsedRegNum = Number.parseInt(registrationNumber, 10);

    if (Number.isNaN(parsedRegNum)) {
      res.status(400).json({
        success: false,
        message: 'Invalid registration number',
        data: null,
      });
      return;
    }

    const member = await getMemberByRegistrationNumber(registrationNumber);
    if (!member) {
      res.status(404).json({
        success: false,
        message: 'Member not found',
        data: null,
      });
      return;
    }

    const qrData = getQRCodeData(parsedRegNum);
    res.status(200).json({
      success: true,
      message: 'QR code data generated successfully',
      data: qrData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate QR code data';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function update(req: AuthRequest, res: Response): Promise<void> {
  let newPhoto: string | undefined;
  try {
    const id = Number.parseInt(req.params.id, 10);
    const currentMember = await getMemberById(id);
    if (!currentMember) throw new Error('Member not found');
    if (req.file) newPhoto = await saveMemberPhoto(req.file);
    const removePhoto = res.locals.removeProfileImage === true;
    const profileImage = newPhoto ?? (removePhoto ? null : currentMember.profileImage);
    const result = await updateMember(id, { ...req.body, profileImage });
    if (currentMember.profileImage && currentMember.profileImage !== profileImage) {
      await deletePhotoWhenUnused(currentMember.profileImage);
    }
    res.status(200).json({
      success: true,
      message: 'Member updated successfully',
      data: result,
    });
  } catch (error) {
    await discardNewPhoto(newPhoto);
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
    const currentMember = await getMemberById(id);
    await deleteMember(id);
    await deletePhotoWhenUnused(currentMember?.profileImage);
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
