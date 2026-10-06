import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Customer, DeliveryApi, Order } from './delivery-api';
import { DeliveryStore, todayInBangkok } from './delivery-store';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('DeliveryStore', () => {
  let store: DeliveryStore;
  let api: { listCustomers: ReturnType<typeof vi.fn>; listOrders: ReturnType<typeof vi.fn> };
  const order = (id: number, date: string, quantity: number, status: string): Order => ({ id, delivery_date: date, quantity, status, customer_id: 1, customer_name: 'ลูกค้า', customer_phone: '0800000000' });

  beforeEach(() => {
    api = { listCustomers: vi.fn().mockResolvedValue([]), listOrders: vi.fn().mockResolvedValue([]) };
    TestBed.configureTestingModule({ providers: [{ provide: DeliveryApi, useValue: api }] });
    store = TestBed.inject(DeliveryStore);
  });

  it('filters a shared delivery date and excludes cancelled orders from boxes and revenue', async () => {
    api.listOrders.mockResolvedValue([order(1, '2026-10-06', 2, 'PENDING'), order(2, '2026-10-06', 3, 'CANCELLED'), order(3, '2026-10-07', 1, 'ASSIGNED')]);
    await store.loadOrders();
    store.selectedDate.set('2026-10-06');
    expect(store.dateOrders().length).toBe(2);
    expect(store.totalBoxes()).toBe(2);
    expect(store.revenue()).toBe(130);
    expect(store.pendingCount()).toBe(1);
    store.selectedDate.set('');
    expect(store.totalBoxes()).toBe(3);
  });

  it('reports a failed read and clears loading while allowing the other list to load', async () => {
    api.listCustomers.mockRejectedValue(new HttpErrorResponse({ status: 500, error: { message: 'อ่านข้อมูลลูกค้าไม่สำเร็จ' } }));
    api.listOrders.mockResolvedValue([order(1, '2026-10-06', 2, 'PENDING')]);
    await store.refreshAll();
    expect(store.customersError()).toBe('อ่านข้อมูลลูกค้าไม่สำเร็จ');
    expect(store.customersLoading()).toBe(false);
    expect(store.ordersLoading()).toBe(false);
    expect(store.orders().length).toBe(1);
    expect(store.customers()).toEqual([]);
  });

  it('keeps the latest customer list when an earlier GET finishes after it', async () => {
    const first = deferred<Customer[]>();
    const second = deferred<Customer[]>();
    const oldCustomer: Customer = { id: 1, name: 'เดิม', phone: '0811111111', address: null, latitude: 16, longitude: 103 };
    const newCustomer = { ...oldCustomer, id: 2, name: 'ใหม่' };
    api.listCustomers.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const staleLoad = store.loadCustomers();
    const latestLoad = store.loadCustomers();
    second.resolve([oldCustomer, newCustomer]);
    await latestLoad;
    first.resolve([oldCustomer]);
    await staleLoad;
    expect(store.customers()).toEqual([oldCustomer, newCustomer]);
    expect(store.customersLoading()).toBe(false);
  });

  it('does not show an older GET failure over a successful customer refresh', async () => {
    const first = deferred<Customer[]>();
    const second = deferred<Customer[]>();
    api.listCustomers.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const staleLoad = store.loadCustomers();
    const latestLoad = store.loadCustomers();
    second.resolve([]);
    await latestLoad;
    first.reject(new Error('old request failed'));
    await expect(staleLoad).rejects.toThrow('old request failed');
    expect(store.customersError()).toBe('');
    expect(store.customersLoading()).toBe(false);
  });

  it('keeps the latest order list when an earlier GET finishes after it', async () => {
    const first = deferred<Order[]>();
    const second = deferred<Order[]>();
    api.listOrders.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const staleLoad = store.loadOrders();
    const latestLoad = store.loadOrders();
    second.resolve([order(1, '2026-10-06', 2, 'PENDING'), order(2, '2026-10-06', 1, 'PENDING')]);
    await latestLoad;
    first.resolve([order(1, '2026-10-06', 2, 'PENDING')]);
    await staleLoad;
    expect(store.orders().map(row => row.id)).toEqual([1, 2]);
    expect(store.ordersLoading()).toBe(false);
  });

  it('uses Bangkok calendar dates rather than UTC around midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T18:00:00Z'));
    try { expect(todayInBangkok()).toBe('2026-10-06'); }
    finally { vi.useRealTimers(); }
  });
});
