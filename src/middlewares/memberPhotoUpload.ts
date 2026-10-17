import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { config } from '@/config';
import { detectImageType } from '@/utils/memberPhoto';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxSize, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) callback(null, true);
    else callback(new Error('Only JPEG, PNG, or WebP images are allowed'));
  },
});

export function uploadMemberPhoto(req: Request, res: Response, next: NextFunction): void {
  upload.single('photo')(req, res, (error) => {
    if (error) {
      const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
      res.status(tooLarge ? 413 : 400).json({
        success: false,
        message: tooLarge
          ? `The image exceeds the maximum size of ${Math.floor(config.upload.maxSize / 1_048_576)} MB`
          : error.message,
        data: null,
      });
      return;
    }
    if (req.file && !detectImageType(req.file.buffer)) {
      res.status(415).json({
        success: false,
        message: 'The uploaded file is not a valid JPEG, PNG, or WebP image',
        data: null,
      });
      return;
    }
    next();
  });
}

export function normalizeMemberMultipart(req: Request, res: Response, next: NextFunction): void {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  // A public request may never choose its stored filesystem reference.
  delete req.body.profileImage;
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }
  res.locals.removeProfileImage = req.body.removeProfileImage === 'true';
  delete req.body.removeProfileImage;
  const nullableFields = [
    'lastName',
    'title',
    'gender',
    'birthDate',
    'birthPlace',
    'address',
    'occupation',
    'phoneNumber',
    'studyOrWorkPlace',
    'joinDate',
  ];
  for (const field of nullableFields) {
    if (req.body[field] === '') req.body[field] = null;
  }
  next();
}
