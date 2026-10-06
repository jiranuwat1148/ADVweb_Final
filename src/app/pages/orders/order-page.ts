import { DecimalPipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnDestroy, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeliveryApi, errorMessage, Order } from '../../services/delivery-api';
import { BOX_PRICE, DeliveryStore, todayInBangkok } from '../../services/delivery-store';

function validDeliveryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || value < '1000-01-01' || value > '9999-12-31') return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

@Component({
  selector: 'app-order-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './order-page.html',
  styleUrl: './order-page.css',
})
export class OrderPage implements OnDestroy {
  readonly store = inject(DeliveryStore);
  private readonly api = inject(DeliveryApi);
  readonly boxPrice = BOX_PRICE;
  readonly search = signal('');
  readonly filter = signal<'all' | 'pending'>('all');
  readonly busy = signal(false);
  readonly notice = signal('');
  readonly pageError = signal('');
  readonly dateFilterError = signal('');
  readonly editorMode = signal<'add' | 'edit'>('add');
  readonly editingOrder = signal<Order | null>(null);
  readonly editorLoading = signal(false);
  readonly editorError = signal('');
  readonly deletingOrder = signal<Order | null>(null);
  readonly deleteError = signal('');
  readonly simulationError = signal('');

  orderForm: { customer_id: number | null; quantity: number | null; delivery_date: string } = {
    customer_id: null, quantity: 1, delivery_date: todayInBangkok(),
  };
  simulationForm: { count: number | null; delivery_date: string } = {
    count: 24, delivery_date: todayInBangkok(),
  };

  readonly visibleOrders = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    return this.store.dateOrders().filter(order => {
      if (this.filter() === 'pending' && order.status !== 'PENDING') return false;
      return !query || `${this.orderCode(order.id)} ${order.id} ${order.customer_name} ${order.customer_phone}`
        .toLocaleLowerCase().includes(query);
    });
  });

  @ViewChild('orderDialog') orderDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('deleteDialog') deleteDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('simulationDialog') simulationDialog?: ElementRef<HTMLDialogElement>;

  private detailRequest = 0;
  private destroyed = false;

  ngOnDestroy(): void {
    this.destroyed = true;
    this.detailRequest++;
  }

  orderCode(id: number): string { return `ORD-${String(id).padStart(3, '0')}`; }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'พร้อมจัดส่ง', ASSIGNED: 'อยู่ในแผนจัดส่ง', DELIVERED: 'ส่งแล้ว', CANCELLED: 'ยกเลิก',
    };
    return labels[status] ?? status;
  }

  setDateFilter(value: string): void {
    if (value && !validDeliveryDate(value)) {
      this.dateFilterError.set('เลือกวันที่ที่มีอยู่จริง ตั้งแต่ปี 1000 ถึง 9999');
      return;
    }
    this.dateFilterError.set('');
    this.store.selectedDate.set(value);
  }

  async reloadOrders(): Promise<void> {
    if (this.busy() || this.store.ordersLoading()) return;
    this.pageError.set('');
    try { await this.store.loadOrders(); }
    catch { /* DeliveryStore แสดงข้อความของ backend ใน ordersError */ }
  }

  openAdd(): void {
    if (this.busy() || this.store.ordersLoading()) return;
    this.detailRequest++;
    this.editorMode.set('add');
    this.editingOrder.set(null);
    this.editorLoading.set(false);
    this.editorError.set('');
    this.clearMessages();
    this.orderForm = { customer_id: null, quantity: 1, delivery_date: this.defaultDate() };
    this.show(this.orderDialog);
  }

  async openEdit(order: Order): Promise<void> {
    if (this.busy() || this.store.ordersLoading()) return;
    const request = ++this.detailRequest;
    this.editorMode.set('edit');
    this.editingOrder.set(null);
    this.editorLoading.set(true);
    this.editorError.set('');
    this.clearMessages();
    this.show(this.orderDialog);
    try {
      const detail = await this.api.getOrder(order.id);
      if (request !== this.detailRequest || this.destroyed) return;
      this.editingOrder.set(detail);
      this.orderForm = { customer_id: detail.customer_id, quantity: Number(detail.quantity), delivery_date: detail.delivery_date };
      if (detail.status !== 'PENDING') {
        this.editorError.set('แก้ไขได้เฉพาะออเดอร์ PENDING ที่ยังไม่อยู่ในแผนจัดส่ง');
      }
    } catch (error) {
      if (request === this.detailRequest && !this.destroyed) this.editorError.set(errorMessage(error));
    } finally {
      if (request === this.detailRequest && !this.destroyed) this.editorLoading.set(false);
    }
  }

  closeEditor(force = false): void {
    if (this.busy() && !force) return;
    this.detailRequest++;
    this.editorLoading.set(false);
    this.orderDialog?.nativeElement.close();
  }

  cancelEditor(event: Event): void {
    event.preventDefault();
    this.closeEditor();
  }

  async saveOrder(): Promise<void> {
    if (this.busy() || this.editorLoading() || this.store.ordersLoading()) return;
    this.editorError.set('');
    const { quantity, delivery_date, customer_id } = this.orderForm;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 3) {
      this.editorError.set('จำนวนข้าวต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 3 กล่อง');
      return;
    }
    if (!validDeliveryDate(delivery_date)) {
      this.editorError.set('วันที่ส่งต้องมีอยู่จริง ในรูปแบบ YYYY-MM-DD ตั้งแต่ปี 1000 ถึง 9999');
      return;
    }
    const editing = this.editorMode() === 'edit';
    const order = this.editingOrder();
    if (editing && (!order || order.status !== 'PENDING')) {
      this.editorError.set('กรุณาเปิดออเดอร์ PENDING เพื่อแก้ไข');
      return;
    }
    if (!editing && (typeof customer_id !== 'number' || !Number.isSafeInteger(customer_id)
      || customer_id < 1 || customer_id > 4294967295
      || !this.store.customers().some(customer => customer.id === customer_id))) {
      this.editorError.set('กรุณาเลือกลูกค้าจากรายชื่อ');
      return;
    }

    this.busy.set(true);
    this.clearMessages();
    try {
      if (editing && order) {
        // ไม่ส่ง customer_id หรือ status เพราะ backend อนุญาตให้แก้เฉพาะจำนวนและวันที่
        await this.api.updateOrder(order.id, { quantity, delivery_date });
      } else {
        await this.api.createOrder({ customer_id: customer_id!, quantity, delivery_date });
      }
    } catch (error) {
      this.editorError.set(errorMessage(error));
      this.busy.set(false);
      return;
    }
    this.closeEditor(true);
    try { await this.refreshAfterMutation(editing ? 'แก้ไขออเดอร์เรียบร้อยแล้ว' : 'เพิ่มออเดอร์เรียบร้อยแล้ว'); }
    finally { this.busy.set(false); }
  }

  openDelete(order: Order): void {
    if (this.busy() || this.store.ordersLoading()) return;
    this.deletingOrder.set(order);
    this.deleteError.set('');
    this.clearMessages();
    this.show(this.deleteDialog);
  }

  closeDelete(force = false): void {
    if (this.busy() && !force) return;
    this.deleteDialog?.nativeElement.close();
    this.deletingOrder.set(null);
  }

  cancelDelete(event: Event): void { event.preventDefault(); this.closeDelete(); }

  async confirmDelete(): Promise<void> {
    const order = this.deletingOrder();
    if (!order || this.busy() || this.store.ordersLoading()) return;
    this.busy.set(true);
    this.deleteError.set('');
    this.clearMessages();
    try { await this.api.deleteOrder(order.id); }
    catch (error) {
      this.deleteError.set(errorMessage(error));
      this.busy.set(false);
      return;
    }
    this.closeDelete(true);
    try { await this.refreshAfterMutation('ลบออเดอร์เรียบร้อยแล้ว'); }
    finally { this.busy.set(false); }
  }

  openSimulation(): void {
    if (this.busy() || this.store.ordersLoading()) return;
    this.simulationForm = { count: 24, delivery_date: this.defaultDate() };
    this.simulationError.set('');
    this.clearMessages();
    this.show(this.simulationDialog);
  }

  closeSimulation(force = false): void {
    if (this.busy() && !force) return;
    this.simulationDialog?.nativeElement.close();
  }

  cancelSimulation(event: Event): void { event.preventDefault(); this.closeSimulation(); }

  async simulateOrders(): Promise<void> {
    if (this.busy() || this.store.ordersLoading()) return;
    this.simulationError.set('');
    const { count, delivery_date } = this.simulationForm;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 20 || count > 30) {
      this.simulationError.set('จำนวนออเดอร์ต้องเป็นจำนวนเต็มตั้งแต่ 20 ถึง 30');
      return;
    }
    if (!validDeliveryDate(delivery_date)) {
      this.simulationError.set('วันที่ส่งต้องมีอยู่จริง ในรูปแบบ YYYY-MM-DD ตั้งแต่ปี 1000 ถึง 9999');
      return;
    }
    if (this.store.customers().length < count) {
      this.simulationError.set(`ต้องมีลูกค้าอย่างน้อย ${count} คน แต่ตอนนี้มี ${this.store.customers().length} คน`);
      return;
    }
    this.busy.set(true);
    this.clearMessages();
    let created: number;
    try { created = (await this.api.simulateOrders({ count, delivery_date })).created_orders; }
    catch (error) {
      this.simulationError.set(errorMessage(error));
      this.busy.set(false);
      return;
    }
    this.closeSimulation(true);
    try { await this.refreshAfterMutation(`เพิ่มออเดอร์จำลอง ${created} รายการเรียบร้อยแล้ว`); }
    finally { this.busy.set(false); }
  }

  private defaultDate(): string { return this.store.selectedDate() || todayInBangkok(); }

  private clearMessages(): void { this.notice.set(''); this.pageError.set(''); }

  private show(dialog?: ElementRef<HTMLDialogElement>): void {
    if (dialog && !dialog.nativeElement.open) dialog.nativeElement.showModal();
  }

  private async refreshAfterMutation(message: string): Promise<void> {
    try {
      await this.store.loadOrders();
      if (!this.destroyed) this.notice.set(message);
    } catch (error) {
      // Mutation สำเร็จแล้ว จึงปิดฟอร์มก่อนโหลดรายการใหม่ เพื่อไม่ให้ผู้ใช้กดเพิ่มซ้ำ
      if (!this.destroyed) this.pageError.set(`${message} แต่โหลดรายการใหม่ไม่สำเร็จ: ${errorMessage(error)}`);
    }
  }
}
