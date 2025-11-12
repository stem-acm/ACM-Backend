import { Router } from 'express';
import { create, getAll, getByRegistrationNumber, remove } from '@/controllers/checkinController';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { validateRequest } from '@/middlewares/validateRequest';
import { createCheckinSchema } from '@/schemas/checkinSchema';

const router: Router = Router();

/**
 * @swagger
 * /api/checkins:
 *   post:
 *     summary: Create a new check-in
 *     description: Create a new check-in record for a member and activity
 *     tags: [Check-ins]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - registrationNumber
 *               - activityId
 *             properties:
 *               registrationNumber:
 *                 type: string
 *                 example: MEM-001
 *               activityId:
 *                 type: integer
 *                 example: 1
 *               checkInTime:
 *                 type: string
 *                 format: date-time
 *                 example: '2024-01-01T10:00:00Z'
 *               checkOutTime:
 *                 type: string
 *                 format: date-time
 *                 example: '2024-01-01T12:00:00Z'
 *               visitReason:
 *                 type: string
 *                 maxLength: 500
 *                 example: Attending workshop
 *     responses:
 *       201:
 *         description: Check-in created successfully
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
 *                   example: Checkin created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Checkin'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Member or activity not found
 */
router.post('/', validateRequest(createCheckinSchema), create);

/**
 * @swagger
 * /api/checkins:
 *   get:
 *     summary: Get all check-ins
 *     description: Retrieve a paginated list of check-ins with optional filtering
 *     tags: [Check-ins]
 *     parameters:
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Maximum number of records to return
 *       - in: query
 *         name: memberId
 *         schema:
 *           type: integer
 *         description: Filter by member ID
 *       - in: query
 *         name: activityId
 *         schema:
 *           type: integer
 *         description: Filter by activity ID
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *           pattern: '^\d{4}-\d{2}-\d{2}$'
 *         description: Filter by date (YYYY-MM-DD)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, checkInTime, createdAt]
 *           default: id
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Check-ins retrieved successfully
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
 *                   example: All checkins
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Checkin'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     offset:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       400:
 *         description: Invalid query parameters
 */
router.get('/', getAll);

/**
 * @swagger
 * /api/checkins/{registrationNumber}:
 *   get:
 *     summary: Get check-ins by registration number
 *     description: Retrieve all check-ins for a specific member by registration number
 *     tags: [Check-ins]
 *     parameters:
 *       - in: path
 *         name: registrationNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Member registration number
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Maximum number of records to return
 *     responses:
 *       200:
 *         description: Check-ins retrieved successfully
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
 *                   example: Checkins found
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Checkin'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     offset:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       404:
 *         description: Member not found
 */
router.get('/:registrationNumber', getByRegistrationNumber);

/**
 * @swagger
 * /api/checkins/{id}:
 *   delete:
 *     summary: Delete a check-in
 *     description: Delete a check-in by ID (requires authentication)
 *     tags: [Check-ins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Check-in ID
 *     responses:
 *       200:
 *         description: Check-in deleted successfully
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
 *                   example: Checkin deleted successfully
 *                 data:
 *                   type: null
 *       404:
 *         description: Check-in not found
 */
router.delete('/:id', authMiddleware, remove);

export default router;
