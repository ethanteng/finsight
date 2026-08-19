import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

/**
 * The historical fallback secret. It is committed to this repository, so any
 * deployment still signing with it can have tokens forged for any user id —
 * which is every user's financial data, without touching a password. It stays
 * named here only so we can recognize and reject it.
 */
const INSECURE_FALLBACK_JWT_SECRET = 'your-secret-key-change-in-production';

/** Below this, a secret is short enough to be worth brute forcing. */
const MIN_RECOMMENDED_JWT_SECRET_LENGTH = 32;

const JWT_EXPIRES_IN = '24h'; // 24 hours

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Resolve the signing secret, refusing the known-public fallback in production.
 *
 * Outside production the fallback still works, so local development and tests
 * need no setup — the failure mode we care about is a production deploy that
 * boots happily with a secret anyone can read on GitHub.
 */
function resolveJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();

  if (!configured || configured === INSECURE_FALLBACK_JWT_SECRET) {
    if (isProduction()) {
      throw new Error(
        'JWT_SECRET is unset or still the public default value. Refusing to sign or verify tokens: ' +
          'anyone could forge a session for any user. Set JWT_SECRET to a unique random value ' +
          `of at least ${MIN_RECOMMENDED_JWT_SECRET_LENGTH} characters.`
      );
    }
    return INSECURE_FALLBACK_JWT_SECRET;
  }

  return configured;
}

/**
 * Fail the boot rather than the first login when auth is misconfigured.
 *
 * Called from server startup. A short secret is only warned about: it is a
 * weakness rather than a break, and taking a running production service down
 * over one would do more damage than the risk it removes.
 */
export function assertJwtSecretConfigured(): void {
  resolveJwtSecret();

  const configured = process.env.JWT_SECRET?.trim();
  if (configured && configured.length < MIN_RECOMMENDED_JWT_SECRET_LENGTH) {
    console.warn(
      `⚠️  JWT_SECRET is only ${configured.length} characters. Use at least ` +
        `${MIN_RECOMMENDED_JWT_SECRET_LENGTH} random characters.`
    );
  }

  if (!isProduction() && (!configured || configured === INSECURE_FALLBACK_JWT_SECRET)) {
    console.warn(
      '⚠️  JWT_SECRET is not set. Using the public development fallback. ' +
        'This value is rejected when NODE_ENV=production.'
    );
  }
}

export interface JWTPayload {
  userId: string;
  email: string;
  tier: string;
}

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, resolveJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  // Resolved outside the catch on purpose. A misconfigured secret is not a bad
  // token, and swallowing it here would make a whole deployment look like it
  // was handing out expired sessions.
  const secret = resolveJwtSecret();
  try {
    return jwt.verify(token, secret) as JWTPayload;
  } catch (error) {
    return null;
  }
}

export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

export async function validateUserCredentials(
  prisma: PrismaClient,
  email: string,
  password: string
): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }

    if (!user.isActive) {
      return { success: false, error: 'Account is deactivated' };
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return { success: false, error: 'Invalid email or password' };
    }

    return { success: true, user };
  } catch (error) {
    console.error('Error validating user credentials:', error);
    return { success: false, error: 'Authentication error' };
  }
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long' };
  }
  
  if (!/(?=.*[a-z])/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one lowercase letter' };
  }
  
  if (!/(?=.*[A-Z])/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one uppercase letter' };
  }
  
  if (!/(?=.*\d)/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one number' };
  }
  
  return { isValid: true };
} 