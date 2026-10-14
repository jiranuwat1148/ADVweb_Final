import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

// A complete MySQL stand-in: this test never opens a connection to Aiven.
const plans = new Map<number, any>();
const jobs: any[] = [];
const stops: any[] = [];
let source: any[] = [];
let planSequence = 0;
let jobSequence = 0;
let stopSequence = 0;
let assigned = 0;
let commits = 0;
let rollbacks = 0;
const originalFetch = globalThis.fetch;

const db: any = {
  async execute(sql: string, values: any[] = []) {
    if (sql.includes("GET_LOCK")) return [[{ acquired: 1 }]];
    if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
    if (sql.includes("FROM orders o JOIN customer c")) return [source.filter(order => order.delivery_date === values[0] && order.status === "PENDING")];
    if (sql.startsWith("SELECT id FROM delivery_plans")) return [[...plans.values()].filter(plan => plan.delivery_date === values[0] && plan.status === "CONFIRMED").map(plan => ({ id: plan.id }))];
    if (sql.startsWith("INSERT INTO delivery_plans")) {
      const id = ++planSequence;
      plans.set(id, { id, delivery_date: values[0], departure_at: values[1], deadline_at: values[2], status: "DRAFT", plan_json: values[3] });
      return [{ insertId: id, affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO delivery_jobs")) {
      const id = ++jobSequence;
      jobs.push({ id, plan_id: values[0], job_code: values[1], color: values[2], distance_m: values[3], geometry_json: values[4] });
      return [{ insertId: id, affectedRows: 1 }];
    }
    if (sql.startsWith("INSERT INTO delivery_stops")) {
      stops.push({ id: ++stopSequence, job_id: values[0], order_id: values[1], sequence_no: values[2], estimated_delivery_at: values[3] });
      return [{ insertId: stopSequence, affectedRows: 1 }];
    }
    if (sql.includes("status, plan_json FROM delivery_plans WHERE id")) return [plans.has(values[0]) ? [plans.get(values[0])] : []];
    if (sql.startsWith("SELECT id, job_code, color")) return [jobs.filter(job => job.plan_id === values[0])];
    if (sql.includes("FROM delivery_stops s JOIN delivery_jobs j")) return [stops.filter(stop => jobs.some(job => job.id === stop.job_id && job.plan_id === values[0]))];
    if (sql.startsWith("UPDATE orders SET status = 'ASSIGNED'")) {
      let count = 0;
      source.forEach(order => { if (order.status === "PENDING" && order.delivery_date === values[0] && values.slice(1).includes(order.id)) { order.status = "ASSIGNED"; count++; } });
      assigned += count;
      return [{ affectedRows: count }];
    }
    if (sql.startsWith("UPDATE delivery_plans SET status")) { plans.get(values[0]).status = "CONFIRMED"; return [{ affectedRows: 1 }]; }
    if (sql.includes("SELECT j.id, j.plan_id FROM delivery_jobs")) {
      return [jobs.filter(job => job.job_code === values[0] && plans.get(job.plan_id)?.status === "CONFIRMED" && plans.get(job.plan_id)?.delivery_date === values[1]).map(job => ({ id: job.id, plan_id: job.plan_id }))];
    }
    if (sql.includes("FROM customer ORDER BY id")) return [[]];
    throw new Error(`Unexpected test SQL: ${sql}`);
  },
  async beginTransaction() {}, async commit() { commits++; }, async rollback() { rollbacks++; }, release() {}, destroy() {},
};
const fakePool = { execute: db.execute.bind(db), getConnection: async () => db };
const modulePath = require.resolve("../controller/dbconnect");
require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: { conn: fakePool } } as NodeModule;

let server: Server;
let base: string;
let token: string;
let today: string;
async function request(path: string, method = "GET", body?: unknown, authorized = true) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorized) headers.Authorization = `Bearer ${token}`;
  const response = await originalFetch(`${base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() as any };
}
function reset(date = today) {
  plans.clear(); jobs.length = 0; stops.length = 0;
  assigned = 0; commits = 0; rollbacks = 0;
  source = [1, 2, 3].map(id => ({
    id, customer_id: id, quantity: id, delivery_date: date, status: "PENDING",
    customer_name: `Customer ${id}`, customer_phone: "0800000000", address: null,
    latitude: 16.245 + id * 0.0002, longitude: 103.251 + id * 0.0002,
  }));
}
const planBody = () => ({ delivery_date: today, shop: { latitude: 16.245, longitude: 103.251 }, routing_mode: "straight_line" });

before(async () => {
  const { createPasswordHash } = require("../middleware/auth");
  process.env.OWNER_USERNAME = "owner";
  process.env.OWNER_PASSWORD_HASH = await createPasswordHash("testing-password-123");
  const { todayInBangkok } = require("../services/validation");
  today = todayInBangkok();
  const { app } = require("../app");
  server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test HTTP server");
  base = `http://127.0.0.1:${address.port}`;
  const login = await request("/api/auth/login", "POST", { username: "owner", password: "testing-password-123" }, false);
  assert.equal(login.status, 200);
  token = login.data.token;
});
after(async () => { globalThis.fetch = originalFetch; if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

test("owner routes reject anonymous requests", async () => {
  for (const path of ["/api/customers", "/api/orders", "/api/plans/1"]) assert.equal((await request(path, "GET", undefined, false)).status, 401);
});

test("create, read, confirm, retry, and rider lookup complete one dispatch flow", async () => {
  reset();
  const created = await request("/api/plans", "POST", planBody());
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.id;
  assert.equal(created.data.status, "DRAFT");
  assert.equal(created.data.summary.order_count, 3);
  assert.equal(created.data.summary.total_boxes, 6);
  assert.equal(created.data.is_simulation, true);
  assert.equal(created.data.summary.revenue, 390);
  assert.equal(created.data.summary.food_cost, 240);
  const read = await request(`/api/plans/${id}`);
  assert.equal(read.status, 200);
  assert.equal(read.data.stale, false);
  const code = read.data.jobs[0].job_code;
  assert.match(code, /^LX-[A-F0-9]{24}$/);
  assert.equal((await request("/api/rider/jobs/lookup", "POST", { job_code: code }, false)).status, 404);
  const confirmed = await request(`/api/plans/${id}/confirm`, "POST", {});
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.status, "CONFIRMED");
  assert.equal(assigned, 3);
  const beforeJobs = jobs.length;
  const retry = await request(`/api/plans/${id}/confirm`, "POST", {});
  assert.equal(retry.status, 200);
  assert.equal(retry.data.already_confirmed, true);
  assert.equal(jobs.length, beforeJobs);
  assert.equal(assigned, 3);
  // Later changes outside the API cannot change the confirmed rider snapshot.
  source[0].customer_name = "Changed later";
  const rider = await request("/api/rider/jobs/lookup", "POST", { job_code: code.toLowerCase() }, false);
  assert.equal(rider.status, 200);
  assert.equal(rider.data.job.job_code, code);
  assert.equal("summary" in rider.data, false);
  assert.equal("jobs" in rider.data, false);
  assert.ok(rider.data.job.stops.every((stop: any) => stop.customer_name.startsWith("Customer")));
});

test("customer or order change makes a draft stale and confirmation rolls back", async () => {
  reset();
  const created = await request("/api/plans", "POST", planBody());
  assert.equal(created.status, 201);
  source[0].quantity = 2;
  assert.equal((await request(`/api/plans/${created.data.id}`)).data.stale, true);
  const confirmation = await request(`/api/plans/${created.data.id}/confirm`, "POST", {});
  assert.equal(confirmation.status, 409);
  assert.equal(assigned, 0);
  assert.equal(plans.get(created.data.id).status, "DRAFT");
  assert.equal(rollbacks, 1);
});

test("two alternative plans cannot both be confirmed for a day", async () => {
  reset();
  const a = await request("/api/plans", "POST", planBody());
  const b = await request("/api/plans", "POST", planBody());
  assert.equal(a.status, 201); assert.equal(b.status, 201);
  assert.equal((await request(`/api/plans/${a.data.id}/confirm`, "POST", {})).status, 200);
  assert.equal((await request(`/api/plans/${b.data.id}/confirm`, "POST", {})).status, 409);
});

test("draft missing or repeated physical stops cannot be confirmed", async () => {
  reset();
  const draft = await request("/api/plans", "POST", planBody());
  assert.equal(draft.status, 201);
  stops.pop();
  assert.equal((await request(`/api/plans/${draft.data.id}/confirm`, "POST", {})).status, 409);
  assert.equal(assigned, 0);
});

test("invalid request, missing ID, no orders, and out-of-radius customers are rejected", async () => {
  reset();
  assert.equal((await request("/api/plans", "POST", { ...planBody(), delivery_date: "2026-02-30" })).status, 400);
  assert.equal((await request("/api/plans", "POST", { ...planBody(), shop: { latitude: "16", longitude: 103 } })).status, 400);
  assert.equal((await request("/api/plans", "POST", { ...planBody(), routing_mode: "unknown" })).status, 400);
  assert.equal((await request("/api/plans/1e2")).status, 400);
  assert.equal((await request("/api/plans/4294967295")).status, 404);
  source[0].latitude = 17;
  assert.equal((await request("/api/plans", "POST", planBody())).status, 422);
  source = [];
  assert.equal((await request("/api/plans", "POST", planBody())).status, 400);
  assert.equal(plans.size, 0);
});

test("routing provider failure has no silent fallback or persisted plan", async () => {
  reset();
  globalThis.fetch = async () => { throw new Error("Routing service offline"); };
  const result = await request("/api/plans", "POST", { ...planBody(), routing_mode: "road" });
  globalThis.fetch = originalFetch;
  assert.equal(result.status, 502);
  assert.equal(plans.size, 0);
  assert.equal(jobs.length, 0);
});

test("expired rider codes do not expose data", async () => {
  reset("2025-01-01");
  const draft = await request("/api/plans", "POST", { ...planBody(), delivery_date: "2025-01-01" });
  assert.equal(draft.status, 201);
  assert.equal((await request(`/api/plans/${draft.data.id}/confirm`, "POST", {})).status, 200);
  const result = await request("/api/rider/jobs/lookup", "POST", { job_code: draft.data.jobs[0].job_code }, false);
  assert.equal(result.status, 404);
  assert.deepEqual(Object.keys(result.data), ["message"]);
});

test("unknown route and malformed JSON have consistent JSON errors", async () => {
  const unknown = await request("/api/unknown");
  assert.equal(unknown.status, 404);
  const bad = await originalFetch(`${base}/api/plans`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: "{" });
  assert.equal(bad.status, 400);
  assert.ok((await bad.json() as any).message);
});

test("corrupted snapshots and mismatched totals fail safely with 409", async () => {
  reset();
  const draft = await request("/api/plans", "POST", planBody());
  assert.equal(draft.status, 201);
  const row = plans.get(draft.data.id);
  const original = row.plan_json;
  const malformed = JSON.parse(original);
  malformed.source = [null];
  row.plan_json = JSON.stringify(malformed);
  assert.equal((await request(`/api/plans/${row.id}`)).status, 409);
  const incorrectTotals = JSON.parse(original);
  incorrectTotals.calculation.summary.total_boxes = 999;
  row.plan_json = JSON.stringify(incorrectTotals);
  assert.equal((await request(`/api/plans/${row.id}/confirm`, "POST", {})).status, 409);
  assert.equal(assigned, 0);
});

test("read and rider endpoints reject confirmed jobs whose stops are missing", async () => {
  reset();
  const draft = await request("/api/plans", "POST", planBody());
  assert.equal(draft.status, 201);
  assert.equal((await request(`/api/plans/${draft.data.id}/confirm`, "POST", {})).status, 200);
  stops.length = 0;
  assert.equal((await request(`/api/plans/${draft.data.id}`)).status, 409);
  const rider = await request("/api/rider/jobs/lookup", "POST", { job_code: draft.data.jobs[0].job_code }, false);
  assert.equal(rider.status, 409);
  assert.deepEqual(Object.keys(rider.data), ["message"]);
});

test("geometry failure after a valid matrix does not persist a partial plan", async () => {
  reset();
  globalThis.fetch = (async (input: any) => {
    if (String(input).includes("/table/")) return new Response(JSON.stringify({ code: "Ok", distances: [[0, 100, 200, 300], [100, 0, 100, 200], [200, 100, 0, 100], [300, 200, 100, 0]] }));
    throw new Error("Route geometry offline");
  }) as typeof fetch;
  try {
    const response = await request("/api/plans", "POST", { ...planBody(), routing_mode: "road" });
    assert.equal(response.status, 502);
    assert.equal(plans.size, 0);
    assert.equal(jobs.length, 0);
    assert.equal(stops.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("source changes during routing cannot be persisted as a current plan", async () => {
  reset();
  globalThis.fetch = (async (input: any) => {
    if (String(input).includes("/table/")) return new Response(JSON.stringify({ code: "Ok", distances: [[0, 100, 200, 300], [100, 0, 100, 200], [200, 100, 0, 100], [300, 200, 100, 0]] }));
    source[0].address = "Updated during routing";
    return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 300, legs: [{ distance: 100 }, { distance: 100 }, { distance: 100 }], geometry: { type: "LineString", coordinates: [[103.251, 16.245], [103.2512, 16.2452], [103.2514, 16.2454], [103.2516, 16.2456]] } }] }));
  }) as typeof fetch;
  try {
    const response = await request("/api/plans", "POST", { ...planBody(), routing_mode: "road" });
    assert.equal(response.status, 409);
    assert.equal(plans.size, 0);
    assert.equal(jobs.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("invalid source coordinates are a validation error instead of an internal error", async () => {
  reset(); source[0].latitude = Number.NaN;
  const response = await request("/api/plans", "POST", planBody());
  assert.equal(response.status, 422);
  assert.equal(plans.size, 0);
});

test("road route distances determine final fees and ETA even when the table differs", async () => {
  reset();
  globalThis.fetch = (async (input: any) => {
    if (String(input).includes("/table/")) return new Response(JSON.stringify({ code: "Ok", distances: [[0, 100, 200, 300], [100, 0, 100, 200], [200, 100, 0, 100], [300, 200, 100, 0]] }));
    assert.ok(String(input).includes("continue_straight=false"));
    return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 600, legs: [{ distance: 200 }, { distance: 200 }, { distance: 200 }], geometry: { type: "LineString", coordinates: [[103.251, 16.245], [103.2512, 16.2452], [103.2514, 16.2454], [103.2516, 16.2456]] } }] }));
  }) as typeof fetch;
  try {
    const response = await request("/api/plans", "POST", { ...planBody(), routing_mode: "road" });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    assert.equal(response.data.is_simulation, false);
    assert.equal(response.data.jobs[0].distance_m, 600);
    assert.equal(response.data.jobs[0].delivery_fee, 22.2);
    assert.equal(response.data.summary.delivery_fee, 22.2);
    assert.equal(response.data.summary.estimated_profit, 127.8);
    assert.equal(response.data.jobs[0].stops[2].estimated_delivery_at, `${today} 11:37:12`);
  } finally { globalThis.fetch = originalFetch; }
});

test("a final road route exceeding the delivery window is rejected before insert", async () => {
  reset();
  globalThis.fetch = (async (input: any) => {
    if (String(input).includes("/table/")) return new Response(JSON.stringify({ code: "Ok", distances: [[0, 100, 200, 300], [100, 0, 100, 200], [200, 100, 0, 100], [300, 200, 100, 0]] }));
    return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 30000, legs: [{ distance: 10000 }, { distance: 10000 }, { distance: 10000 }], geometry: { type: "LineString", coordinates: [[103.251, 16.245], [103.2512, 16.2452]] } }] }));
  }) as typeof fetch;
  try {
    assert.equal((await request("/api/plans", "POST", { ...planBody(), routing_mode: "road" })).status, 422);
    assert.equal(plans.size, 0);
    assert.equal(jobs.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});
