import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { EOL } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { stdin, stdout, stderr } from 'node:process';
import { Writable } from 'node:stream';
import { createPasswordHash } from '../middleware/auth';

/** Preserve all unrelated lines and line endings, including database credentials. */
export function mergeOwnerEnv(existing: string, username: string, passwordHash: string): string {
  if (username.length > 100 || !/^[\p{L}\p{N}_.-]{1,100}$/u.test(username) || !/^scrypt\$32768\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash)) throw new Error('Invalid owner configuration');
  const replacements: Record<string, string> = {
    OWNER_USERNAME: `OWNER_USERNAME=${username}`,
    OWNER_PASSWORD_HASH: `OWNER_PASSWORD_HASH=${passwordHash}`,
  };
  const seen = new Set<string>();
  const parts = existing.split(/(\r?\n)/);
  let result = '';
  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index] ?? '';
    const ending = parts[index + 1] ?? '';
    const key = /^\s*(?:export\s+)?(OWNER_USERNAME|OWNER_PASSWORD_HASH)\s*=/.exec(line)?.[1];
    if (!key) result += line + ending;
    else if (!seen.has(key)) { result += replacements[key] + ending; seen.add(key); }
  }
  const ending = existing.includes('\r\n') ? '\r\n' : existing.includes('\n') ? '\n' : EOL;
  for (const key of ['OWNER_USERNAME', 'OWNER_PASSWORD_HASH']) {
    if (seen.has(key)) continue;
    if (result && !result.endsWith('\n')) result += ending;
    result += replacements[key] + ending;
  }
  return result;
}

class MutedOutput extends Writable {
  muted = false;
  override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.muted) stdout.write(chunk, encoding);
    callback();
  }
}

export async function setupAuth(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Interactive terminal required');
  const output = new MutedOutput();
  const rl = createInterface({ input: stdin, output, terminal: true });
  const ask = (prompt: string, hidden = false): Promise<string> => {
    stdout.write(prompt);
    output.muted = hidden;
    return new Promise<string>((done, reject) => {
      const closed = (): void => { reject(new Error('Input closed')); };
      rl.once('close', closed);
      rl.question('', answer => { rl.removeListener('close', closed); done(answer); });
    }).finally(() => { output.muted = false; if (hidden) stdout.write(EOL); });
  };
  try {
    const username = (await ask('ชื่อผู้ใช้เจ้าของร้าน (ตัวอักษร/ตัวเลข/._-): ')).trim();
    if (username.length > 100 || !/^[\p{L}\p{N}_.-]{1,100}$/u.test(username)) throw new Error('Invalid username');
    const password = await ask('รหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษร; ไม่แสดงขณะพิมพ์): ', true);
    if (password.length < 12 || password.length > 1024) throw new Error('Invalid password length');
    const confirmation = await ask('ยืนยันรหัสผ่าน: ', true);
    const passwordDigest = createHash('sha256').update(password).digest();
    const confirmationDigest = createHash('sha256').update(confirmation).digest();
    if (!timingSafeEqual(passwordDigest, confirmationDigest)) throw new Error('Password confirmation does not match');
    const passwordHash = await createPasswordHash(password);
    const envPath = resolve(process.cwd(), '.env');
    let existing = '';
    try { existing = await readFile(envPath, 'utf8'); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    const updated = mergeOwnerEnv(existing, username, passwordHash);
    const tempPath = `${envPath}.owner-${randomBytes(8).toString('hex')}.tmp`;
    try {
      await writeFile(tempPath, updated, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(tempPath, envPath);
    } finally { await rm(tempPath, { force: true }); }
    stdout.write('ตั้งค่าบัญชีเจ้าของร้านแล้ว กรุณาเริ่ม Backend ใหม่' + EOL);
  } finally { rl.close(); output.end(); }
}

if (require.main === module) {
  setupAuth().catch(() => {
    stderr.write('ตั้งค่าบัญชีไม่สำเร็จ: ตรวจชื่อผู้ใช้ รหัสผ่านและการยืนยัน แล้วรันใน terminal อีกครั้ง' + EOL);
    process.exitCode = 1;
  });
}
