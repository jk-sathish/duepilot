import { cookies } from 'next/headers';
import crypto from 'crypto';
import { prisma } from '@/lib/db';

const SESSION_COOKIE_NAME = 'duepilot_session';
const SESSION_SECRET =
  process.env.PAYPAL_CLIENT_SECRET ||
  process.env.GEMINI_API_KEY ||
  'duepilot-institutional-session-secret-key';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
}

export function signSessionToken(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, timestamp, sig] = parts;
  const payload = `${userId}.${timestamp}`;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('hex');
  if (sig !== expectedSig) return null;
  return userId;
}

export async function setSessionCookie(userId: string) {
  const token = signSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const userId = verifySessionToken(token);
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    return user;
  } catch {
    return null;
  }
}

export function toSafeUserDto(user: any) {
  if (!user) return null;
  const hasCustomPayPal = Boolean(user.paypalClientId && user.paypalClientSecret);
  const maskedClientId = user.paypalClientId
    ? `${user.paypalClientId.slice(0, 6)}...${user.paypalClientId.slice(-4)}`
    : null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    companyName: user.companyName || 'Merchant Workspace',
    authProvider: user.authProvider,
    paypalEmail: user.paypalEmail || user.email,
    paypalEnv: user.paypalEnv || 'SANDBOX',
    defaultCurrency: user.defaultCurrency || 'USD',
    hasCustomPayPal,
    maskedClientId,
    createdAt: user.createdAt,
  };
}

export async function getPayPalCredentialsForCurrentUser(): Promise<{
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  isCustomUserCredentials: boolean;
}> {
  const user = await getCurrentUser();
  if (user?.paypalClientId && user?.paypalClientSecret) {
    const baseUrl =
      user.paypalEnv === 'LIVE'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    return {
      clientId: user.paypalClientId,
      clientSecret: user.paypalClientSecret,
      baseUrl,
      isCustomUserCredentials: true,
    };
  }

  return {
    clientId: process.env.PAYPAL_CLIENT_ID || '',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    baseUrl: process.env.PAYPAL_API_BASE_URL || 'https://api-m.sandbox.paypal.com',
    isCustomUserCredentials: false,
  };
}