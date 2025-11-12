import { Router } from 'express';
import { create, getAll, getById, remove, update } from '@/controllers/activityController';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { validateRequest } from '@/middlewares/validateRequest';
import { createActivitySchema, updateActivitySchema } from '@/schemas/activitySchema';

const router: Router = Router();

/**
 * @swagger
 * /api/activities:
 *   get:
 *     summary: Get all activities
 *     description: Retrieve a paginated list of activities with optional filtering and sorting
 *     tags: [Activities]
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
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, name, createdAt]
 *           default: id
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Activities retrieved successfully
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
 *                   example: All activities
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Activity'
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
 * /api/activities/{id}:
 *   get:
 *     summary: Get activity by ID
 *     description: Retrieve an activity by its ID
 *     tags: [Activities]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Activity ID
 *     responses:
 *       200:
 *         description: Activity retrieved successfully
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
 *                   example: Activity found
 *                 data:
 *                   $ref: '#/components/schemas/Activity'
 *       404:
 *         description: Activity not found
 */
router.get('/:id', getById);

/**
 * @swagger
 * /api/activities:
 *   post:
 *     summary: Create a new activity
 *     description: Create a new activity (requires authentication)
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 255
 *                 example: Workshop
 *               description:
 *                 type: string
 *                 example: A workshop about web development
 *               image:
 *                 type: string
 *                 example: /uploads/activity.jpg
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 example: true
 *     responses:
 *       201:
 *         description: Activity created successfully
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
 *                   example: Activity created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Activity'
 *       400:
 *         description: Invalid input
 */
router.post('/', authMiddleware, validateRequest(createActivitySchema), create);

/**
 * @swagger
 * /api/activities/{id}:
 *   put:
 *     summary: Update an activity
 *     description: Update activity information (requires authentication)
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Activity ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 255
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Activity updated successfully
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
 *                   example: Activity updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Activity'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Activity not found
 */
router.put('/:id', authMiddleware, validateRequest(updateActivitySchema), update);

/**
 * @swagger
 * /api/activities/{id}:
 *   delete:
 *     summary: Delete an activity
 *     description: Delete an activity by ID (requires authentication)
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Activity ID
 *     responses:
 *       200:
 *         description: Activity deleted successfully
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
 *                   example: Activity deleted successfully
 *                 data:
 *                   type: null
 *       400:
 *         description: Cannot delete activity with associated check-ins
 *       404:
 *         description: Activity not found
 */
router.delete('/:id', authMiddleware, remove);

export default router;
