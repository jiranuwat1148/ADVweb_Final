import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getAuthConfig, issueOwnerSession, verifyPasswordHash } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rate-limit';

export const authRouter = Router();
export const loginRateLimiter = createRateLimiter(20, 15 * 60 * 1000);

authRouter.post('/', loginRateLimiter, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    res.status(400).json({ message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
    return;
  }
  const input = body as Record<string, unknown>;
  const username = input['username'];
  const password = input['password'];
  if (Object.keys(input).some(key => key !== 'username' && key !== 'password') || typeof username !== 'string' || !username.trim() || username.trim().length > 100 || typeof password !== 'string' || !password || password.length > 1024) {
    res.status(400).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้องตามรูปแบบ' });
    return;
  }
  const config = getAuthConfig();
  if (!config) {
    res.status(503).json({ message: 'ยังไม่ได้ตั้งค่าบัญชีเจ้าของร้าน กรุณาตั้งค่าก่อนใช้งาน' });
    return;
  }
  try {
    // Equal-size hashes also keep username comparison independent of string length.
    const actualUsername = createHash('sha256').update(username.trim()).digest();
    const expectedUsername = createHash('sha256').update(config.username).digest();
    const passwordMatches = await verifyPasswordHash(password, config.passwordHash);
    if (!timingSafeEqual(actualUsername, expectedUsername) || !passwordMatches) {
      res.status(401).json({ message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      return;
    }
    const token = issueOwnerSession(config);
    res.json({ token, token_type: 'Bearer', expires_in: config.sessionTtlSeconds, user: { username: config.username } });
  } catch {
    res.status(503).json({ message: 'ระบบเข้าสู่ระบบไม่พร้อมใช้งาน กรุณาลองใหม่' });
  }
});
