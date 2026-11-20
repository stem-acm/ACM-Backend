import { eq } from 'drizzle-orm';
import type { Router as ExpressRouter, Request, Response } from 'express';
import { Router } from 'express';
import { db } from '@/db/drizzle';
import { users } from '@/db/schema';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { requireAnyPermission, requirePermission } from '@/middlewares/permissionMiddleware';
import { type Feature, getRolePolicy, type Permissions, type Role } from '@/services/accessService';
import { type InRoomSource, toInRoomItem } from '@/services/checkinService';
import eventEmitter from '@/utils/eventEmitter';
import logger from '@/utils/logger';

const router: ExpressRouter = Router();

/**
 * The permissions of the user of an open stream, read again for each event, or `null` when the
 * account or the role is inactive or the role has none of `features`.
 */
async function streamPermissions(req: Request, features: Feature[]): Promise<Permissions | null> {
  const id = (req as AuthRequest).user?.id;
  if (!id) return null;
  const [user] = await db
    .select({ role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user?.active) return null;
  const policy = await getRolePolicy(user.role as Role);
  if (!policy.active || !features.some((feature) => policy.permissions[feature])) return null;
  return policy.permissions;
}

const CHECKIN_STREAM_FEATURES: Feature[] = ['checkins.view', 'checkins.verify'];

/**
 * @swagger
 * /api/sse/checkins:
 *   get:
 *     summary: Server-Sent Events endpoint for real-time check-in updates
 *     description: >
 *       Requires the checkins.view or the checkins.verify permission. A user with checkins.view
 *       receives the full check-in with the member and activity rows. A user with only
 *       checkins.verify receives the reduced check-in of GET /api/checkins/in-room. The
 *       permission is checked again before each event and each heartbeat; the stream closes
 *       when it is removed.
 *     tags: [SSE]
 *     responses:
 *       200:
 *         description: SSE stream established
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get(
  '/checkins',
  authMiddleware,
  requireAnyPermission(...CHECKIN_STREAM_FEATURES),
  (req: Request, res: Response) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    logger.info('SSE: New client connected');

    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');

    // Create event handler for new check-ins
    const checkinHandler = async (checkin: unknown) => {
      try {
        const permissions = await streamPermissions(req, CHECKIN_STREAM_FEATURES);
        if (!permissions) {
          res.end();
          return;
        }
        const event = permissions['checkins.view']
          ? checkin
          : toInRoomItem(checkin as InRoomSource);
        const data = JSON.stringify({ type: 'new-checkin', data: event });
        res.write(`data: ${data}\n\n`);
        logger.info('SSE: Sent new check-in event to client', { checkin });
      } catch (error) {
        logger.error('SSE: Error sending check-in event', error);
      }
    };

    // Register the event handler
    eventEmitter.checkinEmitter.onCheckin(checkinHandler);
    logger.info('SSE: Registered checkin event handler');

    // Handle client disconnect
    res.on('close', () => {
      eventEmitter.checkinEmitter.removeCheckinListener(checkinHandler);
      logger.info('SSE: Client disconnected, removed event handler');
      res.end();
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(async () => {
      try {
        if (!(await streamPermissions(req, CHECKIN_STREAM_FEATURES))) {
          res.end();
          return;
        }
        res.write(':heartbeat\n\n');
      } catch {
        res.end();
      }
    }, 30000);

    res.on('close', () => {
      clearInterval(heartbeat);
    });
  }
);

/**
 * @swagger
 * /api/sse/activities:
 *   get:
 *     summary: Server-Sent Events endpoint for real-time activity updates
 *     tags: [SSE]
 *     responses:
 *       200:
 *         description: SSE stream established
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 */
router.get(
  '/activities',
  authMiddleware,
  requirePermission('activities.view'),
  (req: Request, res: Response) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    logger.info('SSE: New client connected');

    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');

    // Create event handler for new activities
    const activityHandler = async (activity: unknown) => {
      try {
        if (!(await streamPermissions(req, ['activities.view']))) {
          res.end();
          return;
        }
        const data = JSON.stringify({ type: 'new-activity', data: activity });
        res.write(`data: ${data}\n\n`);
        logger.info('SSE: Sent new activity event to client', { activity });
      } catch (error) {
        logger.error('SSE: Error sending activity event', error);
      }
    };

    // Register the event handler
    eventEmitter.activityEmitter.onActivity(activityHandler);
    logger.info('SSE: Registered activity event handler');

    // Handle client disconnect
    res.on('close', () => {
      eventEmitter.activityEmitter.removeActivityListener(activityHandler);
      logger.info('SSE: Client disconnected, removed event handler');
      res.end();
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(async () => {
      try {
        if (!(await streamPermissions(req, ['activities.view']))) {
          res.end();
          return;
        }
        res.write(':heartbeat\n\n');
      } catch {
        res.end();
      }
    }, 30000);

    res.on('close', () => {
      clearInterval(heartbeat);
    });
  }
);

export default router;
