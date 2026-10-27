import { Component, computed, effect, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../services/delivery-api';
import { PlanStop } from '../../services/plan-api';
import { JOB_CODE_PATTERN, RiderApi, RiderJobSheet } from '../../services/rider-api';

const STORAGE_KEY = 'lunch-dispatch-rider-job';

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; }
  catch { return null; }
}

function point(latitude: number, longitude: number): string {
  return `${latitude},${longitude}`;
}

/** "2026-10-27 11:36:00" → "11:36" */
export function clockTime(value: string): string {
  const match = /(\d{2}):(\d{2})/.exec(value.split(' ')[1] ?? value);
  return match ? `${match[1]}:${match[2]}` : value;
}

/** "2026-10-27" → "27 ต.ค. 2569" */
export function thaiDate(value: string): string {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ลิงก์นำทางจากตำแหน่งปัจจุบันของไรเดอร์ไปยังจุดส่งจุดเดียว */
export function stopMapUrl(stop: PlanStop): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point(stop.latitude, stop.longitude))}&travelmode=driving`;
}

/** ลิงก์นำทางทั้งเส้นทาง: ร้าน → จุดที่ 1 → … → จุดสุดท้าย ตามลำดับในใบงาน */
export function fullRouteUrl(sheet: RiderJobSheet): string {
  const stops = sortedStops(sheet);
  if (!stops.length) return '';
  const last = stops[stops.length - 1];
  const params = new URLSearchParams({
    api: '1',
    origin: point(sheet.shop.latitude, sheet.shop.longitude),
    destination: point(last.latitude, last.longitude),
    travelmode: 'driving',
  });
  const waypoints = stops.slice(0, -1).map(stop => point(stop.latitude, stop.longitude));
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function sortedStops(sheet: RiderJobSheet): PlanStop[] {
  return [...sheet.job.stops].sort((a, b) => a.sequence_no - b.sequence_no);
}

@Component({
  selector: 'app-rider-job-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './rider-job-page.html',
  styleUrl: './rider-job-page.css',
})
export class RiderJobPage {
  private readonly api = inject(RiderApi);

  readonly jobCode = signal('');
  readonly sheet = signal<RiderJobSheet | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  /** แจ้งหน้าล็อกอินว่ากำลังแสดงใบงานอยู่หรือไม่ (ใช้ปรับรูปแท็บ) */
  readonly sheetOpenChange = output<boolean>();

  readonly codeValid = computed(() => JOB_CODE_PATTERN.test(this.jobCode().trim()));
  readonly stops = computed(() => {
    const sheet = this.sheet();
    return sheet ? sortedStops(sheet) : [];
  });
  readonly routeUrl = computed(() => {
    const sheet = this.sheet();
    return sheet ? fullRouteUrl(sheet) : '';
  });
  readonly distanceKm = computed(() => {
    const meters = this.sheet()?.job.distance_m ?? 0;
    return (meters / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 });
  });

  readonly clockTime = clockTime;
  readonly thaiDate = thaiDate;
  readonly stopMapUrl = stopMapUrl;

  constructor() {
    effect(() => this.sheetOpenChange.emit(!!this.sheet()));
    // เปิดหน้าใหม่ (refresh) แล้วยังเห็นใบงานเดิม
    const saved = storage()?.getItem(STORAGE_KEY);
    if (saved && JOB_CODE_PATTERN.test(saved)) {
      this.jobCode.set(saved);
      void this.lookup();
    }
  }

  setCode(value: string): void {
    this.jobCode.set(value.toUpperCase());
  }

  async lookup(): Promise<void> {
    const code = this.jobCode().trim().toUpperCase();
    if (this.busy()) return;
    if (!JOB_CODE_PATTERN.test(code)) {
      this.error.set('เลขใบงานต้องเป็นตัวอักษรอังกฤษ ตัวเลข หรือ - ยาว 5–32 ตัว');
      return;
    }
    this.error.set('');
    this.busy.set(true);
    try {
      const sheet = await this.api.lookup(code);
      this.sheet.set(sheet);
      storage()?.setItem(STORAGE_KEY, code);
    } catch (error) {
      this.sheet.set(null);
      storage()?.removeItem(STORAGE_KEY);
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  changeJob(): void {
    this.sheet.set(null);
    this.jobCode.set('');
    this.error.set('');
    storage()?.removeItem(STORAGE_KEY);
  }
}
