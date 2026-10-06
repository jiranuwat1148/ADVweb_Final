import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Customer, DeliveryApi } from '../../services/delivery-api';
import { DeliveryStore } from '../../services/delivery-store';
import { CustomerPage } from './customer-page';

const customer: Customer = { id: 1, name: 'กมลชนก ใจดี', phone: '0812345600', address: null, latitude: 16.2504, longitude: 103.2458 };

function deferredCustomer() {
  let resolve!: (value: Customer) => void;
  const promise = new Promise<Customer>(done => { resolve = done; });
  return { promise, resolve };
}

describe('CustomerPage API workflows', () => {
  let page: CustomerPage;
  let api: {
    getCustomer: ReturnType<typeof vi.fn>;
    createCustomer: ReturnType<typeof vi.fn>;
    updateCustomer: ReturnType<typeof vi.fn>;
    deleteCustomer: ReturnType<typeof vi.fn>;
  };
  let store: {
    customers: ReturnType<typeof signal<Customer[]>>;
    customersLoading: ReturnType<typeof signal<boolean>>;
    customersError: ReturnType<typeof signal<string>>;
    loadCustomers: ReturnType<typeof vi.fn>;
    loadOrders: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = {
      getCustomer: vi.fn().mockResolvedValue(customer),
      createCustomer: vi.fn().mockResolvedValue({ id: 1, message: 'เพิ่มลูกค้าเรียบร้อยแล้ว' }),
      updateCustomer: vi.fn().mockResolvedValue({ id: 1, message: 'แก้ไขลูกค้าเรียบร้อยแล้ว' }),
      deleteCustomer: vi.fn().mockResolvedValue({ id: 1, message: 'ลบลูกค้าเรียบร้อยแล้ว' }),
    };
    store = {
      customers: signal<Customer[]>([customer]),
      customersLoading: signal(false),
      customersError: signal(''),
      loadCustomers: vi.fn().mockResolvedValue(undefined),
      loadOrders: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({ providers: [
      { provide: DeliveryApi, useValue: api },
      { provide: DeliveryStore, useValue: store },
    ] });
    page = TestBed.runInInjectionContext(() => new CustomerPage());
  });

  it('keeps the latest selected customer when earlier detail requests complete late', async () => {
    const first = deferredCustomer();
    const second = deferredCustomer();
    api.getCustomer.mockImplementation((id: number) => id === 1 ? first.promise : second.promise);
    const firstRequest = page.selectCustomer(1);
    const secondRequest = page.selectCustomer(2);
    second.resolve({ ...customer, id: 2, name: 'พิมพ์ชนก แก้วใส' });
    await secondRequest;
    first.resolve(customer);
    await firstRequest;
    expect(page.selectedCustomer()?.id).toBe(2);
    expect(page.detailLoading()).toBe(false);
  });

  it('updates the selected detail and edit form when the shared list refreshes', async () => {
    await page.selectCustomer(1);
    TestBed.tick();
    const updated = { ...customer, name: 'ชื่อที่แก้จากที่อื่น', latitude: 17.5, longitude: 104.5 };
    store.customers.set([updated]);
    TestBed.tick();
    expect(page.selectedCustomer()).toEqual(updated);
    expect(page.mapsUrl()).toContain('17.5,104.5');
    page.openEdit(page.selectedCustomer()!);
    expect(page.form.latitude).toBe(17.5);
    expect(page.form.longitude).toBe(104.5);
    store.customers.set([]);
    TestBed.tick();
    expect(page.selectedId()).toBeNull();
    expect(page.selectedCustomer()).toBeNull();
  });

  it('ignores an in-flight detail GET after the customer list refreshes', async () => {
    const pending = deferredCustomer();
    api.getCustomer.mockReturnValue(pending.promise);
    const detail = page.selectCustomer(1);
    const updated = { ...customer, name: 'ชื่อใหม่' };
    store.customers.set([updated]);
    TestBed.tick();
    pending.resolve(customer);
    await detail;
    expect(page.selectedCustomer()).toEqual(updated);
    expect(page.detailLoading()).toBe(false);
  });

  it('does not clear a detail selection because the initial customer list is empty', async () => {
    store.customers.set([]);
    page = TestBed.runInInjectionContext(() => new CustomerPage());
    await page.selectCustomer(1);
    TestBed.tick();
    expect(page.selectedId()).toBe(1);
    expect(page.selectedCustomer()).toEqual(customer);
  });

  it('shows detail errors without substituting the list row as successful detail', async () => {
    api.getCustomer.mockRejectedValue(new HttpErrorResponse({ status: 404, error: { message: 'ไม่พบข้อมูลลูกค้า' } }));
    await page.selectCustomer(1);
    expect(page.selectedCustomer()).toBeNull();
    expect(page.detailError()).toBe('ไม่พบข้อมูลลูกค้า');
    expect(page.mapsUrl()).toBeNull();
  });

  it('allows zero coordinates and sends nullable address while preserving phone as text', async () => {
    page.openAdd();
    page.form = { name: '  กมลชนก ใจดี  ', phone: ' 0812345600 ', address: ' ', latitude: 0, longitude: 0 };
    await page.saveCustomer();
    expect(api.createCustomer).toHaveBeenCalledWith({ name: customer.name, phone: customer.phone, address: null, latitude: 0, longitude: 0 });
    expect(store.loadCustomers).toHaveBeenCalledOnce();
    expect(store.loadOrders).not.toHaveBeenCalled();
  });

  it('rejects missing coordinates before making a mutation request', async () => {
    page.form = { name: customer.name, phone: customer.phone, address: '', latitude: null, longitude: 103.2458 };
    await page.saveCustomer();
    expect(page.formError()).toContain('ละติจูด');
    expect(api.createCustomer).not.toHaveBeenCalled();
  });

  it('refreshes joined orders after updating a customer and fetches the saved detail', async () => {
    page.openEdit(customer);
    page.form.name = 'ชื่อใหม่';
    api.getCustomer.mockResolvedValue({ ...customer, name: 'ชื่อใหม่' });
    await page.saveCustomer();
    expect(api.updateCustomer).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'ชื่อใหม่' }));
    expect(store.loadCustomers).toHaveBeenCalledOnce();
    expect(store.loadOrders).toHaveBeenCalledOnce();
    expect(page.selectedCustomer()?.name).toBe('ชื่อใหม่');
  });

  it('preserves the customer on FK conflict and exposes the backend 409 message', async () => {
    await page.selectCustomer(1);
    page.openDelete(customer);
    api.deleteCustomer.mockRejectedValue(new HttpErrorResponse({ status: 409, error: { message: 'ลบลูกค้าไม่ได้ เนื่องจากลูกค้านี้มีออเดอร์อยู่' } }));
    await page.deleteCustomer();
    expect(page.deleteError()).toBe('ลบลูกค้าไม่ได้ เนื่องจากลูกค้านี้มีออเดอร์อยู่');
    expect(page.selectedCustomer()).toEqual(customer);
    expect(store.customers()).toEqual([customer]);
    expect(store.loadCustomers).not.toHaveBeenCalled();
    expect(store.loadOrders).not.toHaveBeenCalled();
  });

  it('clears deleted selection only after API success and refreshes both lists', async () => {
    await page.selectCustomer(1);
    page.openDelete(customer);
    await page.deleteCustomer();
    expect(api.deleteCustomer).toHaveBeenCalledWith(1);
    expect(page.selectedCustomer()).toBeNull();
    expect(page.selectedId()).toBeNull();
    expect(store.loadCustomers).toHaveBeenCalledOnce();
    expect(store.loadOrders).toHaveBeenCalledOnce();
  });

  it('does not misreport a completed POST as failed when subsequent refresh fails', async () => {
    page.form = { name: customer.name, phone: customer.phone, address: '', latitude: customer.latitude, longitude: customer.longitude };
    store.loadCustomers.mockRejectedValue(new Error('reload failed'));
    await page.saveCustomer();
    expect(api.createCustomer).toHaveBeenCalledOnce();
    expect(page.notice()).toBe('เพิ่มลูกค้าเรียบร้อยแล้ว');
    expect(page.formError()).toBe('');
    expect(page.saving()).toBe(false);
  });
});
