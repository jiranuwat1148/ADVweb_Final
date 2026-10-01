export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  zone: string;
}

export interface Order {
  id: string;
  customerId: string;
  quantity: number;
  date: string;
  status: "pending" | "assigned" | "delivered" | "cancelled";
}

export interface Stop {
  orderId: string;
  customerId: string;
  sequence: number;
  eta: string;
  boxes: number;
  customer: Customer;
}

export interface Job {
  id: string;
  code: string;
  color: string;
  orderIds: string[];
  totalBoxes: number;
  distanceKm: number;
  cost: number;
  durationMinutes: number;
  stops: Stop[];
  path: [number, number][];
}

export interface DeliveryPlan {
  id: string;
  createdAt: string;
  date: string;
  status: "draft" | "confirmed";
  totalBoxes: number;
  totalOrders: number;
  totalRevenue: number;
  foodCost: number;
  deliveryCost: number;
  profit: number;
  totalDistanceKm: number;
  durationMinutes: number;
  jobs: Job[];
  sourceVersion: number;
}

export const SHOP = {
  lat: 16.245,
  lng: 103.25,
  name: "ส่งด่วนมื้อเที่ยง",
  address: "ขามเรียง · รอบมหาวิทยาลัยมหาสารคาม",
};

export function dateToday(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function fmtBaht(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
