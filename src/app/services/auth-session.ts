import { Injectable, signal } from '@angular/core';

interface StoredSession {
  token: string;
  username: string;
  expiresAt: number;
}

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

function readStoredSession(): StoredSession | null {
  const value = storage()?.getItem('lunch-dispatch-session');
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const session = parsed as Partial<StoredSession>;
    return typeof session.token === 'string' && typeof session.username === 'string' &&
      typeof session.expiresAt === 'number' ? session as StoredSession : null;
  } catch { return null; }
}

@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly initialSession = readStoredSession();
  readonly token = signal<string | null>(this.initialSession?.token ?? null);
  readonly username = signal<string>(this.initialSession?.username ?? '');

  constructor() {
    if (this.initialSession && this.initialSession.expiresAt <= Date.now()) this.clear();
  }

  start(token: string, username: string, expiresInSeconds: number): void {
    const session: StoredSession = {
      token,
      username,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    };
    storage()?.setItem('lunch-dispatch-session', JSON.stringify(session));
    this.token.set(token);
    this.username.set(username);
  }

  clear(): void {
    storage()?.removeItem('lunch-dispatch-session');
    this.token.set(null);
    this.username.set('');
  }
}
