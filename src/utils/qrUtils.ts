import crypto from 'node:crypto';
import { config } from '@/config';

export interface QRCodeData {
  registrationNumber: number;
  signature: string;
}

export function signQRCode(registrationNumber: number): QRCodeData {
  const hmac = crypto.createHmac('sha256', config.qr.secret);
  hmac.update(registrationNumber.toString());
  const signature = hmac.digest('hex');

  return {
    registrationNumber,
    signature,
  };
}

export function verifyQRCode(data: QRCodeData): boolean {
  if (!data || typeof data.registrationNumber !== 'number' || typeof data.signature !== 'string') {
    return false;
  }

  const hmac = crypto.createHmac('sha256', config.qr.secret);
  hmac.update(data.registrationNumber.toString());
  const expectedSignature = hmac.digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(data.signature), Buffer.from(expectedSignature));
  } catch {
    return false;
  }
}
