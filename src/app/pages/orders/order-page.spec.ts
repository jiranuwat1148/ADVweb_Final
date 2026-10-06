import { HttpErrorResponse } from '@angular/common/http';
import { ElementRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { DeliveryApi, Order } from '../../services/delivery-api';
import { DeliveryStore, todayInBangkok } from '../../services/delivery-store';
import { OrderPage } from './order-page';

function sampleOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 7, customer_id: 5, customer_name: 'ลูกค้าจริง', customer_phone: '0812345678',
    quantity: 2, delivery_date: '2026-10-06', status: 'PENDING', ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function stubDialog(ref: ElementRef<HTMLDialogElement> | undefined) {
  const dialog = ref!.nativeElement;
  const showModal = vi.fn(() => { dialog.open = true; });
  const close = vi.fn(() => { dialog.open = false; });
  Object.defineProperty(dialog, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(dialog, 'close', { configurable: true, value: close });
  return { showModal, close, dialog };
}

describe('OrderPage with an isolated API mock', () => {
  let component: OrderPage;
  let fixture: ComponentFixture<OrderPage>;
  let store: DeliveryStore;
  let reload: ReturnType<typeof vi.spyOn>;
  let editor: ReturnType<typeof stubDialog>;
  let deletion: ReturnType<typeof stubDialog>;
  let simulation: ReturnType<typeof stubDialog>;
  let api: {
    getOrder: ReturnType<typeof vi.fn>;
    createOrder: ReturnType<typeof vi.fn>;
    updateOrder: ReturnType<typeof vi.fn>;
    deleteOrder: ReturnType<typeof vi.fn>;
    simulateOrders: ReturnType<typeof vi.fn>;
    listOrders: ReturnType<typeof vi.fn>;
    listCustomers: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    api = {
      getOrder: vi.fn().mockResolvedValue(sampleOrder()),
      createOrder: vi.fn().mockResolvedValue({ id: 30, message: 'เพิ่มแล้ว' }),
      updateOrder: vi.fn().mockResolvedValue({ id: 7, message: 'แก้ไขแล้ว' }),
      deleteOrder: vi.fn().mockResolvedValue({ id: 7, message: 'ลบแล้ว' }),
      simulateOrders: vi.fn().mockImplementation(async body => ({
        message: 'จำลองแล้ว', created_orders: body.count, total_boxes: body.count * 2, delivery_date: body.delivery_date,
      })),
      listOrders: vi.fn().mockResolvedValue([]),
      listCustomers: vi.fn().mockResolvedValue([]),
    };
    await TestBed.configureTestingModule({
      imports: [OrderPage],
      providers: [{ provide: DeliveryApi, useValue: api }],
    }).compileComponents();
    store = TestBed.inject(DeliveryStore);
    store.customers.set(Array.from({ length: 32 }, (_, i) => ({
      id: i + 1, name: `ลูกค้า ${i + 1}`, phone: '0812345678', address: null, latitude: 16.25, longitude: 103.25,
    })));
    store.orders.set([sampleOrder()]);
    reload = vi.spyOn(store, 'loadOrders').mockResolvedValue(undefined);
    fixture = TestBed.createComponent(OrderPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    editor = stubDialog(component.orderDialog);
    deletion = stubDialog(component.deleteDialog);
    simulation = stubDialog(component.simulationDialog);
  });

  it('renders database totals excluding cancelled rows, then searches and filters actual rows', async () => {
    store.orders.set([
      sampleOrder(),
      sampleOrder({ id: 8, quantity: 3, status: 'CANCELLED' }),
      sampleOrder({ id: 9, quantity: 1, delivery_date: '2026-10-07', status: 'ASSIGNED' }),
    ]);
    component.setDateFilter('2026-10-06');
    fixture.detectChanges();
    await fixture.whenStable();
    const numbers = Array.from(fixture.nativeElement.querySelectorAll('.ld-stat-number'))
      .map(node => (node as HTMLElement).textContent!.trim());
    expect(numbers).toEqual(['1', '2', '1', '฿130']);
    component.filter.set('pending');
    component.search.set('0812345678');
    expect(component.visibleOrders().map(order => order.id)).toEqual([7]);
    component.setDateFilter('');
    component.filter.set('all');
    component.search.set('ORD-009');
    expect(component.visibleOrders().map(order => order.id)).toEqual([9]);
  });

  it('defaults a new order to the shared selected date, or Bangkok today when all days are selected', () => {
    store.selectedDate.set('2026-10-08');
    component.openAdd();
    expect(component.orderForm.delivery_date).toBe('2026-10-08');
    component.closeEditor();
    store.selectedDate.set('');
    component.openAdd();
    expect(component.orderForm.delivery_date).toBe(todayInBangkok());
  });

  it('creates only after explicit submission and sends the exact create body', async () => {
    component.openAdd();
    expect(api.createOrder).not.toHaveBeenCalled();
    component.orderForm = { customer_id: 5, quantity: 2, delivery_date: '2026-10-06' };
    await component.saveOrder();
    expect(api.createOrder).toHaveBeenCalledExactlyOnceWith({ customer_id: 5, quantity: 2, delivery_date: '2026-10-06' });
    expect(reload).toHaveBeenCalledOnce();
    expect(component.notice()).toContain('เพิ่มออเดอร์');
    expect(editor.close).toHaveBeenCalledOnce();
  });

  it.each([0, 4, 1.5, null])('rejects quantity %s without an API write', async quantity => {
    component.openAdd();
    component.orderForm = { customer_id: 5, quantity, delivery_date: '2026-10-06' };
    await component.saveOrder();
    expect(api.createOrder).not.toHaveBeenCalled();
    expect(component.editorError()).toContain('1 ถึง 3');
    expect(reload).not.toHaveBeenCalled();
  });

  it.each(['2026-02-30', '2025-02-29', '0999-12-31', '10000-01-01', '2026-1-06', ''])('rejects nonexistent or out-of-range date %s', async delivery_date => {
    component.openAdd();
    component.orderForm = { customer_id: 5, quantity: 2, delivery_date };
    await component.saveOrder();
    expect(api.createOrder).not.toHaveBeenCalled();
    expect(component.editorError()).toContain('วันที่ส่ง');
  });

  it.each(['1000-01-01', '9999-12-31', '2024-02-29'])('accepts a valid supported calendar date %s', async delivery_date => {
    component.openAdd();
    component.orderForm = { customer_id: 5, quantity: 2, delivery_date };
    await component.saveOrder();
    expect(api.createOrder).toHaveBeenCalledExactlyOnceWith({ customer_id: 5, quantity: 2, delivery_date });
  });

  it('uses the detail GET, and updates quantity/date without sending customer or status', async () => {
    api.getOrder.mockResolvedValue(sampleOrder({ customer_id: 9, quantity: 3 }));
    await component.openEdit(sampleOrder());
    expect(api.getOrder).toHaveBeenCalledExactlyOnceWith(7);
    expect(component.orderForm.customer_id).toBe(9);
    component.orderForm = { customer_id: 2, quantity: 1, delivery_date: '2026-10-08' };
    await component.saveOrder();
    expect(api.updateOrder).toHaveBeenCalledExactlyOnceWith(7, { quantity: 1, delivery_date: '2026-10-08' });
    expect(api.createOrder).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('ignores a stale detail response after another order has been opened', async () => {
    const old = deferred<Order>();
    const next = deferred<Order>();
    api.getOrder.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const firstRequest = component.openEdit(sampleOrder({ id: 7 }));
    const secondRequest = component.openEdit(sampleOrder({ id: 8 }));
    next.resolve(sampleOrder({ id: 8, quantity: 3 }));
    await secondRequest;
    old.resolve(sampleOrder({ id: 7, quantity: 1 }));
    await firstRequest;
    expect(component.editingOrder()?.id).toBe(8);
    expect(component.orderForm.quantity).toBe(3);
    expect(component.editorLoading()).toBe(false);
  });

  it('does not reopen or populate an editor that was cancelled while the detail GET was pending', async () => {
    const pending = deferred<Order>();
    api.getOrder.mockReturnValue(pending.promise);
    const request = component.openEdit(sampleOrder());
    component.closeEditor();
    component.openAdd();
    pending.resolve(sampleOrder({ quantity: 3 }));
    await request;
    expect(component.editorMode()).toBe('add');
    expect(component.editingOrder()).toBeNull();
    expect(component.orderForm.quantity).toBe(1);
  });

  it('preserves a delete 409 message, keeps confirmation open and never reports success', async () => {
    const message = 'ออเดอร์นี้อยู่ในแผนจัดส่งแล้ว จึงลบไม่ได้';
    api.deleteOrder.mockRejectedValue(new HttpErrorResponse({ status: 409, error: { message } }));
    component.openDelete(sampleOrder());
    expect(api.deleteOrder).not.toHaveBeenCalled();
    await component.confirmDelete();
    expect(api.deleteOrder).toHaveBeenCalledExactlyOnceWith(7);
    expect(component.deleteError()).toBe(message);
    expect(component.notice()).toBe('');
    expect(deletion.close).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(component.busy()).toBe(false);
  });

  it.each([19, 31, 20.5, null])('rejects simulation count %s before sending a write', async count => {
    component.openSimulation();
    component.simulationForm = { count, delivery_date: '2026-10-06' };
    await component.simulateOrders();
    expect(api.simulateOrders).not.toHaveBeenCalled();
    expect(component.simulationError()).toContain('20 ถึง 30');
  });

  it.each([20, 30])('accepts simulation boundary %s only on explicit submit', async count => {
    component.openSimulation();
    expect(api.simulateOrders).not.toHaveBeenCalled();
    component.simulationForm = { count, delivery_date: '2026-10-06' };
    await component.simulateOrders();
    expect(api.simulateOrders).toHaveBeenCalledExactlyOnceWith({ count, delivery_date: '2026-10-06' });
    expect(reload).toHaveBeenCalledOnce();
    expect(simulation.close).toHaveBeenCalledOnce();
  });

  it('prevents double submission while simulation is pending', async () => {
    const pending = deferred<{ message: string; created_orders: number; total_boxes: number; delivery_date: string }>();
    api.simulateOrders.mockReturnValue(pending.promise);
    component.openSimulation();
    component.simulationForm = { count: 24, delivery_date: '2026-10-06' };
    const first = component.simulateOrders();
    await component.simulateOrders();
    expect(api.simulateOrders).toHaveBeenCalledOnce();
    expect(component.busy()).toBe(true);
    pending.resolve({ message: 'เพิ่มแล้ว', created_orders: 24, total_boxes: 48, delivery_date: '2026-10-06' });
    await first;
    expect(component.busy()).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('leaves a failed create dialog open with the backend error and no success notice', async () => {
    const message = 'ไม่พบลูกค้าที่ระบุ';
    api.createOrder.mockRejectedValue(new HttpErrorResponse({ status: 404, error: { message } }));
    component.openAdd();
    component.orderForm = { customer_id: 5, quantity: 2, delivery_date: '2026-10-06' };
    await component.saveOrder();
    expect(component.editorError()).toBe(message);
    expect(component.notice()).toBe('');
    expect(editor.close).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('closes a committed create before refreshing, and identifies a refresh failure without re-sending the write', async () => {
    reload.mockRejectedValue(new HttpErrorResponse({ status: 500, error: { message: 'อ่านข้อมูลออเดอร์ไม่สำเร็จ' } }));
    component.openAdd();
    component.orderForm = { customer_id: 5, quantity: 2, delivery_date: '2026-10-06' };
    await component.saveOrder();
    expect(api.createOrder).toHaveBeenCalledOnce();
    expect(editor.close).toHaveBeenCalledOnce();
    expect(component.notice()).toBe('');
    expect(component.pageError()).toContain('แต่โหลดรายการใหม่ไม่สำเร็จ');
    expect(component.busy()).toBe(false);
  });
});
