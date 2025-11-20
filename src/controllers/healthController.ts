import type { Request, Response } from 'express';

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
}
