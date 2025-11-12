import jwt from 'jsonwebtoken';
import { config } from '@/config';

interface TokenPayload {
  id: number;
  username: string;
  email: string;
}

export function generateToken(payload: TokenPayload): string {
  if (!config.jwt.secret) {
    throw new Error('JWT secret is not configured');
  }
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token', { cause: error });
  }
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}
