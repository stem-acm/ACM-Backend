import { eq } from 'drizzle-orm';
import type { Router as ExpressRouter, Request, Response } from 'express';
import { Router } from 'express';
import { db } from '@/db/drizzle';
import { users } from '@/db/schema';
import type { AuthRequest } from '@/middlewares/authMiddleware';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { requirePermission } from '@/middlewares/permissionMiddleware';
import { type Feature, getRolePolicy, type Role } from '@/services/accessService';
import eventEmitter from '@/utils/eventEmitter';
import logger from '@/utils/logger';

const router: ExpressRouter = Router();

async function streamAllowed(req: Request, feature: Feature): Promise<boolean> {
  const id = (req as AuthRequest).user?.id;
  if (!id) return false;
  const [user] = await db
    .select({ role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user?.active) return false;
  const policy = await getRolePolicy(user.role as Role);
  return policy.active && policy.permissions[feature];
}

/**
 * @swagger
 * /api/sse/checkins:
 *   get:
 *     summary: Server-Sent Events endpoint for real-time check-in updates
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
  requirePermission('checkins.view'),
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
        if (!(await streamAllowed(req, 'checkins.view'))) {
          res.end();
          return;
        }
        const data = JSON.stringify({ type: 'new-checkin', data: checkin });
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
        if (!(await streamAllowed(req, 'checkins.view'))) {
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
        if (!(await streamAllowed(req, 'activities.view'))) {
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
        if (!(await streamAllowed(req, 'activities.view'))) {
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
