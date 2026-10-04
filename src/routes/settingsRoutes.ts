import { and, eq, ne } from 'drizzle-orm';
import { type Router as ExpressRouter, Router } from 'express';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { users } from '@/db/schema';
import { type AuthRequest, authMiddleware } from '@/middlewares/authMiddleware';
import { requirePermission } from '@/middlewares/permissionMiddleware';
import {
  FEATURES,
  getAllRolePolicies,
  getRolePolicy,
  saveRolePolicy,
} from '@/services/accessService';

const router: ExpressRouter = Router();
router.use(authMiddleware, requirePermission('settings.manage'));

const policySchema = z.object({
  active: z.boolean(),
  permissions: z
    .record(z.boolean())
    .refine(
      (value) => Object.keys(value).every((key) => (FEATURES as readonly string[]).includes(key)),
      'Unknown feature'
    ),
});

router.get('/roles', async (_req, res, next) => {
  try {
    res.json({ success: true, message: 'Role policies', data: await getAllRolePolicies() });
  } catch (error) {
    next(error);
  }
});

router.put('/roles/:role', async (req, res, next) => {
  try {
    const role = z.enum(['admin', 'intern', 'volunteer']).safeParse(req.params.role);
    const input = policySchema.safeParse(req.body);
    if (!role.success || !input.success) {
      res.status(400).json({ success: false, message: 'Invalid role policy', data: null });
      return;
    }
    if (role.data === 'admin' && !input.data.active) {
      res
        .status(400)
        .json({ success: false, message: 'Admin role must remain active', data: null });
      return;
    }
    const existing = await getRolePolicy(role.data);
    const permissions = { ...existing.permissions, ...input.data.permissions };
    const saved = await saveRolePolicy(role.data, input.data.active, permissions);
    res.json({ success: true, message: 'Role policy updated', data: saved });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        active: users.active,
      })
      .from(users)
      .orderBy(users.username);
    res.json({ success: true, message: 'Users', data: rows });
  } catch (error) {
    next(error);
  }
});

const updateUserSchema = z.object({
  role: z.enum(['admin', 'intern', 'volunteer']),
  active: z.boolean(),
});

router.put('/users/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const input = updateUserSchema.safeParse(req.body);
    if (!Number.isSafeInteger(id) || id < 1 || !input.success) {
      res.status(400).json({ success: false, message: 'Invalid user update', data: null });
      return;
    }
    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) {
      res.status(404).json({ success: false, message: 'User not found', data: null });
      return;
    }
    if (id === req.user?.id && (input.data.role !== 'admin' || !input.data.active)) {
      res
        .status(400)
        .json({ success: false, message: 'You cannot remove your own admin access', data: null });
      return;
    }
    if (
      target.role === 'admin' &&
      target.active &&
      (input.data.role !== 'admin' || !input.data.active)
    ) {
      const otherAdmins = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.active, true), ne(users.id, id)))
        .limit(1);
      if (!otherAdmins.length) {
        res
          .status(400)
          .json({ success: false, message: 'At least one active admin is required', data: null });
        return;
      }
    }
    const [updated] = await db
      .update(users)
      .set({ ...input.data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        active: users.active,
      });
    res.json({ success: true, message: 'User access updated', data: updated });
  } catch (error) {
    next(error);
  }
});

export default router;
