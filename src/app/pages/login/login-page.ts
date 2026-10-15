import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeliveryApi, errorMessage } from '../../services/delivery-api';
import { AuthSession } from '../../services/auth-session';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  private readonly api = inject(DeliveryApi);
  private readonly session = inject(AuthSession);
  readonly username = signal('');
  readonly password = signal('');
  readonly error = signal('');
  readonly busy = signal(false);

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
