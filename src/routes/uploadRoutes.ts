import type { NextFunction, Request, Response } from 'express';
import express, { Router } from 'express';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { uploadsRoot } from '@/utils/memberPhoto';

// The default avatar is the only public file. Every other file in `uploads` (member photos
// in particular) is personal data: it needs a valid token.
const PUBLIC_UPLOADS = new Set(['/user.png']);

const router: Router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  if (PUBLIC_UPLOADS.has(req.path)) {
    next();
    return;
  }
  // Browsers and proxies must not keep a copy that another person could read later.
  res.setHeader('Cache-Control', 'private, no-store');
  void authMiddleware(req, res, next);
});

router.use(
  express.static(uploadsRoot, {
    // Keep the Cache-Control that the access check set for protected files.
    cacheControl: false,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
);

export default router;
