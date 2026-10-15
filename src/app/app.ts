import { Component, computed, effect, inject, signal } from '@angular/core';
import { OverviewPage } from './pages/overview/overview-page';
import { LoginPage } from './pages/login/login-page';
import { CustomerPage } from './pages/customers/customer-page';
import { OrderPage } from './pages/orders/order-page';
import { AuthSession } from './services/auth-session';
import { DeliveryStore } from './services/delivery-store';

type Page = 'overview' | 'orders' | 'customers' | 'rider';

@Component({
  selector: 'app-root',
  imports: [OverviewPage, LoginPage, CustomerPage, OrderPage],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  readonly store = inject(DeliveryStore);
  readonly auth = inject(AuthSession);
  readonly page = signal<Page>('overview');
  readonly loading = computed(() => this.store.customersLoading() || this.store.ordersLoading());
  readonly hasError = computed(() => !!this.store.customersError() || !!this.store.ordersError());

  constructor() {
    effect(() => {
      if (this.auth.token()) void this.store.refreshAll();
      else this.store.clear();
    });
  }

  setPage(page: Page): void { this.page.set(page); }

  logout(): void { this.auth.clear(); }
}
