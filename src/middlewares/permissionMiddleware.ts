import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { type Feature, getRolePolicy } from '@/services/accessService';

/** Lets the request through when the active role of the user has one of the features. */
export function requireAnyPermission(...features: Feature[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required', data: null });
        return;
      }
      const policy = await getRolePolicy(req.user.role);
      if (!policy.active || !features.some((feature) => policy.permissions[feature])) {
        res.status(403).json({ success: false, message: 'Access denied', data: null });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(feature: Feature) {
  return requireAnyPermission(feature);
}
