import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type RoutingMode = 'road' | 'straight_line';

export interface PlanPoint {
  latitude: number;
  longitude: number;
}

export interface PlanStop {
  id: number;
  order_id: number;
  customer_id: number;
  customer_name: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
  quantity: number;
  sequence_no: number;
  estimated_delivery_at: string;
}

export interface PlanJob {
  id: number;
  job_code: string;
  color: string;
  distance_m: number;
  total_boxes: number;
  delivery_fee: number;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  stops: PlanStop[];
}

export interface PlanSummary {
  order_count: number;
  total_boxes: number;
  rider_count: number;
  total_distance_m: number;
  revenue: number;
  food_cost: number;
  delivery_fee: number;
  estimated_profit: number;
  last_delivery_minutes: number;
  estimated_finish_at: string;
}

export interface DeliveryPlan {
  id: number;
  delivery_date: string;
  departure_at: string;
  deadline_at: string;
  status: 'DRAFT' | 'CONFIRMED';
  routing_mode: RoutingMode;
  is_simulation: boolean;
  shop: PlanPoint;
  summary: PlanSummary;
  jobs: PlanJob[];
  stale: boolean;
  can_confirm: boolean;
  already_confirmed?: boolean;
}

@Injectable({ providedIn: 'root' })
export class PlanApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/plans';

  create(deliveryDate: string, routingMode: RoutingMode): Promise<DeliveryPlan> {
    return firstValueFrom(this.http.post<DeliveryPlan>(this.base, {
      delivery_date: deliveryDate,
      routing_mode: routingMode,
    }));
  }

  get(id: number): Promise<DeliveryPlan> {
    return firstValueFrom(this.http.get<DeliveryPlan>(`${this.base}/${id}`));
  }

  confirm(id: number): Promise<DeliveryPlan> {
    return firstValueFrom(this.http.post<DeliveryPlan>(`${this.base}/${id}/confirm`, {}));
  }
}
