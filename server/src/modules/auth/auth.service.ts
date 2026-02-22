import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, or } from 'drizzle-orm';
import { env } from '../../config/env';
import { db } from '../../db/index';
import { users } from '../../db/schema/index';
import { redis, RedisKeys, REFRESH_TOKEN_TTL } from '../../plugins/redis';

const BCRYPT_ROUNDS = 12;

/** Seconds the access token is valid for — kept in sync with JWT_ACCESS_EXPIRES_IN default */
export const ACCESS_EXPIRES_SECONDS = 15 * 60;

// ── Password ─────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── Token generation & verification ──────────────────────────────────────────

export interface TokenPayload {
  id: string;
  role: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ id: userId }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & TokenPayload;
}

export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload & { id: string };
}

export function buildTokenResponse(accessToken: string): {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
} {
  return { accessToken, tokenType: 'Bearer', expiresIn: ACCESS_EXPIRES_SECONDS };
}

// ── Redis operations ──────────────────────────────────────────────────────────

export async function storeRefreshToken(userId: string, token: string): Promise<void> {
  await redis.set(RedisKeys.refreshToken(userId), token, 'EX', REFRESH_TOKEN_TTL);
}

export async function getStoredRefreshToken(userId: string): Promise<string | null> {
  return redis.get(RedisKeys.refreshToken(userId));
}

export async function deleteRefreshToken(userId: string): Promise<void> {
  await redis.del(RedisKeys.refreshToken(userId));
}

// ── Database operations ───────────────────────────────────────────────────────

export async function findUserByEmailOrUsername(email: string, username: string) {
  return db
    .select({ id: users.id, email: users.email, username: users.username })
    .from(users)
    .where(or(eq(users.email, email), eq(users.username, username)))
    .limit(1);
}

export async function createUser(data: {
  email: string;
  username: string;
  displayName: string;
  passwordHash: string;
}) {
  const [user] = await db
    .insert(users)
    .values(data)
    .returning({
      id: users.id,
      email: users.email,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
    });
  return user;
}

export async function findUserByEmail(email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}
