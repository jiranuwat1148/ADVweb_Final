import type { ShopLocation, SourceOrder } from './planner';
import { coordinateDistanceMeters } from './planner';

export type RoutingMode = 'road' | 'straight_line';
export interface RouteGeometry { type: 'LineString'; coordinates: number[][]; }
export interface RouteDetails {
  geometry: RouteGeometry;
  distance_m: number;
  leg_distances_m: number[];
}

const OSRM_TIMEOUT_MS = 8000;
const DEFAULT_OSRM_BASE_URL = 'https://router.project-osrm.org';

function locations(orders: SourceOrder[], shop: ShopLocation): ShopLocation[] {
  if (!Array.isArray(orders)) throw new Error('รายการออเดอร์สำหรับหาเส้นทางไม่ถูกต้อง');
  const points = [shop, ...orders];
  for (const point of points) coordinateDistanceMeters(point, point);
  return points;
}

function validateMode(mode: RoutingMode): void {
  if (mode !== 'road' && mode !== 'straight_line') throw new Error('รูปแบบเส้นทางต้องเป็น road หรือ straight_line');
}

function osrmUrl(service: 'table' | 'route', points: ShopLocation[], query: string): string {
  // Server-owned configuration only; callers cannot pass an arbitrary provider URL.
  let base: URL;
  try { base = new URL(process.env.OSRM_BASE_URL ?? DEFAULT_OSRM_BASE_URL); }
  catch { throw new Error('OSRM_BASE_URL ต้องเป็น URL แบบ HTTP หรือ HTTPS'); }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('OSRM_BASE_URL ต้องเป็น URL แบบ HTTP หรือ HTTPS ที่ไม่มีข้อมูลบัญชี query หรือ fragment');
  }
  const coordinates = points.map(point => `${point.longitude},${point.latitude}`).join(';');
  return `${base.href.replace(/\/+$/, '')}/${service}/v1/driving/${coordinates}?${query}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function requestOsrm(url: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('บริการเส้นทาง OSRM ไม่ตอบกลับภายใน 8 วินาที'));
    }, OSRM_TIMEOUT_MS);
  });
  try {
    const request = (async () => {
      let response: Response;
      try { response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } }); }
      catch { throw new Error('เชื่อมต่อบริการเส้นทาง OSRM ไม่สำเร็จ'); }
      if (!response.ok) throw new Error(`บริการเส้นทาง OSRM ตอบกลับ HTTP ${response.status}`);
      let data: unknown;
      try { data = await response.json(); }
      catch { throw new Error('บริการเส้นทาง OSRM ตอบกลับข้อมูล JSON ไม่ถูกต้อง'); }
      if (!record(data) || data['code'] !== 'Ok') throw new Error('บริการ OSRM หาเส้นทางไม่พบหรือไม่รองรับคำขอ');
      return data;
    })();
    return await Promise.race([request, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * OSRM Table distances are meters along fastest routes, and may be asymmetric.
 * Official API: https://project-osrm.org/docs/v5.24.0/api/#table-service
 * No fallback_speed is requested; unreachable or malformed cells fail the plan.
 */
export async function buildDistanceMatrix(orders: SourceOrder[], shop: ShopLocation, mode: RoutingMode = 'road'): Promise<number[][]> {
  validateMode(mode);
  const points = locations(orders, shop);
  if (points.length === 1) return [[0]];
  if (mode === 'straight_line') {
    return points.map(from => points.map(to => coordinateDistanceMeters(from, to)));
  }
  const payload = await requestOsrm(osrmUrl('table', points, 'annotations=distance'));
  const distances = payload['distances'];
  if (!Array.isArray(distances) || distances.length !== points.length) throw new Error('ตารางระยะทาง OSRM มีขนาดไม่ถูกต้อง');
  return distances.map((row: unknown, i: number) => {
    if (!Array.isArray(row) || row.length !== points.length) throw new Error('แถวของตารางระยะทาง OSRM มีขนาดไม่ถูกต้อง');
    return row.map((distance: unknown, j: number) => {
      if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
        throw new Error(`OSRM หาเส้นทางจากจุด ${i} ไป ${j} ไม่พบหรือระยะทางไม่ถูกต้อง`);
      }
      if (i === j && distance !== 0) throw new Error('ระยะทาง OSRM จากจุดเดิมไปจุดเดิมต้องเป็นศูนย์');
      return distance;
    });
  });
}

/**
 * Distances are provider meters, with one leg from the shop/to each supplied stop.
 * Explicitly allow waypoint U-turns to match the independently computed Table legs.
 * Caller must still compare these legs against its original planning matrix.
 * GeoJSON coordinates use [longitude, latitude], in the supplied delivery order.
 */
export async function getRouteDetails(ordersInSequence: SourceOrder[], shop: ShopLocation, mode: RoutingMode = 'road'): Promise<RouteDetails> {
  validateMode(mode);
  const points = locations(ordersInSequence, shop);
  if (points.length < 2) throw new Error('เส้นทางต้องมีร้านและลูกค้าอย่างน้อยหนึ่งจุด');
  if (mode === 'straight_line') {
    const legDistances = points.slice(1).map((point, index) => coordinateDistanceMeters(points[index]!, point));
    return {
      geometry: { type: 'LineString', coordinates: points.map(point => [point.longitude, point.latitude]) },
      distance_m: Math.round(legDistances.reduce((sum, distance) => sum + distance, 0)),
      leg_distances_m: legDistances,
    };
  }
  const payload = await requestOsrm(osrmUrl('route', points, 'geometries=geojson&overview=full&steps=false&alternatives=false&continue_straight=false'));
  const routes = payload['routes'];
  if (!Array.isArray(routes) || !record(routes[0])) throw new Error('OSRM ไม่ส่งข้อมูลเส้นทางกลับมา');
  const route = routes[0];
  const geometry = route['geometry'];
  if (!record(geometry) || geometry['type'] !== 'LineString'
    || !Array.isArray(geometry['coordinates']) || geometry['coordinates'].length < 2) {
    throw new Error('รูปทรงเส้นทาง OSRM ต้องเป็น GeoJSON LineString');
  }
  const coordinates = geometry['coordinates'].map((position: unknown) => {
    if (!Array.isArray(position) || position.length !== 2
      || typeof position[0] !== 'number' || typeof position[1] !== 'number'
      || !Number.isFinite(position[0]) || !Number.isFinite(position[1])
      || Math.abs(position[0]) > 180 || Math.abs(position[1]) > 90) {
      throw new Error('พิกัดในเส้นทาง OSRM ไม่ถูกต้อง');
    }
    return [position[0], position[1]];
  });
  const distance = route['distance'];
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
    throw new Error('ระยะทางรวมของเส้นทาง OSRM ไม่ถูกต้อง');
  }
  const legs = route['legs'];
  if (!Array.isArray(legs) || legs.length !== ordersInSequence.length) {
    throw new Error('จำนวนช่วงของเส้นทาง OSRM ไม่ตรงกับจุดส่ง');
  }
  const legDistances = legs.map((leg: unknown) => {
    if (!record(leg) || typeof leg['distance'] !== 'number'
      || !Number.isFinite(leg['distance']) || leg['distance'] < 0) {
      throw new Error('ระยะทางช่วงของเส้นทาง OSRM ไม่ถูกต้อง');
    }
    return leg['distance'];
  });
  const summedDistance = legDistances.reduce((sum, legDistance) => sum + legDistance, 0);
  if (!Number.isFinite(summedDistance) || Math.abs(summedDistance - distance) > 1) {
    throw new Error('ระยะทางรวมของ OSRM ไม่ตรงกับผลรวมระยะทางแต่ละช่วง');
  }
  return {
    geometry: { type: 'LineString', coordinates },
    distance_m: distance,
    leg_distances_m: legDistances,
  };
}

/** Compatibility helper: keeps the existing geometry-only return shape. */
export async function getRouteGeometry(ordersInSequence: SourceOrder[], shop: ShopLocation, mode: RoutingMode = 'road'): Promise<RouteGeometry> {
  return (await getRouteDetails(ordersInSequence, shop, mode)).geometry;
}
