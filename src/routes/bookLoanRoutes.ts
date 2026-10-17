import { Router } from 'express';
import {
  create,
  getAll,
  getById,
  getTitles,
  markReturned,
  update,
} from '@/controllers/bookLoanController';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { requirePermission } from '@/middlewares/permissionMiddleware';
import { validateRequest } from '@/middlewares/validateRequest';
import {
  createBookLoanSchema,
  returnBookLoanSchema,
  updateBookLoanSchema,
} from '@/schemas/bookLoanSchema';

const router: Router = Router();

/**
 * @swagger
 * /api/book-loans:
 *   get:
 *     summary: List book loans
 *     tags: [Books]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: offset, schema: { type: integer, default: 0 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 50, maximum: 100 } }
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [all, active, overdue, returned], default: all } }
 *     responses:
 *       200: { description: Book loans retrieved }
 */
router.get('/', authMiddleware, requirePermission('books.view'), getAll);

/**
 * @swagger
 * /api/book-loans/titles:
 *   get:
 *     summary: Suggest distinct existing book titles
 *     tags: [Books]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string, maxLength: 255 } }
 *       - { in: query, name: limit, schema: { type: integer, default: 10, maximum: 20 } }
 *     responses:
 *       200: { description: Matching book titles }
 */
router.get('/titles', authMiddleware, requirePermission('books.create'), getTitles);

/**
 * @swagger
 * /api/book-loans/{id}:
 *   get:
 *     summary: Get one book loan
 *     tags: [Books]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Book loan found }
 *       404: { description: Book loan not found }
 */

router.get('/:id', authMiddleware, requirePermission('books.view'), getById);

/**
 * @swagger
 * /api/book-loans:
 *   post:
 *     summary: Create a book loan
 *     tags: [Books]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Book loan created }
 *       422: { description: Invalid book loan }
 */
router.post(
  '/',
  authMiddleware,
  requirePermission('books.create'),
  validateRequest(createBookLoanSchema),
  create
);

/**
 * @swagger
 * /api/book-loans/{id}:
 *   put:
 *     summary: Update a book loan
 *     tags: [Books]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Book loan updated }
 */
router.put(
  '/:id',
  authMiddleware,
  requirePermission('books.update'),
  validateRequest(updateBookLoanSchema),
  update
);

/**
 * @swagger
 * /api/book-loans/{id}/return:
 *   patch:
 *     summary: Mark a book as returned
 *     tags: [Books]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Book returned }
 */
router.patch(
  '/:id/return',
  authMiddleware,
  requirePermission('books.update'),
  validateRequest(returnBookLoanSchema),
  markReturned
);

export default router;
