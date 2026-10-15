import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../services/delivery-api';
import { DeliveryPlan, PlanApi, PlanJob, RoutingMode } from '../../services/plan-api';
import { DeliveryStore } from '../../services/delivery-store';
import { DispatchMapComponent } from './dispatch-map.component';

interface RouteView {
  job: PlanJob;
  finishTime: string;
}

@Component({
  selector: 'app-overview-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe, DispatchMapComponent],
  templateUrl: './overview-page.html',
  styleUrl: './overview-page.css',
})
export class OverviewPage {
  readonly store = inject(DeliveryStore);
  private readonly planApi = inject(PlanApi);

  readonly routingMode = signal<RoutingMode>('road');
  readonly drafts = signal<DeliveryPlan[]>([]);
  readonly selectedPlanId = signal<number | null>(null);
  readonly selectedJobId = signal<number | null>(null);
  readonly pendingAction = signal<'create' | 'refresh' | 'confirm' | null>(null);
  readonly planError = signal('');
  readonly planNotice = signal('');
  readonly pendingOrders = computed(() => this.store.dateOrders().filter(order => order.status === 'PENDING'));
  readonly pendingBoxes = computed(() => this.pendingOrders().reduce((sum, order) => sum + Number(order.quantity), 0));
  readonly dates = computed(() => [...new Set(this.store.orders().map(order => order.delivery_date))].sort().reverse());
  readonly selectedPlan = computed(() => {
    const date = this.store.selectedDate();
    if (!date) return null;
    return this.drafts().find(plan => plan.id === this.selectedPlanId() && plan.delivery_date === date) ?? null;
  });
  readonly plansForDate = computed(() => {
    const date = this.store.selectedDate();
    return date ? this.drafts().filter(plan => plan.delivery_date === date) : [];
  });
  readonly selectedJob = computed(() => this.selectedPlan()?.jobs.find(job => job.id === this.selectedJobId()) ?? null);
  readonly routeViews = computed(() => this.selectedPlan()?.jobs.map(job => ({
    job,
    finishTime: this.timePart(job.stops.at(-1)?.estimated_delivery_at ?? ''),
  })) ?? []);
  readonly dateLabel = computed(() => {
    const date = this.store.selectedDate();
    return date
      ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long' }).format(new Date(`${date}T12:00:00Z`))
      : 'เลือกวันที่เพื่อจัดแผน';
  });
  constructor() {
    effect(() => {
      const date = this.store.selectedDate();
      const plans = this.drafts().filter(plan => plan.delivery_date === date);
      if (plans.some(plan => plan.id === this.selectedPlanId())) return;
      const newest = plans[0];
      this.selectedPlanId.set(newest?.id ?? null);
      this.selectedJobId.set(newest?.jobs[0]?.id ?? null);
    });
  }

  async createPlan(): Promise<void> {
    const date = this.store.selectedDate();
    if (!date) {
      this.planError.set('เลือกวันที่จัดส่งก่อนสร้างแผน');
      return;
    }
    if (!this.pendingOrders().length) {
      this.planError.set('วันที่เลือกไม่มีออเดอร์ที่รอจัดแผน');
      return;
    }
    if (this.pendingAction()) return;

    this.pendingAction.set('create');
    this.planError.set('');
    this.planNotice.set('');
    try {
      const plan = await this.planApi.create(date, this.routingMode());
      this.savePlan(plan);
      this.planNotice.set(`สร้างแผน #${plan.id} แล้ว${plan.is_simulation ? ' (โหมดจำลอง)' : ''}`);
    } catch (error) {
      this.planError.set(errorMessage(error));
    } finally {
      this.pendingAction.set(null);
    }
  }

  async selectPlan(id: number | null): Promise<void> {
    if (id === null) return;
    this.selectedPlanId.set(id);
    const existing = this.drafts().find(plan => plan.id === id);
    this.selectedJobId.set(existing?.jobs[0]?.id ?? null);
    this.planError.set('');
    this.planNotice.set('');
    if (this.pendingAction()) return;

    this.pendingAction.set('refresh');
    try {
      this.savePlan(await this.planApi.get(id));
    } catch (error) {
      this.planError.set(errorMessage(error));
    } finally {
      this.pendingAction.set(null);
    }
  }

  selectJob(id: number): void {
    this.selectedJobId.set(id);
  }

  async confirmPlan(): Promise<void> {
    const plan = this.selectedPlan();
    if (!plan || !plan.can_confirm || this.pendingAction()) return;

    this.pendingAction.set('confirm');
    this.planError.set('');
    this.planNotice.set('');
    try {
      const latest = await this.planApi.get(plan.id);
      this.savePlan(latest);
      if (!latest.can_confirm) {
        this.planError.set(latest.stale
          ? 'แผนนี้ล้าสมัยเพราะข้อมูลเปลี่ยนแล้ว กรุณาคำนวณใหม่'
          : 'แผนนี้ยืนยันไม่ได้');
        return;
      }
      const confirmed = await this.planApi.confirm(plan.id);
      this.savePlan(confirmed);
      this.planNotice.set(confirmed.already_confirmed ? 'แผนนี้ได้รับการยืนยันแล้ว' : `ยืนยันแผน #${confirmed.id} แล้ว`);
      await this.store.loadOrders().catch(() => undefined);
    } catch (error) {
      this.planError.set(errorMessage(error));
    } finally {
      this.pendingAction.set(null);
    }
  }

  timePart(value: string): string {
    return value.length >= 16 ? value.slice(11, 16) : '—';
  }

  private savePlan(plan: DeliveryPlan): void {
    this.drafts.update(current => [plan, ...current.filter(item => item.id !== plan.id)]);
    this.selectedPlanId.set(plan.id);
    this.selectedJobId.set(plan.jobs[0]?.id ?? null);
  }
}
