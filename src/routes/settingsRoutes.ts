import { type Router as ExpressRouter, Router } from 'express';
import { z } from 'zod';
import { db } from '@/db/drizzle';
import { users } from '@/db/schema';
import { type AuthRequest, authMiddleware } from '@/middlewares/authMiddleware';
import { requirePermission } from '@/middlewares/permissionMiddleware';
import { auditLogQuerySchema } from '@/schemas/auditSchema';
import {
  FEATURES,
  getAllRolePolicies,
  getRolePolicy,
  saveRolePolicy,
} from '@/services/accessService';
import { getLogs } from '@/services/auditService';
import { updateUserAccess } from '@/services/userService';

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

router.put('/roles/:role', async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required', data: null });
      return;
    }
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
    const saved = await saveRolePolicy(role.data, input.data.active, permissions, req.user);
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

const USER_ACCESS_ERRORS: Record<string, number> = {
  'User not found': 404,
  'You cannot remove your own admin access': 400,
  'At least one active admin is required': 400,
};

router.put('/users/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = Number(req.params.id);
    const input = updateUserSchema.safeParse(req.body);
    if (!Number.isSafeInteger(id) || id < 1 || !input.success) {
      res.status(400).json({ success: false, message: 'Invalid user update', data: null });
      return;
    }
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required', data: null });
      return;
    }
    const updated = await updateUserAccess(id, input.data, req.user);
    res.json({ success: true, message: 'User access updated', data: updated });
  } catch (error) {
    const status = error instanceof Error ? USER_ACCESS_ERRORS[error.message] : undefined;
    if (status && error instanceof Error) {
      res.status(status).json({ success: false, message: error.message, data: null });
      return;
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/settings/logs:
 *   get:
 *     summary: List audit logs
 *     description: >
 *       One row for each logged insert, update and delete, newest first.
 *       Requires the settings.manage permission (admin role only).
 *     tags: [Settings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: offset, schema: { type: integer, default: 0 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 25, maximum: 100 } }
 *       - { in: query, name: type, schema: { type: string, example: member.updated }, description: One log type }
 *       - { in: query, name: entity, schema: { type: string, enum: [users, role_policies, members, activities, checkins, volunteers, book_loans] } }
 *       - { in: query, name: actorId, schema: { type: integer }, description: Id of the user that made the change }
 *       - { in: query, name: from, schema: { type: string, example: '2026-11-01' }, description: 'Start of the period: a day (YYYY-MM-DD) or an ISO 8601 date-time' }
 *       - { in: query, name: to, schema: { type: string, example: '2026-11-13' }, description: 'End of the period, included: a day (YYYY-MM-DD) or an ISO 8601 date-time' }
 *       - { in: query, name: search, schema: { type: string }, description: Text in the record label or in the username of the actor }
 *     responses:
 *       200: { description: Audit logs retrieved }
 *       401: { description: Authentication required }
 *       403: { description: Access denied }
 *       422: { description: Invalid query parameters }
 */
router.get('/logs', async (req, res, next) => {
  try {
    const query = auditLogQuerySchema.safeParse(req.query);
    if (!query.success) {
      res.status(422).json({
        success: false,
        message: query.error.issues.map((issue) => issue.message).join(','),
        data: {
          errors: query.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
      return;
    }
    const result = await getLogs(query.data);
    res.json({
      success: true,
      message: 'Audit logs',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
