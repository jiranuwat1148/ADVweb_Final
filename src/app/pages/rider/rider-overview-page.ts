import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../services/delivery-api';
import { DeliveryStore, todayInBangkok } from '../../services/delivery-store';
import { DeliveryPlan, PlanApi } from '../../services/plan-api';

@Component({
  selector: 'app-rider-overview-page',
  standalone: true,
  imports: [DecimalPipe, FormsModule],
  templateUrl: './rider-overview-page.html',
  styleUrl: './rider-overview-page.css',
})
export class RiderOverviewPage {
  private readonly api = inject(PlanApi);
  readonly store = inject(DeliveryStore);
  readonly today = todayInBangkok();
  readonly selectedDate = signal(this.today);
  readonly dates = computed(() => [...new Set([this.today, ...this.store.orders().map(order => order.delivery_date)])].sort().reverse());
  readonly plan = signal<DeliveryPlan | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private requestId = 0;
  readonly dateLabel = computed(() => {
    const date = this.selectedDate();
    return date
      ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' }).format(new Date(`${date}T12:00:00Z`))
      : 'เลือกวันที่จัดส่ง';
  });

  constructor() { void this.refresh(); }

  async refresh(): Promise<void> {
    const request = ++this.requestId;
    const date = this.selectedDate();
    if (!date) {
      this.plan.set(null);
      this.error.set('เลือกวันที่จัดส่งก่อน');
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const plans = await this.api.list(date);
      if (request === this.requestId) this.plan.set(plans.find(plan => plan.status === 'CONFIRMED') ?? null);
    } catch (error) {
      if (request === this.requestId) this.error.set(errorMessage(error));
    } finally {
      if (request === this.requestId) this.loading.set(false);
    }
  }

  setDate(date: string): void {
    this.selectedDate.set(date);
    this.plan.set(null);
    void this.refresh();
  }
}
