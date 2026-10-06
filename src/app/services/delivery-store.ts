import { computed, inject, Injectable, signal } from '@angular/core';
import { Customer, DeliveryApi, errorMessage, Order } from './delivery-api';

export const BOX_PRICE = 65;
export function todayInBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// เก็บข้อมูลร่วมกัน เพื่อให้สรุปและรายชื่ออัปเดตเมื่อเพิ่ม/แก้ไข/ลบ
@Injectable({ providedIn: 'root' })
export class DeliveryStore {
  readonly api = inject(DeliveryApi);
  readonly customers = signal<Customer[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly customersLoading = signal(false);
  readonly ordersLoading = signal(false);
  readonly customersError = signal('');
  readonly ordersError = signal('');
  readonly selectedDate = signal('');
  readonly dateOrders = computed(() => this.orders().filter(order => !this.selectedDate() || order.delivery_date === this.selectedDate()));
  readonly activeOrders = computed(() => this.dateOrders().filter(order => order.status !== 'CANCELLED'));
  readonly totalBoxes = computed(() => this.activeOrders().reduce((sum, order) => sum + Number(order.quantity), 0));
  readonly revenue = computed(() => this.totalBoxes() * BOX_PRICE);
  readonly pendingCount = computed(() => this.dateOrders().filter(order => order.status === 'PENDING').length);
  private customersRequest = 0;
  private ordersRequest = 0;

  async loadCustomers(): Promise<void> {
    const request = ++this.customersRequest;
    this.customersLoading.set(true);
    this.customersError.set('');
    try {
      const customers = await this.api.listCustomers();
      if (request === this.customersRequest) this.customers.set(customers);
    } catch (error) {
      if (request === this.customersRequest) this.customersError.set(errorMessage(error));
      throw error;
    } finally {
      if (request === this.customersRequest) this.customersLoading.set(false);
    }
  }

  async loadOrders(): Promise<void> {
    const request = ++this.ordersRequest;
    this.ordersLoading.set(true);
    this.ordersError.set('');
    try {
      const orders = await this.api.listOrders();
      if (request === this.ordersRequest) this.orders.set(orders);
    } catch (error) {
      if (request === this.ordersRequest) this.ordersError.set(errorMessage(error));
      throw error;
    } finally {
      if (request === this.ordersRequest) this.ordersLoading.set(false);
    }
  }

  async refreshAll(): Promise<void> {
    await Promise.allSettled([this.loadCustomers(), this.loadOrders()]);
  }
}
