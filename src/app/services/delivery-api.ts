import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

export type CustomerInput = Omit<Customer, 'id'>;
type RawCustomer = Omit<Customer, 'latitude' | 'longitude'> & {
  latitude: number | string;
  longitude: number | string;
};

export interface Order {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  quantity: number;
  delivery_date: string;
  status: string;
}

export interface OrderInput {
  customer_id: number;
  quantity: number;
  delivery_date: string;
}

export type OrderUpdate = Pick<OrderInput, 'quantity' | 'delivery_date'>;
export interface MutationResult { id: number; message: string; }
export interface SimulateResult {
  message: string;
  created_orders: number;
  total_boxes: number;
  delivery_date: string;
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (typeof error.error?.message === 'string') return error.error.message;
    if (error.status === 0 || error.status === 502 || error.status === 504) {
      return 'เชื่อม Backend ไม่ได้ กรุณาเปิด Backend ที่พอร์ต 3000 แล้วลองใหม่';
    }
    return `โหลดหรือบันทึกข้อมูลไม่สำเร็จ (HTTP ${error.status})`;
  }
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

// ใช้ /api ผ่าน Angular proxy; รหัสผ่านฐานข้อมูลเก็บอยู่ที่ Backend เท่านั้น
@Injectable({ providedIn: 'root' })
export class DeliveryApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api';

  private customer(row: RawCustomer): Customer {
    return { ...row, id: Number(row.id), latitude: Number(row.latitude), longitude: Number(row.longitude) };
  }

  async listCustomers(): Promise<Customer[]> {
    const rows = await firstValueFrom(this.http.get<RawCustomer[]>(`${this.base}/customers`));
    return rows.map(row => this.customer(row));
  }

  async getCustomer(id: number): Promise<Customer> {
    const row = await firstValueFrom(this.http.get<RawCustomer>(`${this.base}/customers/${id}`));
    return this.customer(row);
  }

  createCustomer(body: CustomerInput): Promise<MutationResult> {
    return firstValueFrom(this.http.post<MutationResult>(`${this.base}/customers`, body));
  }

  updateCustomer(id: number, body: CustomerInput): Promise<MutationResult> {
    return firstValueFrom(this.http.put<MutationResult>(`${this.base}/customers/${id}`, body));
  }

  deleteCustomer(id: number): Promise<MutationResult> {
    return firstValueFrom(this.http.delete<MutationResult>(`${this.base}/customers/${id}`));
  }

  listOrders(): Promise<Order[]> {
    return firstValueFrom(this.http.get<Order[]>(`${this.base}/orders`));
  }

  getOrder(id: number): Promise<Order> {
    return firstValueFrom(this.http.get<Order>(`${this.base}/orders/${id}`));
  }

  createOrder(body: OrderInput): Promise<MutationResult> {
    return firstValueFrom(this.http.post<MutationResult>(`${this.base}/orders`, body));
  }

  updateOrder(id: number, body: OrderUpdate): Promise<MutationResult> {
    return firstValueFrom(this.http.put<MutationResult>(`${this.base}/orders/${id}`, body));
  }

  deleteOrder(id: number): Promise<MutationResult> {
    return firstValueFrom(this.http.delete<MutationResult>(`${this.base}/orders/${id}`));
  }

  simulateOrders(body: { count: number; delivery_date: string }): Promise<SimulateResult> {
    return firstValueFrom(this.http.post<SimulateResult>(`${this.base}/orders/simulate`, body));
  }
}
