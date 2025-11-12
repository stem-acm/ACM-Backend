import type { Request, Response } from 'express';
import logger from '@/utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
  code?: string;
}

export function errorHandler(err: AppError, req: Request, res: Response): void {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  logger.error({
    error: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    message,
    data: null,
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    data: null,
  });
}
