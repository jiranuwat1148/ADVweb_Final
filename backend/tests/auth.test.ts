import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { createServer } from 'node:http';
import express from 'express';
import type { Request, Response } from 'express';
import { authRouter, loginRateLimiter } from '../controller/auth';
import { createPasswordHash, getAuthConfig, issueOwnerSession, requireOwner, resetSessionsForTests, verifyPasswordHash } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rate-limit';
import { mergeOwnerEnv } from '../scripts/setup-auth';

// Only test fixtures: no dotenv import, filesystem access or database connection.
const TEST_USERNAME = 'test-owner';
const TEST_PASSWORD = 'Fixture-Only-Password-123!';
const envKeys = ['OWNER_USERNAME', 'OWNER_PASSWORD_HASH', 'SESSION_TTL_SECONDS'] as const;
const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const realNow = Date.now;
let passwordHash: string;
let baseUrl: string;
const app = express();
app.use(express.json());
app.use('/api/auth/login', authRouter);
app.get('/protected', requireOwner, (_req, res) => { res.json({ username: res.locals['owner'].username }); });
const server = createServer(app);

async function login(input: unknown): Promise<globalThis.Response> {
  return fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) ?? 'null' });
}

async function guard(token?: string): Promise<globalThis.Response> {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers['Authorization'] = token;
  return fetch(`${baseUrl}/protected`, { headers });
}

async function loginToken(): Promise<string> {
  const response = await login({ username: TEST_USERNAME, password: TEST_PASSWORD });
  assert.equal(response.status, 200);
  const body = await response.json() as { token: string; token_type: string; expires_in: number; user: { username: string } };
  assert.equal(body.token_type, 'Bearer');
  assert.equal(body.user.username, TEST_USERNAME);
  assert.equal(body.expires_in, 28800);
  assert.match(body.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(body.token, 'base64url').length, 32);
  return body.token;
}

before(async () => {
  passwordHash = await createPasswordHash(TEST_PASSWORD, Buffer.alloc(16, 0x4a));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => {
  process.env['OWNER_USERNAME'] = TEST_USERNAME;
  process.env['OWNER_PASSWORD_HASH'] = passwordHash;
  delete process.env['SESSION_TTL_SECONDS'];
  resetSessionsForTests();
  loginRateLimiter.resetForTests();
});

afterEach(() => { Date.now = realNow; });
after(async () => {
  Date.now = realNow;
  for (const key of envKeys) {
    const previous = previousEnv[key];
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  resetSessionsForTests();
  loginRateLimiter.resetForTests();
  await new Promise<void>((resolve, reject) => { server.close(error => { if (error) reject(error); else resolve(); }); });
});

describe('single-owner authentication', () => {
  it('verifies deterministic salted scrypt hashes and rejects wrong/malformed hashes', async () => {
    assert.match(passwordHash, /^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    assert.equal(passwordHash.split('$')[4], '4a'.repeat(16));
    assert.equal(await verifyPasswordHash(TEST_PASSWORD, passwordHash), true);
    assert.equal(await verifyPasswordHash('wrong fixture', passwordHash), false);
    assert.equal(await verifyPasswordHash(TEST_PASSWORD, 'not-a-hash'), false);
  });

  it('issues an opaque bearer token and authorizes the configured owner', async () => {
    const token = await loginToken();
    const response = await guard(`Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { username: TEST_USERNAME });
  });

  it('rejects incorrect credentials without creating an authenticated session', async () => {
    assert.equal((await login({ username: TEST_USERNAME, password: 'wrong' })).status, 401);
    assert.equal((await login({ username: 'another-owner', password: TEST_PASSWORD })).status, 401);
  });

  it('rejects missing/malformed fields, array bodies and unknown input keys', async () => {
    for (const input of [null, [], { username: TEST_USERNAME }, { username: TEST_USERNAME, password: TEST_PASSWORD, role: 'owner' }, { username: 7, password: TEST_PASSWORD }]) {
      assert.equal((await login(input)).status, 400);
    }
  });

  it('fails closed when credentials are missing or the configured hash is invalid', async () => {
    delete process.env['OWNER_PASSWORD_HASH'];
    assert.equal(getAuthConfig(), null);
    assert.equal((await login({ username: TEST_USERNAME, password: TEST_PASSWORD })).status, 503);
    assert.equal((await guard()).status, 503);
    process.env['OWNER_PASSWORD_HASH'] = 'plaintext-is-not-accepted';
    assert.equal((await guard()).status, 503);
  });

  it('rejects absent, malformed and tampered bearer tokens', async () => {
    const token = await loginToken();
    assert.equal((await guard()).status, 401);
    assert.equal((await guard(`Basic ${token}`)).status, 401);
    const tampered = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`;
    const response = await guard(`Bearer ${tampered}`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  });

  it('expires sessions at their configured TTL and bounds invalid TTL settings', async () => {
    let now = realNow();
    Date.now = () => now;
    process.env['SESSION_TTL_SECONDS'] = '60';
    const response = await login({ username: TEST_USERNAME, password: TEST_PASSWORD });
    const body = await response.json() as { token: string; expires_in: number };
    assert.equal(response.status, 200);
    assert.equal(body.expires_in, 60);
    assert.equal((await guard(`Bearer ${body.token}`)).status, 200);
    now += 60000;
    assert.equal((await guard(`Bearer ${body.token}`)).status, 401);
    process.env['SESSION_TTL_SECONDS'] = '99999999';
    assert.equal(getAuthConfig()?.sessionTtlSeconds, 28800);
    process.env['SESSION_TTL_SECONDS'] = '-1';
    assert.equal(getAuthConfig()?.sessionTtlSeconds, 28800);
  });

  it('invalidates sessions after owner configuration changes', async () => {
    const token = await loginToken();
    process.env['OWNER_USERNAME'] = 'changed-owner';
    assert.equal((await guard(`Bearer ${token}`)).status, 401);
  });

  it('retains at most 1000 sessions and evicts the oldest when the limit is reached', async () => {
    const config = getAuthConfig();
    assert.ok(config);
    const oldest = issueOwnerSession(config);
    let latest = oldest;
    for (let index = 0; index < 1000; index++) latest = issueOwnerSession(config);
    assert.equal((await guard(`Bearer ${oldest}`)).status, 401);
    assert.equal((await guard(`Bearer ${latest}`)).status, 200);
  });

  it('limits login to 20 attempts per socket IP in 15 minutes', async () => {
    for (let attempt = 0; attempt < 20; attempt++) assert.equal((await login({})).status, 400);
    const response = await login({ username: TEST_USERNAME, password: TEST_PASSWORD });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) > 0);
  });
});

describe('rate limiter and setup helpers', () => {
  it('ignores forwarding headers and resets expired fixed windows', () => {
    let now = realNow();
    Date.now = () => now;
    const limiter = createRateLimiter(2, 1000);
    const invoke = (forwarded: string): { status: number; next: boolean; retryAfter: string | undefined } => {
      const result = { status: 200, next: false, retryAfter: undefined as string | undefined };
      const req = { socket: { remoteAddress: '127.0.0.1' }, ip: forwarded, headers: { 'x-forwarded-for': forwarded } } as unknown as Request;
      const res = {
        setHeader: (name: string, value: string) => { if (name === 'Retry-After') result.retryAfter = value; },
        status: (status: number) => { result.status = status; return res; },
        json: () => res,
      } as unknown as Response;
      limiter(req, res, () => { result.next = true; });
      return result;
    };
    assert.equal(invoke('1.2.3.4').next, true);
    assert.equal(invoke('4.3.2.1').next, true);
    assert.equal(invoke('8.8.8.8').status, 429);
    assert.equal(invoke('9.9.9.9').retryAfter, '1');
    now += 1000;
    assert.equal(invoke('1.2.3.4').next, true);
  });

  it('changes only owner env lines and preserves unrelated database lines/endings', () => {
    const unrelated = '# test fixture\r\nDB_HOST=localhost\r\nDB_PASSWORD="fixture-only"\r\n';
    const content = `${unrelated}OWNER_USERNAME=old\r\nOWNER_PASSWORD_HASH=old-hash\r\nOWNER_USERNAME=duplicate\r\nPORT=3000`;
    const updated = mergeOwnerEnv(content, TEST_USERNAME, passwordHash);
    assert.ok(updated.startsWith(unrelated));
    assert.ok(updated.endsWith('PORT=3000'));
    assert.equal(updated.match(/^OWNER_USERNAME=/gm)?.length, 1);
    assert.ok(updated.includes(`OWNER_PASSWORD_HASH=${passwordHash}\r\n`));
    assert.equal(updated.includes(TEST_PASSWORD), false);
  });
});
