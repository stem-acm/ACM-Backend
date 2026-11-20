import rateLimit from 'express-rate-limit';
import { config } from '@/config';
import type { AuthRequest } from '@/middlewares/authMiddleware';

export const generalRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
    data: null,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many login attempts, please try again later',
    data: null,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const profileRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many profile update attempts, please try again later',
    data: null,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * The limiter of the badge check: `max` requests per `windowMs` for each user. It runs after
 * `authMiddleware`: the key is the user id, not the IP address, because all the phones of the
 * club share one IP address.
 */
export function createVerifyRateLimiter(max = 60, windowMs = 60 * 1000) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => `user:${(req as AuthRequest).user?.id ?? req.ip}`,
    message: {
      success: false,
      message: 'Too many badge checks, please try again later',
      data: null,
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export const verifyRateLimiter = createVerifyRateLimiter();
