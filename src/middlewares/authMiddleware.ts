import { eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';
import { db } from '@/db/drizzle';
import { users } from '@/db/schema';
import { extractTokenFromHeader, verifyToken } from '@/utils/jwtUtils';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    username: string;
    email: string;
  };
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication token required',
        data: null,
      });
      return;
    }

    const decoded = verifyToken(token);

    // Verify user still exists in database
    const [user] = await db.select().from(users).where(eq(users.id, decoded.id)).limit(1);

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found',
        data: null,
      });
      return;
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid or expired token',
      data: null,
    });
  }
}
