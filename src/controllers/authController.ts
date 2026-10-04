import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { loginUser, registerUser, updateOwnProfile, verifyUserToken } from '@/services/userService';
import { verifyToken } from '@/utils/jwtUtils';

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const result = await loginUser(req.body);
    res.status(200).json({
      success: true,
      message: 'User connected successfully',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    const statusCode =
      message === 'User not found'
        ? 404
        : message === 'Invalid password'
          ? 401
          : message === 'Account or role is inactive'
            ? 403
            : 500;
    res.status(statusCode).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function register(req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await registerUser(req.body);
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    const statusCode =
      message === 'Username already exists' || message === 'Email already exists' ? 409 : 400;
    res.status(statusCode).json({
      success: false,
      message,
      data: null,
    });
  }
}

export async function verifyTokenEndpoint(req: Request, res: Response): Promise<void> {
  try {
    // Support both Authorization header and query parameter (deprecated)
    const token =
      req.headers.authorization?.split(' ')[1] || (req.query.auth as string) || undefined;

    if (!token) {
      res.status(400).json({
        success: false,
        message: 'Token parameter is required',
        data: null,
      });
      return;
    }

    const decoded = verifyToken(token);
    const user = await verifyUserToken(decoded.id);

    res.status(200).json({
      success: true,
      message: 'Token valid',
      data: user,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid or expired token',
      data: null,
    });
  }
}

export async function updateProfile(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required', data: null });
      return;
    }
    const user = await updateOwnProfile(req.user.id, req.body);
    res.json({ success: true, message: 'Profile updated', data: user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile update failed';
    const cause = (error as { cause?: { code?: string } })?.cause;
    const status =
      message === 'Incorrect current password'
        ? 400
        : message.includes('already exists') || cause?.code === '23505'
          ? 409
          : 500;
    res.status(status).json({ success: false, message, data: null });
  }
}
