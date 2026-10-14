import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { buildDistanceMatrix, getRouteDetails, getRouteGeometry } from '../services/routing';
import type { RoutingMode } from '../services/routing';
import type { SourceOrder } from '../services/planner';

const shop = { latitude: 16.246, longitude: 103.251 };
const customer: SourceOrder = {
  id: 1, customer_id: 1, customer_name: 'Customer 1', customer_phone: '0800000000',
  address: null, latitude: 16.247, longitude: 103.252, quantity: 2, delivery_date: '2026-10-09',
};
const initialBaseUrl = process.env.OSRM_BASE_URL;
delete process.env.OSRM_BASE_URL;
afterEach(() => {
  mock.restoreAll();
  delete process.env.OSRM_BASE_URL;
});
test.after(() => {
  if (initialBaseUrl === undefined) delete process.env.OSRM_BASE_URL;
  else process.env.OSRM_BASE_URL = initialBaseUrl;
});

function respond(payload: unknown, status = 200) {
  return mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload), { status }));
}

test('default road matrix uses longitude-latitude OSRM Table and retains asymmetric meters', async () => {
  const fetchMock = respond({ code: 'Ok', distances: [[0, 111], [222, 0]] });
  assert.deepEqual(await buildDistanceMatrix([customer], shop), [[0, 111], [222, 0]]);
  assert.equal(fetchMock.mock.callCount(), 1);
  const [input, init] = fetchMock.mock.calls[0]!.arguments as unknown as [string, RequestInit];
  const url = new URL(input);
  assert.equal(url.origin, 'https://router.project-osrm.org');
  assert.equal(url.pathname, '/table/v1/driving/103.251,16.246;103.252,16.247');
  assert.equal(url.searchParams.get('annotations'), 'distance');
  assert.equal(url.searchParams.has('fallback_speed'), false);
  assert.ok(init.signal instanceof AbortSignal);
});

test('straight-line simulation builds an explicit local matrix and geometry without provider calls', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('must not request'); });
  const distances = await buildDistanceMatrix([customer], shop, 'straight_line');
  assert.equal(distances.length, 2);
  assert.equal(distances[0]![0], 0);
  assert.ok(distances[0]![1]! > 150 && distances[0]![1]! < 160);
  assert.equal(distances[0]![1], distances[1]![0]);
  assert.deepEqual(await getRouteGeometry([customer], shop, 'straight_line'), {
    type: 'LineString', coordinates: [[103.251, 16.246], [103.252, 16.247]],
  });
  const route = await getRouteDetails([customer], shop, 'straight_line');
  assert.equal(route.leg_distances_m[0], distances[0]![1]);
  assert.equal(route.distance_m, Math.round(distances[0]![1]!));
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('road geometry preserves the supplied stop order and requests GeoJSON', async () => {
  const other = { ...customer, id: 2, latitude: 16.245, longitude: 103.25 };
  const geometry = { type: 'LineString', coordinates: [[103.251, 16.246], [103.2505, 16.2455], [103.25, 16.245], [103.252, 16.247]] };
  const fetchMock = respond({ code: 'Ok', routes: [{ geometry, distance: 340.7, legs: [{ distance: 100.2 }, { distance: 240.5 }] }] });
  assert.deepEqual(await getRouteGeometry([other, customer], shop), geometry);
  const [input] = fetchMock.mock.calls[0]!.arguments as unknown as [string];
  const url = new URL(input);
  assert.equal(url.pathname, '/route/v1/driving/103.251,16.246;103.25,16.245;103.252,16.247');
  assert.equal(url.searchParams.get('geometries'), 'geojson');
  assert.equal(url.searchParams.get('overview'), 'full');
  assert.equal(url.searchParams.get('steps'), 'false');
  assert.equal(url.searchParams.get('alternatives'), 'false');
  assert.equal(url.searchParams.get('continue_straight'), 'false');
  assert.deepEqual(await getRouteDetails([other, customer], shop), {
    geometry, distance_m: 340.7, leg_distances_m: [100.2, 240.5],
  });
});

test('straight-line route sums every ordered leg before rounding, and agrees with its planning matrix', async () => {
  const other = { ...customer, id: 2, latitude: 16.2451, longitude: 103.2501 };
  const distances = await buildDistanceMatrix([customer, other], shop, 'straight_line');
  const route = await getRouteDetails([other, customer], shop, 'straight_line');
  assert.deepEqual(route.leg_distances_m, [distances[0]![2], distances[2]![1]]);
  assert.equal(route.distance_m, Math.round(distances[0]![2]! + distances[2]![1]!));
  assert.deepEqual(route.geometry.coordinates, [[shop.longitude, shop.latitude], [other.longitude, other.latitude], [customer.longitude, customer.latitude]]);
});

test('road details reject missing, negative, nonnumeric and inconsistent distance metadata', async () => {
  const geometry = { type: 'LineString', coordinates: [[103.251, 16.246], [103.252, 16.247]] };
  for (const metadata of [
    {}, { distance: -1, legs: [{ distance: 1 }] }, { distance: '1', legs: [{ distance: 1 }] },
    { distance: null, legs: [{ distance: 1 }] }, { distance: 1 },
    { distance: 1, legs: [] }, { distance: 1, legs: [{ distance: 1 }, { distance: 0 }] },
    { distance: 1, legs: [null] }, { distance: 1, legs: [{}] },
    { distance: 1, legs: [{ distance: -1 }] }, { distance: 1, legs: [{ distance: '1' }] },
    { distance: 1, legs: [{ distance: null }] }, { distance: 10, legs: [{ distance: 8.9 }] },
  ]) {
    const fetchMock = respond({ code: 'Ok', routes: [{ geometry, ...metadata }] });
    await assert.rejects(getRouteDetails([customer], shop), /ระยะทาง|จำนวนช่วง/);
    fetchMock.mock.restore();
  }
});

test('road leg-sum tolerance accepts exactly one meter and rejects nonfinite provider numbers', async () => {
  const geometry = { type: 'LineString', coordinates: [[103.251, 16.246], [103.252, 16.247]] };
  const accepted = respond({ code: 'Ok', routes: [{ geometry, distance: 10, legs: [{ distance: 9 }] }] });
  assert.equal((await getRouteDetails([customer], shop)).distance_m, 10);
  accepted.mock.restore();
  for (const metadata of [
    { distance: Infinity, legs: [{ distance: 1 }] },
    { distance: 1, legs: [{ distance: NaN }] },
  ]) {
    // Direct JSON mock preserves nonfinite values so the runtime guard is exercised.
    const fetchMock = mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ code: 'Ok', routes: [{ geometry, ...metadata }] }) }) as Response);
    await assert.rejects(getRouteDetails([customer], shop), /ระยะทาง/);
    fetchMock.mock.restore();
  }
});

test('road HTTP failure is surfaced instead of silently returning straight-line data', async () => {
  respond({ code: 'Error' }, 503);
  await assert.rejects(buildDistanceMatrix([customer], shop), /HTTP 503/);
  await assert.rejects(getRouteGeometry([customer], shop), /HTTP 503/);
});

test('network failure is surfaced', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new Error('network unavailable'); });
  await assert.rejects(buildDistanceMatrix([customer], shop), /เชื่อมต่อ.*ไม่สำเร็จ/);
});

test('malformed JSON and unsuccessful OSRM codes are rejected', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('invalid json', { status: 200 }));
  await assert.rejects(buildDistanceMatrix([customer], shop), /JSON ไม่ถูกต้อง/);
  fetchMock.mock.restore();
  respond({ code: 'NoTable', distances: [[0, 1], [1, 0]] });
  await assert.rejects(buildDistanceMatrix([customer], shop), /หาเส้นทางไม่พบ/);
});

test('rejects malformed table dimensions and unreachable or invalid cells', async () => {
  for (const distances of [
    undefined, [[0]], [[0, 1], [1]], [[0, null], [1, 0]],
    [[0, '1'], [1, 0]], [[0, -1], [1, 0]], [[1, 1], [1, 0]],
  ]) {
    const fetchMock = respond({ code: 'Ok', distances });
    await assert.rejects(buildDistanceMatrix([customer], shop), /ขนาด|ไม่พบ|ไม่ถูกต้อง|ต้องเป็นศูนย์/);
    fetchMock.mock.restore();
  }
});

test('rejects missing routes, non-LineString geometry and malformed geographic positions', async () => {
  for (const routes of [
    [], [{}], [{ geometry: { type: 'Polygon', coordinates: [[0, 0], [1, 1]] } }],
    [{ geometry: { type: 'LineString', coordinates: [[0, 0]] } }],
    [{ geometry: { type: 'LineString', coordinates: [[0, 0], [181, 0]] } }],
    [{ geometry: { type: 'LineString', coordinates: [[0, 0], [0, 91]] } }],
    [{ geometry: { type: 'LineString', coordinates: [[0, 0], ['1', 1]] } }],
    [{ geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1, 1]] } }],
  ]) {
    const fetchMock = respond({ code: 'Ok', routes });
    await assert.rejects(getRouteGeometry([customer], shop), /ไม่ส่งข้อมูล|LineString|พิกัด/);
    fetchMock.mock.restore();
  }
});

test('provider timeout is bounded even when fetch ignores the AbortSignal', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let requestSignal: AbortSignal | null | undefined;
  mock.method(globalThis, 'fetch', (_input: string | URL | Request, init?: RequestInit) => {
    requestSignal = init?.signal;
    return new Promise<Response>(() => {});
  });
  const request = buildDistanceMatrix([customer], shop);
  const rejection = assert.rejects(request, /8 วินาที/);
  context.mock.timers.tick(8000);
  await rejection;
  assert.equal(requestSignal?.aborted, true);
});

test('timeout also bounds an unresponsive response JSON body', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  mock.method(globalThis, 'fetch', async () => ({ ok: true, json: () => new Promise(() => {}) }) as Response);
  const request = buildDistanceMatrix([customer], shop);
  await Promise.resolve();
  const rejection = assert.rejects(request, /8 วินาที/);
  context.mock.timers.tick(8000);
  await rejection;
});

test('accepts server-configured HTTP(S) base paths and rejects unsafe or malformed provider URLs', async () => {
  process.env.OSRM_BASE_URL = 'http://localhost:5000/osrm/';
  const fetchMock = respond({ code: 'Ok', distances: [[0, 1], [1, 0]] });
  await buildDistanceMatrix([customer], shop);
  const [input] = fetchMock.mock.calls[0]!.arguments as unknown as [string];
  assert.equal(new URL(input).pathname, '/osrm/table/v1/driving/103.251,16.246;103.252,16.247');
  const calls = fetchMock.mock.callCount();
  for (const value of ['ftp://example.test', 'not a URL', 'https://user:pass@example.test', 'https://example.test/?key=abc', 'https://example.test/#fragment']) {
    process.env.OSRM_BASE_URL = value;
    await assert.rejects(buildDistanceMatrix([customer], shop), /OSRM_BASE_URL/);
  }
  assert.equal(fetchMock.mock.callCount(), calls);
});

test('empty matrix needs no provider, empty route and invalid coordinates or modes are rejected', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('must not request'); });
  assert.deepEqual(await buildDistanceMatrix([], shop), [[0]]);
  await assert.rejects(getRouteGeometry([], shop), /อย่างน้อยหนึ่งจุด/);
  await assert.rejects(buildDistanceMatrix([{ ...customer, latitude: NaN }], shop), /พิกัด/);
  await assert.rejects(buildDistanceMatrix([customer], shop, 'unknown' as RoutingMode), /รูปแบบเส้นทาง/);
  assert.equal(fetchMock.mock.callCount(), 0);
});
