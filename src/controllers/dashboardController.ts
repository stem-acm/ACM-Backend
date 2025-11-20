import type { Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { getDashboardStats } from '@/services/dashboardService';

export async function getDashboard(req: AuthRequest, res: Response): Promise<void> {
  try {
    const date = req.query.date as string | undefined;
    const result = await getDashboardStats(date);
    res.status(200).json({
      success: true,
      message: 'All Statistics',
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve dashboard stats';
    res.status(400).json({
      success: false,
      message,
      data: null,
    });
  }
}
