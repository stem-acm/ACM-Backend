import { Router } from 'express';
import { getDashboard } from '@/controllers/dashboardController';
import { authMiddleware } from '@/middlewares/authMiddleware';

const router: Router = Router();

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Get dashboard statistics
 *     description: Retrieve dashboard statistics including member counts, activity counts, and check-in statistics (requires authentication)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter statistics by date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Dashboard statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: All Statistics
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalMembers:
 *                       type: integer
 *                       example: 100
 *                     totalActivities:
 *                       type: integer
 *                       example: 10
 *                     totalCheckins:
 *                       type: integer
 *                       example: 500
 *                     activeMembers:
 *                       type: integer
 *                       example: 80
 *                     activeActivities:
 *                       type: integer
 *                       example: 8
 *       400:
 *         description: Failed to retrieve dashboard stats
 */
router.get('/', authMiddleware, getDashboard);

export default router;
