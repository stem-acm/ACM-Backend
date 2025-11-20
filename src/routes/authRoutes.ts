import { Router } from 'express';
import { login, register, verifyTokenEndpoint } from '@/controllers/authController';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { generalRateLimiter, loginRateLimiter } from '@/middlewares/rateLimiter';
import { validateRequest } from '@/middlewares/validateRequest';
import { loginSchema, registerSchema } from '@/schemas/userSchema';

const router: Router = Router();

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate a user and return a JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 format: password
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful
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
 *                   example: User connected successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         username:
 *                           type: string
 *                         email:
 *                           type: string
 *       401:
 *         description: Invalid credentials
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/login', loginRateLimiter, validateRequest(loginSchema), login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     description: Create a new user account (requires authentication)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 pattern: '^[a-zA-Z0-9]+$'
 *                 example: newuser
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 format: password
 *                 example: password123
 *     responses:
 *       201:
 *         description: User created successfully
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
 *                   example: User created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Username or email already exists
 */
router.post(
  '/register',
  generalRateLimiter,
  authMiddleware,
  validateRequest(registerSchema),
  register
);

/**
 * @swagger
 * /api/auth/token:
 *   get:
 *     summary: Verify JWT token
 *     description: Verify if a JWT token is valid and return user information
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: auth
 *         schema:
 *           type: string
 *         description: JWT token (deprecated, use Authorization header instead)
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Bearer token (e.g., Bearer {token})
 *     responses:
 *       200:
 *         description: Token is valid
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
 *                   example: Token valid
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *       400:
 *         description: Token parameter is required
 *       401:
 *         description: Invalid or expired token
 */
router.get('/token', generalRateLimiter, verifyTokenEndpoint);

export default router;
