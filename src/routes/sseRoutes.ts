import type { Router as ExpressRouter, Request, Response } from 'express';
import { Router } from 'express';
import checkinEventEmitter from '@/utils/eventEmitter';
import logger from '@/utils/logger';

const router: ExpressRouter = Router();

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
router.get('/checkins', (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  logger.info('SSE: New client connected');

  // Send initial connection message
  res.write('data: {"type":"connected"}\n\n');

  // Create event handler for new check-ins
  const checkinHandler = (checkin: unknown) => {
    try {
      const data = JSON.stringify({ type: 'new-checkin', data: checkin });
      res.write(`data: ${data}\n\n`);
      logger.info('SSE: Sent new check-in event to client', { checkin });
    } catch (error) {
      logger.error('SSE: Error sending check-in event', error);
    }
  };

  // Register the event handler
  checkinEventEmitter.onCheckin(checkinHandler);
  logger.info('SSE: Registered checkin event handler');

  // Handle client disconnect
  req.on('close', () => {
    checkinEventEmitter.removeCheckinListener(checkinHandler);
    logger.info('SSE: Client disconnected, removed event handler');
    res.end();
  });

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

export default router;
