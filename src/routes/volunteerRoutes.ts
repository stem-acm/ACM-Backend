import { Router } from 'express';
import { create, getAll, getById, remove, update } from '@/controllers/volunteerController';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { validateRequest } from '@/middlewares/validateRequest';
import { createVolunteerSchema, updateVolunteerSchema } from '@/schemas/volunteerSchema';

const router: Router = Router();

/**
 * @swagger
 * /api/volunteers:
 *   get:
 *     summary: Get all volunteers
 *     description: Retrieve a paginated list of volunteers with optional filtering and sorting
 *     tags: [Volunteers]
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
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, memberId, joinDate, expirationDate, createdAt]
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
 *         description: Volunteers retrieved successfully
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
 *                   example: All volunteers
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Volunteer'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     offset:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       400:
 *         description: Invalid query parameters
 */
router.get('/', getAll);

/**
 * @swagger
 * /api/volunteers/{id}:
 *   get:
 *     summary: Get volunteer by ID
 *     description: Retrieve a volunteer by their ID
 *     tags: [Volunteers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Volunteer ID
 *     responses:
 *       200:
 *         description: Volunteer retrieved successfully
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
 *                   example: Volunteer found
 *                 data:
 *                   $ref: '#/components/schemas/Volunteer'
 *       404:
 *         description: Volunteer not found
 */
router.get('/:id', getById);

/**
 * @swagger
 * /api/volunteers:
 *   post:
 *     summary: Create a new volunteer
 *     description: Register a member as a volunteer (requires authentication)
 *     tags: [Volunteers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - memberId
 *             properties:
 *               memberId:
 *                 type: integer
 *                 example: 1
 *                 description: ID of the member to register as volunteer
 *               joinDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: "2025-11-22"
 *                 description: Date when the member joined as volunteer
 *               expirationDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: "2026-11-22"
 *                 description: Date when the volunteer status expires
 *     responses:
 *       201:
 *         description: Volunteer created successfully
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
 *                   example: Volunteer created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Volunteer'
 *       400:
 *         description: Invalid input
 */
router.post('/', authMiddleware, validateRequest(createVolunteerSchema), create);

/**
 * @swagger
 * /api/volunteers/{id}:
 *   put:
 *     summary: Update a volunteer
 *     description: Update volunteer information (requires authentication)
 *     tags: [Volunteers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Volunteer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memberId:
 *                 type: integer
 *                 example: 1
 *               joinDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: "2025-11-22"
 *               expirationDate:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *                 example: "2026-11-22"
 *     responses:
 *       200:
 *         description: Volunteer updated successfully
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
 *                   example: Volunteer updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Volunteer'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Volunteer not found
 */
router.put('/:id', authMiddleware, validateRequest(updateVolunteerSchema), update);

/**
 * @swagger
 * /api/volunteers/{id}:
 *   delete:
 *     summary: Delete a volunteer
 *     description: Remove volunteer status from a member (requires authentication)
 *     tags: [Volunteers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Volunteer ID
 *     responses:
 *       200:
 *         description: Volunteer deleted successfully
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
 *                   example: Volunteer deleted successfully
 *                 data:
 *                   type: null
 *       404:
 *         description: Volunteer not found
 */
router.delete('/:id', authMiddleware, remove);

export default router;
