import type { RequestHandler } from 'express';
import { upload } from '@/utils/fileUpload';

export const uploadSingle = upload.single('image') as RequestHandler;
export const uploadFields = upload.fields([
  { name: 'profileImage', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]) as RequestHandler;
