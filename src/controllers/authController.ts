import type { Request, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { loginUser, registerUser, verifyUserToken } from '@/services/userService';
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
      message === 'User not found' ? 404 : message === 'Invalid password' ? 401 : 500;
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
