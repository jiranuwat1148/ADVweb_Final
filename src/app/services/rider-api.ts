import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PlanJob, PlanPoint, RoutingMode } from './plan-api';

// ข้อมูลที่ POST /api/rider/jobs/lookup ส่งกลับ (ไม่ต้องใช้ token เจ้าของร้าน)
export interface RiderJobSheet {
  delivery_date: string;
  departure_at: string;
  deadline_at: string;
  routing_mode: RoutingMode;
  is_simulation: boolean;
  shop: PlanPoint;
  job: PlanJob;
}

// รูปแบบเดียวกับที่ Backend ตรวจ (backend/controller/rider.ts)
export const JOB_CODE_PATTERN = /^[A-Za-z0-9-]{5,32}$/;

@Injectable({ providedIn: 'root' })
export class RiderApi {
  private readonly http = inject(HttpClient);

  lookup(jobCode: string): Promise<RiderJobSheet> {
    return firstValueFrom(this.http.post<RiderJobSheet>('/api/rider/jobs/lookup', {
      job_code: jobCode.trim().toUpperCase(),
    }));
  }
}
