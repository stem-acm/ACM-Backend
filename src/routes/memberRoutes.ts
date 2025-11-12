import { Router } from 'express';
import {
  create,
  getAll,
  getById,
  getByRegistrationNumber,
  remove,
  update,
} from '@/controllers/memberController';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { validateRequest } from '@/middlewares/validateRequest';
import { createMemberSchema, updateMemberSchema } from '@/schemas/memberSchema';

const router: Router = Router();

/**
 * @swagger
 * /api/members:
 *   get:
 *     summary: Get all members
 *     description: Retrieve a paginated list of members with optional filtering and sorting
 *     tags: [Members]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for filtering members
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, firstName, lastName, joinDate]
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
 *         description: Members retrieved successfully
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
 *                   example: Members retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Member'
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
 * /api/members/registration/{registrationNumber}:
 *   get:
 *     summary: Get member by registration number
 *     description: Retrieve a member by their registration number
 *     tags: [Members]
 *     parameters:
 *       - in: path
 *         name: registrationNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Member registration number
 *     responses:
 *       200:
 *         description: Member retrieved successfully
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
 *                   example: Member retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Member'
 *       404:
 *         description: Member not found
 */
router.get('/registration/:registrationNumber', getByRegistrationNumber);

/**
 * @swagger
 * /api/members:
 *   post:
 *     summary: Create a new member
 *     description: Create a new member (requires authentication)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 pattern: '^\d{4}-\d{2}-\d{2}$'
 *                 example: '1990-01-01'
 *               birthPlace:
 *                 type: string
 *                 example: New York
 *               address:
 *                 type: string
 *                 example: 123 Main St
 *               occupation:
 *                 type: string
 *                 enum: [student, unemployed, employee, entrepreneur]
 *                 example: student
 *               phoneNumber:
 *                 type: string
 *                 example: '+1234567890'
 *               studyOrWorkPlace:
 *                 type: string
 *                 example: University
 *               joinDate:
 *                 type: string
 *                 format: date
 *                 pattern: '^\d{4}-\d{2}-\d{2}$'
 *                 example: '2024-01-01'
 *               profileImage:
 *                 type: string
 *                 example: /uploads/profile.jpg
 *     responses:
 *       201:
 *         description: Member created successfully
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
 *                   example: Member created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Member'
 *       400:
 *         description: Invalid input
 */
router.post('/', authMiddleware, validateRequest(createMemberSchema), create);

/**
 * @swagger
 * /api/members/{id}:
 *   get:
 *     summary: Get member by ID
 *     description: Retrieve a member by their ID (requires authentication)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Member ID
 *     responses:
 *       200:
 *         description: Member retrieved successfully
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
 *                   example: Member retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Member'
 *       404:
 *         description: Member not found
 */
router.get('/:id', authMiddleware, getById);

/**
 * @swagger
 * /api/members/{id}:
 *   put:
 *     summary: Update a member
 *     description: Update member information (requires authentication)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Member ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *               birthPlace:
 *                 type: string
 *               address:
 *                 type: string
 *               occupation:
 *                 type: string
 *                 enum: [student, unemployed, employee, entrepreneur]
 *               phoneNumber:
 *                 type: string
 *               studyOrWorkPlace:
 *                 type: string
 *               joinDate:
 *                 type: string
 *                 format: date
 *               profileImage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Member updated successfully
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
 *                   example: Member updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Member'
 *       400:
 *         description: Invalid input
 *       404:
 *         description: Member not found
 */
router.put('/:id', authMiddleware, validateRequest(updateMemberSchema), update);

/**
 * @swagger
 * /api/members/{id}:
 *   delete:
 *     summary: Delete a member
 *     description: Delete a member by ID (requires authentication)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Member ID
 *     responses:
 *       200:
 *         description: Member deleted successfully
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
 *                   example: Member deleted successfully
 *                 data:
 *                   type: null
 *       400:
 *         description: Cannot delete member with associated check-ins
 *       404:
 *         description: Member not found
 */
router.delete('/:id', authMiddleware, remove);

export default router;
