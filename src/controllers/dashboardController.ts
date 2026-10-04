import type { Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { getRolePolicy } from '@/services/accessService';
import { getDashboardStats } from '@/services/dashboardService';

export async function getDashboard(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required', data: null });
      return;
    }
    const date = req.query.date as string | undefined;
    const result = await getDashboardStats(date);
    const policy = await getRolePolicy(req.user.role);
    if (!policy.permissions['checkins.view']) result.checkins = [];
    if (!policy.permissions['members.view']) result.members = 0;
    if (!policy.permissions['activities.view']) result.activities = 0;
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
