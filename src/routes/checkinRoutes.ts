import { Router } from 'express';
import { z } from 'zod';
import {
  create,
  getAll,
  getByRegistrationNumber,
  getInRoom,
  getSchedule,
  remove,
  verify,
} from '@/controllers/checkinController';
import { authMiddleware } from '@/middlewares/authMiddleware';
import { requireAnyPermission, requirePermission } from '@/middlewares/permissionMiddleware';
import { verifyRateLimiter } from '@/middlewares/rateLimiter';
import { validateRequest } from '@/middlewares/validateRequest';
import { createCheckinSchema, inRoomQuerySchema, verifyBadgeSchema } from '@/schemas/checkinSchema';

const router: Router = Router();

/**
 * @swagger
 * /api/checkins:
 *   post:
 *     summary: Create a new check-in
 *     description: >
 *       Create a new check-in record for a member and activity. The check-in time is the
 *       server clock: it must be inside a slot of the check-in schedule. The checkOutTime must
 *       be after it.
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
 *         description: Invalid input, check-in outside the schedule, or already scanned for this slot
 *       404:
 *         description: Member or activity not found
 */
router.post(
  '/',
  authMiddleware,
  requirePermission('checkins.create'),
  validateRequest(createCheckinSchema),
  create
);

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
router.get('/', authMiddleware, requirePermission('checkins.view'), getAll);

/**
 * @swagger
 * /api/checkins/schedule:
 *   get:
 *     summary: Get the check-in schedule
 *     description: >
 *       The time zone of the app and the open days and hours that the kiosk and the badge
 *       check app show. The times of the schedule are in this time zone. Requires the
 *       checkins.create or the checkins.verify permission.
 *     tags: [Check-ins]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Check-in schedule
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
 *                   example: Check-in schedule
 *                 data:
 *                   type: object
 *                   properties:
 *                     timezone:
 *                       type: string
 *                       example: Indian/Antananarivo
 *                     schedule:
 *                       $ref: '#/components/schemas/CheckinSchedule'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 */
// Registered before `/:registrationNumber`, which would otherwise match `schedule`.
router.get(
  '/schedule',
  authMiddleware,
  requireAnyPermission('checkins.create', 'checkins.verify'),
  getSchedule
);

/**
 * @swagger
 * /api/checkins/in-room:
 *   get:
 *     summary: Get the members in the room
 *     description: >
 *       The check-ins of today, in the time zone of the app, that are still in the room: without
 *       a check-out time or with a check-out time in the future. Newest first. Requires the
 *       checkins.verify permission. Users with checkins.view get the full member and activity
 *       rows; the others get only registrationNumber, firstName, lastName and profileImage of
 *       the member, and id and name of the activity.
 *       Exception to the offset pagination of the API: this route uses a cursor, because live
 *       check-ins would move the offsets. Pass the nextBefore of a page as before to get the
 *       next page.
 *     tags: [Check-ins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *         description: Maximum number of rows; a value above 100 is lowered to 100
 *       - in: query
 *         name: before
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Return only the check-ins with an id smaller than this value
 *     responses:
 *       200:
 *         description: Members in the room
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
 *                   example: Members in room
 *                 data:
 *                   type: object
 *                   properties:
 *                     checkins:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           registrationNumber:
 *                             type: integer
 *                           activityId:
 *                             type: integer
 *                           checkInTime:
 *                             type: string
 *                             format: date-time
 *                           checkOutTime:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           visitReason:
 *                             type: string
 *                             nullable: true
 *                           Member:
 *                             type: object
 *                             properties:
 *                               registrationNumber:
 *                                 type: integer
 *                               firstName:
 *                                 type: string
 *                               lastName:
 *                                 type: string
 *                                 nullable: true
 *                               profileImage:
 *                                 type: string
 *                                 nullable: true
 *                                 example: members/3f1c2a.jpg
 *                           Activity:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                     slot:
 *                       $ref: '#/components/schemas/BadgeCheckSlot'
 *                     timezone:
 *                       type: string
 *                       example: Indian/Antananarivo
 *                     serverTime:
 *                       type: string
 *                       format: date-time
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     limit:
 *                       type: integer
 *                       example: 20
 *                     total:
 *                       type: integer
 *                       description: All the check-ins in the room, without the cursor
 *                       example: 57
 *                     hasMore:
 *                       type: boolean
 *                     nextBefore:
 *                       type: integer
 *                       nullable: true
 *                       description: The id of the last row of the page; null on the last page
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       422:
 *         description: Invalid limit or before
 */
router.get(
  '/in-room',
  authMiddleware,
  requirePermission('checkins.verify'),
  validateRequest(z.object({ query: inRoomQuerySchema })),
  getInRoom
);

/**
 * @swagger
 * components:
 *   schemas:
 *     BadgeCheckSlot:
 *       type: object
 *       nullable: true
 *       properties:
 *         day:
 *           type: string
 *           example: friday
 *         start:
 *           type: string
 *           example: '08:00'
 *         end:
 *           type: string
 *           example: '12:00'
 * /api/checkins/verify:
 *   post:
 *     summary: Check the badge of a member
 *     description: >
 *       Tells whether the member of a scanned badge has a check-in in the current slot. It
 *       never creates or changes a check-in. Each call writes one member.badge_verified audit
 *       log row; when the row cannot be written, the answer is 500. A wrong signature and an
 *       unknown member give the same INVALID_BADGE status. Requires the checkins.verify
 *       permission. Limited to 60 calls per minute for each user.
 *     tags: [Check-ins]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - registrationNumber
 *               - signature
 *             properties:
 *               registrationNumber:
 *                 type: integer
 *                 minimum: 1
 *                 example: 123
 *               signature:
 *                 type: string
 *                 maxLength: 128
 *                 description: The HMAC signature of the QR code
 *     responses:
 *       200:
 *         description: The result of the check, for the four statuses
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
 *                   example: Badge verified
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [CHECKED_IN, NOT_CHECKED_IN, NO_SLOT, INVALID_BADGE]
 *                     member:
 *                       type: object
 *                       nullable: true
 *                       description: null for INVALID_BADGE
 *                       properties:
 *                         registrationNumber:
 *                           type: integer
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                           nullable: true
 *                         photoUrl:
 *                           type: string
 *                           nullable: true
 *                           example: /uploads/members/3f1c2a.jpg
 *                     slot:
 *                       $ref: '#/components/schemas/BadgeCheckSlot'
 *                     checkIn:
 *                       type: object
 *                       nullable: true
 *                       description: Only for CHECKED_IN
 *                       properties:
 *                         id:
 *                           type: integer
 *                         time:
 *                           type: string
 *                           format: date-time
 *                         activity:
 *                           type: string
 *                           example: English Club
 *                     nextSlot:
 *                       $ref: '#/components/schemas/BadgeCheckSlot'
 *                     todaySlots:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *                           state:
 *                             type: string
 *                             enum: [ended, current, next, later]
 *                     closedToday:
 *                       type: boolean
 *                     now:
 *                       type: object
 *                       properties:
 *                         day:
 *                           type: string
 *                           example: friday
 *                         time:
 *                           type: string
 *                           example: '13:05'
 *                     timezone:
 *                       type: string
 *                       example: Indian/Antananarivo
 *                     serverTime:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 *       422:
 *         description: Invalid body
 *       429:
 *         description: Too many badge checks
 *       500:
 *         description: The check or its audit log failed
 */
router.post(
  '/verify',
  authMiddleware,
  requirePermission('checkins.verify'),
  verifyRateLimiter,
  validateRequest(verifyBadgeSchema),
  verify
);

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
router.get(
  '/:registrationNumber',
  authMiddleware,
  requirePermission('checkins.view'),
  getByRegistrationNumber
);

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
router.delete('/:id', authMiddleware, requirePermission('checkins.delete'), remove);

export default router;
