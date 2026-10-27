import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeliveryApi, errorMessage } from '../../services/delivery-api';
import { AuthSession } from '../../services/auth-session';
import { RiderJobPage } from '../rider/rider-job-page';

type LoginMode = 'owner' | 'rider';
const MODE_KEY = 'lunch-dispatch-login-mode';

function readMode(): LoginMode {
  try { return window.sessionStorage.getItem(MODE_KEY) === 'rider' ? 'rider' : 'owner'; }
  catch { return 'owner'; }
}

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, RiderJobPage],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  private readonly api = inject(DeliveryApi);
  private readonly session = inject(AuthSession);
  readonly mode = signal<LoginMode>(readMode());
  readonly riderSheetOpen = signal(false);
  readonly username = signal('');
  readonly password = signal('');
  readonly error = signal('');
  readonly busy = signal(false);

  setMode(mode: LoginMode): void {
    this.mode.set(mode);
    if (mode === 'owner') this.riderSheetOpen.set(false);
    try { window.sessionStorage.setItem(MODE_KEY, mode); } catch { /* ไม่มี storage ก็ใช้งานต่อได้ */ }
  }

  async login(): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const result = await this.api.login({ username: this.username().trim(), password: this.password() });
      this.session.start(result.token, result.user.username, result.expires_in);
      this.password.set('');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
