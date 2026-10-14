import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_SESSIONS = 1000;
const HASH_PATTERN = /^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;

export interface OwnerAuthConfig {
  username: string;
  passwordHash: string;
  sessionTtlSeconds: number;
}

interface Session {
  username: string;
  configFingerprint: string;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function createPasswordHash(password: string, salt: Buffer = randomBytes(SALT_BYTES)): Promise<string> {
  if (salt.length !== SALT_BYTES) throw new RangeError('Password salt must contain 16 bytes');
  const key = await derive(password, salt);
  return `scrypt$32768$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPasswordHash(password: string, passwordHash: string): Promise<boolean> {
  const match = HASH_PATTERN.exec(passwordHash);
  const saltHex = match?.[1];
  const keyHex = match?.[2];
  if (!saltHex || !keyHex) return false;
  const derived = await derive(password, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(derived, Buffer.from(keyHex, 'hex'));
}

export function getAuthConfig(): OwnerAuthConfig | null {
  const username = process.env['OWNER_USERNAME']?.trim();
  const passwordHash = process.env['OWNER_PASSWORD_HASH'];
  if (!username || username.length > 100 || !passwordHash || !HASH_PATTERN.test(passwordHash)) return null;
  const configuredTtl = Number(process.env['SESSION_TTL_SECONDS']);
  const sessionTtlSeconds = Number.isSafeInteger(configuredTtl) && configuredTtl >= 60 && configuredTtl <= DEFAULT_SESSION_TTL_SECONDS
    ? configuredTtl : DEFAULT_SESSION_TTL_SECONDS;
  return { username, passwordHash, sessionTtlSeconds };
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function configFingerprint(config: OwnerAuthConfig): string {
  return digest(`${config.username}\0${config.passwordHash}`);
}

function purgeExpiredSessions(now: number): void {
  for (const [tokenHash, session] of sessions) if (session.expiresAt <= now) sessions.delete(tokenHash);
}

export function issueOwnerSession(config: OwnerAuthConfig): string {
  const now = Date.now();
  purgeExpiredSessions(now);
  if (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest !== undefined) sessions.delete(oldest);
  }
  let token = randomBytes(32).toString('base64url');
  while (sessions.has(digest(token))) token = randomBytes(32).toString('base64url');
  sessions.set(digest(token), {
    username: config.username,
    configFingerprint: configFingerprint(config),
    expiresAt: now + config.sessionTtlSeconds * 1000,
  });
  return token;
}

export const requireOwner: RequestHandler = (req, res, next) => {
  const config = getAuthConfig();
  if (!config) {
    res.status(503).json({ message: 'ยังไม่ได้ตั้งค่าบัญชีเจ้าของร้าน กรุณาตั้งค่าก่อนใช้งาน' });
    return;
  }
  const now = Date.now();
  purgeExpiredSessions(now);
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(req.get('Authorization') ?? '')?.[1];
  const session = token ? sessions.get(digest(token)) : undefined;
  if (!session || session.configFingerprint !== configFingerprint(config)) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ message: 'กรุณาเข้าสู่ระบบเจ้าของร้านอีกครั้ง' });
    return;
  }
  res.locals['owner'] = { username: session.username };
  next();
};

export function resetSessionsForTests(): void {
  sessions.clear();
}
