import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CustomerInput, DeliveryApi, errorMessage } from './delivery-api';

describe('DeliveryApi contract', () => {
  let api: DeliveryApi;
  let http: HttpTestingController;
  const customer: CustomerInput = { name: 'ลูกค้าตัวอย่าง', phone: '0800000000', address: null, latitude: 16.25, longitude: 103.24 };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(DeliveryApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('converts MySQL DECIMAL strings from customer list and detail into numbers', async () => {
    const raw = { ...customer, id: 12, latitude: '16.2500000', longitude: '103.2400000' };
    const list = api.listCustomers();
    http.expectOne('/api/customers').flush([raw]);
    expect(await list).toEqual([{ ...customer, id: 12 }]);
    const detail = api.getCustomer(12);
    http.expectOne('/api/customers/12').flush(raw);
    expect((await detail).longitude).toBe(103.24);
  });

  const requests: { name: string; method: string; url: string; body?: unknown; run: (api: DeliveryApi) => Promise<unknown> }[] = [
    { name: 'create customer', method: 'POST', url: '/api/customers', body: customer, run: api => api.createCustomer(customer) },
    { name: 'update customer', method: 'PUT', url: '/api/customers/12', body: customer, run: api => api.updateCustomer(12, customer) },
    { name: 'delete customer', method: 'DELETE', url: '/api/customers/12', run: api => api.deleteCustomer(12) },
    { name: 'list orders', method: 'GET', url: '/api/orders', run: api => api.listOrders() },
    { name: 'get order', method: 'GET', url: '/api/orders/37', run: api => api.getOrder(37) },
    { name: 'create order', method: 'POST', url: '/api/orders', body: { customer_id: 12, quantity: 3, delivery_date: '2026-10-06' }, run: api => api.createOrder({ customer_id: 12, quantity: 3, delivery_date: '2026-10-06' }) },
    { name: 'update order without changing customer or status', method: 'PUT', url: '/api/orders/37', body: { quantity: 2, delivery_date: '2026-10-07' }, run: api => api.updateOrder(37, { quantity: 2, delivery_date: '2026-10-07' }) },
    { name: 'delete order', method: 'DELETE', url: '/api/orders/37', run: api => api.deleteOrder(37) },
    { name: 'simulate orders', method: 'POST', url: '/api/orders/simulate', body: { count: 24, delivery_date: '2026-10-06' }, run: api => api.simulateOrders({ count: 24, delivery_date: '2026-10-06' }) },
  ];

  for (const request of requests) {
    it(`sends the backend's method, path and JSON payload to ${request.name}`, async () => {
      const result = request.run(api);
      const pending = http.expectOne(request.url);
      expect(pending.request.method).toBe(request.method);
      expect(pending.request.body).toEqual(request.body ?? null);
      const response = request.method === 'GET' && request.url === '/api/orders' ? [] : { id: 37, message: 'สำเร็จ' };
      pending.flush(response);
      expect(await result).toEqual(response);
    });
  }

  it('preserves the backend conflict message for a customer with existing orders', async () => {
    const message = 'ลบลูกค้าไม่ได้ เนื่องจากลูกค้านี้มีออเดอร์อยู่';
    const result = api.deleteCustomer(12).catch(error => errorMessage(error));
    http.expectOne('/api/customers/12').flush({ message }, { status: 409, statusText: 'Conflict' });
    expect(await result).toBe(message);
  });

  it('explains a connection failure without exposing database settings', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toContain('พอร์ต 3000');
  });
});
