import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerPage } from './pages/customers/customer-page';
import { OrderPage } from './pages/orders/order-page';
import { DeliveryStore } from './services/delivery-store';

type Page = 'overview' | 'orders' | 'customers' | 'rider';

@Component({
  selector: 'app-root',
  imports: [FormsModule, DecimalPipe, CustomerPage, OrderPage],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  readonly store = inject(DeliveryStore);
  readonly page = signal<Page>('overview');
  readonly loading = computed(() => this.store.customersLoading() || this.store.ordersLoading());
  readonly hasError = computed(() => !!this.store.customersError() || !!this.store.ordersError());
  readonly dates = computed(() => [...new Set(this.store.orders().map(order => order.delivery_date))].sort().reverse());
  readonly dateLabel = computed(() => {
    const date = this.store.selectedDate();
    return date ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' }).format(new Date(`${date}T12:00:00Z`)) : 'ออเดอร์ทุกวัน';
  });

  ngOnInit(): void { void this.store.refreshAll(); }
  setPage(page: Page): void { this.page.set(page); }
}
