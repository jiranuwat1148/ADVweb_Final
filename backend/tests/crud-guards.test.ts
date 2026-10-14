import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { todayInBangkok } from "../services/validation";

interface Statement { sql: string; values: readonly unknown[]; }
interface Scenario {
  calls: Statement[];
  events: string[];
  handle: (sql: string, values: readonly unknown[]) => unknown;
  commitError?: Error;
}
let current: Scenario;

const db = {
  async execute(sql: string, values: readonly unknown[] = []) {
    const normalized = sql.replace(/\s+/g, " ").trim();
    current.calls.push({ sql: normalized, values });
    if (normalized.includes("GET_LOCK(")) {
      current.events.push("lock");
      return [[{ acquired: 1 }], []];
    }
    if (normalized.includes("RELEASE_LOCK(")) {
      current.events.push("unlock");
      return [[{ released: 1 }], []];
    }
    if (/^(INSERT|UPDATE|DELETE)\b/.test(normalized)) current.events.push("write");
    return [await current.handle(normalized, values), []];
  },
  async beginTransaction() { current.events.push("begin"); },
  async commit() {
    current.events.push("commit");
    if (current.commitError) throw current.commitError;
  },
  async rollback() { current.events.push("rollback"); },
  release() { current.events.push("release"); },
  destroy() { current.events.push("destroy"); },
};
const pool = {
  async getConnection() { current.events.push("getConnection"); return db; },
  execute: db.execute.bind(db),
};

// Replace configuration before loading controllers or the transaction helper.
// These tests never load .env or open a real MySQL connection.
const dbModule = require.resolve("../controller/dbconnect");
require.cache[dbModule] = {
  id: dbModule, filename: dbModule, loaded: true, exports: { conn: pool },
} as NodeModule;
const { customerRouter } = require("../controller/customer");
const { orderRouter } = require("../controller/orders");

let server: Server;
let baseUrl: string;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/customers", customerRouter);
  app.use("/api/orders", orderRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

function scenario(handle: Scenario["handle"]): Scenario {
  current = { calls: [], events: [], handle };
  return current;
}
async function request(method: string, path: string, body?: unknown) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as any };
}
function writes(state: Scenario) {
  return state.calls.filter(call => /^(INSERT|UPDATE|DELETE)\b/.test(call.sql));
}
const customerBody = {
  name: " Customer ", phone: " 0812345678 ", address: " ", latitude: 0, longitude: 0,
};
function orderRow(overrides: Record<string, unknown> = {}) {
  return { id: 7, status: "PENDING", delivery_date: "2026-10-09", has_stops: 0, has_confirmed: 0, ...overrides };
}
function orderScenario(overrides: Record<string, unknown> = {}, closedDates: string[] = []) {
  return scenario((sql, values) => {
    if (sql.includes("FROM orders AS o WHERE") && sql.endsWith("FOR UPDATE")) return [orderRow(overrides)];
    if (sql.startsWith("SELECT id FROM delivery_plans")) return closedDates.includes(String(values[0])) ? [{ id: 3 }] : [];
    if (/^(UPDATE orders|DELETE FROM orders)\b/.test(sql)) return { affectedRows: 1 };
    throw new Error("Unexpected SQL in order guard test: " + sql);
  });
}

test("customer detail rejects invalid uint IDs without querying", async () => {
  const state = scenario(() => { throw new Error("Unexpected query"); });
  const result = await request("GET", "/api/customers/nope");
  assert.equal(result.status, 400);
  assert.equal(state.calls.length, 0);
});

test("orders list preserves CANCELLED rows and binds optional date/status filters", async () => {
  const state = scenario(() => [{ id: 7, status: "CANCELLED", delivery_date: "2026-10-09" }]);
  let result = await request("GET", "/api/orders");
  assert.equal(result.status, 200);
  assert.equal(result.body[0].status, "CANCELLED");
  assert.equal(state.calls[0]?.sql.includes("WHERE"), false);
  result = await request("GET", "/api/orders?date=2026-10-09&status=CANCELLED");
  assert.equal(result.status, 200);
  assert.deepEqual(state.calls[1]?.values, ["2026-10-09", "CANCELLED"]);
  assert.match(state.calls[1]!.sql, /o\.delivery_date = \? AND o\.status = \?/);
});

test("orders filters reject impossible dates and unknown statuses before querying", async () => {
  const state = scenario(() => { throw new Error("Unexpected query"); });
  assert.equal((await request("GET", "/api/orders?date=2026-02-30")).status, 400);
  assert.equal((await request("GET", "/api/orders?status=DRAFT")).status, 400);
  assert.equal(state.calls.length, 0);
});

test("customer creation commits inside the shared lock before returning 201", async () => {
  const state = scenario(sql => {
    assert.match(sql, /^INSERT INTO customer/);
    return { insertId: 71, affectedRows: 1 };
  });
  const result = await request("POST", "/api/customers", customerBody);
  assert.equal(result.status, 201);
  assert.equal(result.body.id, 71);
  assert.deepEqual(writes(state)[0]?.values, ["Customer", "0812345678", null, 0, 0]);
  assert.deepEqual(state.events, ["getConnection", "lock", "begin", "write", "commit", "unlock", "release"]);
});

test("customer PUT blocks current or future confirmed references and rolls back without an update", async () => {
  const state = scenario(sql => {
    if (sql.startsWith("SELECT id FROM customer")) return [{ id: 7 }];
    if (sql.startsWith("SELECT EXISTS")) return [{ has_confirmed: "1" }];
    throw new Error("Unexpected SQL");
  });
  const result = await request("PUT", "/api/customers/7", customerBody);
  assert.equal(result.status, 409);
  assert.equal(writes(state).length, 0);
  assert.ok(state.calls.some(call => call.sql.includes("customer WHERE id = ? FOR UPDATE")));
  assert.ok(state.calls.some(call => call.sql.includes("j.id = s.job_id") && call.sql.includes("p.status = 'CONFIRMED'")));
  const references = state.calls.find(call => call.sql.startsWith("SELECT EXISTS"));
  assert.match(references!.sql, /p\.delivery_date >= \?/);
  assert.deepEqual(references!.values, [7, todayInBangkok()]);
  assert.ok(state.events.includes("rollback"));
  assert.equal(state.events.includes("commit"), false);
});

test("customer PUT permits draft references and unchanged values", async () => {
  const state = scenario(sql => {
    if (sql.startsWith("SELECT id FROM customer")) return [{ id: 7 }];
    if (sql.startsWith("SELECT EXISTS")) return [{ has_confirmed: 0 }];
    if (sql.startsWith("UPDATE customer")) return { affectedRows: 0 };
    throw new Error("Unexpected SQL");
  });
  assert.equal((await request("PUT", "/api/customers/7", customerBody)).status, 200);
  assert.equal(writes(state).length, 1);
  assert.ok(state.events.includes("commit"));
});

test("historical confirmed plans do not permanently freeze a customer", async () => {
  const historicalDate = "1000-01-01";
  const state = scenario((sql, values) => {
    if (sql.startsWith("SELECT id FROM customer")) return [{ id: 7 }];
    if (sql.startsWith("SELECT EXISTS")) {
      assert.match(sql, /p\.delivery_date >= \?/);
      assert.deepEqual(values, [7, todayInBangkok()]);
      return [{ has_confirmed: historicalDate >= String(values[1]) ? 1 : 0 }];
    }
    if (sql.startsWith("UPDATE customer")) return { affectedRows: 1 };
    throw new Error("Unexpected SQL");
  });
  assert.equal((await request("PUT", "/api/customers/7", customerBody)).status, 200);
  assert.equal(writes(state).length, 1);
  assert.ok(state.events.includes("commit"));
});

test("customer DELETE maps FK restriction to 409 after rollback", async () => {
  const state = scenario(() => { throw Object.assign(new Error("driver details must stay private"), { code: "ER_ROW_IS_REFERENCED_2" }); });
  const result = await request("DELETE", "/api/customers/7");
  assert.equal(result.status, 409);
  assert.doesNotMatch(result.body.message, /driver details/);
  assert.ok(state.events.includes("rollback"));
  assert.equal(state.events.at(-1), "release");
});

test("creating an order on a confirmed date never inserts", async () => {
  const state = scenario(sql => {
    if (sql.startsWith("SELECT id FROM delivery_plans")) return [{ id: 3 }];
    throw new Error("Unexpected SQL");
  });
  const result = await request("POST", "/api/orders", { customer_id: 1, quantity: 2, delivery_date: "2026-10-09" });
  assert.equal(result.status, 409);
  assert.equal(writes(state).length, 0);
  assert.ok(state.events.includes("rollback"));
});

test("PENDING order in DRAFT is editable and checks both old and new dates", async () => {
  const state = orderScenario({ has_stops: 1 });
  const result = await request("PUT", "/api/orders/7", { quantity: 3, delivery_date: "2026-10-10" });
  assert.equal(result.status, 200);
  const dates = state.calls.filter(call => call.sql.startsWith("SELECT id FROM delivery_plans")).map(call => call.values[0]);
  assert.deepEqual(dates, ["2026-10-09", "2026-10-10"]);
  assert.deepEqual(writes(state)[0]?.values, [3, "2026-10-10", 7]);
  assert.ok(state.events.includes("commit"));
});

for (const closedDate of ["2026-10-09", "2026-10-10"]) {
  test("moving an order is blocked when either date is confirmed: " + closedDate, async () => {
    const state = orderScenario({}, [closedDate]);
    assert.equal((await request("PUT", "/api/orders/7", { quantity: 2, delivery_date: "2026-10-10" })).status, 409);
    assert.equal(writes(state).length, 0);
    assert.ok(state.events.includes("rollback"));
  });
}

test("a confirmed stop blocks editing even if the order date itself is open", async () => {
  const state = orderScenario({ has_stops: 1, has_confirmed: "1" });
  assert.equal((await request("PUT", "/api/orders/7", { quantity: 2, delivery_date: "2026-10-09" })).status, 409);
  assert.equal(writes(state).length, 0);
});

test("deleting a DRAFT-linked order cancels it without deleting its FK target", async () => {
  const state = orderScenario({ has_stops: "1" });
  assert.equal((await request("DELETE", "/api/orders/7")).status, 200);
  assert.equal(writes(state).length, 1);
  assert.match(writes(state)[0]!.sql, /^UPDATE orders SET status = 'CANCELLED'/);
  assert.ok(state.events.includes("commit"));
});

test("deleting an unplanned PENDING order physically deletes it", async () => {
  const state = orderScenario();
  assert.equal((await request("DELETE", "/api/orders/7")).status, 200);
  assert.match(writes(state)[0]!.sql, /^DELETE FROM orders/);
});

test("order DELETE rejects confirmed references and non-PENDING statuses", async () => {
  for (const row of [{ has_confirmed: 1 }, { status: "ASSIGNED" }, { status: "CANCELLED" }]) {
    const state = orderScenario(row);
    assert.equal((await request("DELETE", "/api/orders/7")).status, 409);
    assert.equal(writes(state).length, 0);
  }
});

test("order DELETE is blocked when its date is closed even without stops", async () => {
  const state = orderScenario({}, ["2026-10-09"]);
  assert.equal((await request("DELETE", "/api/orders/7")).status, 409);
  assert.equal(writes(state).length, 0);
});

test("simulation on a closed date does not read customers or insert", async () => {
  const state = scenario(sql => {
    if (sql.startsWith("SELECT id FROM delivery_plans")) return [{ id: 3 }];
    throw new Error("Unexpected SQL");
  });
  assert.equal((await request("POST", "/api/orders/simulate", { count: 20, delivery_date: "2026-10-09" })).status, 409);
  assert.equal(writes(state).length, 0);
  assert.equal(state.calls.some(call => call.sql.includes("FROM customer")), false);
});

test("simulation inserts one atomic batch and reports its quantities", async () => {
  const state = scenario(sql => {
    if (sql.startsWith("SELECT id FROM delivery_plans")) return [];
    if (sql.startsWith("SELECT id FROM customer")) return Array.from({ length: 24 }, (_, index) => ({ id: index + 1 }));
    if (sql.startsWith("INSERT INTO orders")) return { affectedRows: 20 };
    throw new Error("Unexpected SQL");
  });
  const result = await request("POST", "/api/orders/simulate", { count: 20, delivery_date: "2026-10-09" });
  assert.equal(result.status, 201);
  assert.equal(result.body.created_orders, 20);
  assert.equal(writes(state).length, 1);
  const values = writes(state)[0]!.values;
  assert.equal(values.length, 60);
  const ids = values.filter((_, index) => index % 3 === 0);
  const amounts = values.filter((_, index) => index % 3 === 1).map(Number);
  assert.equal(new Set(ids).size, 20);
  assert.ok(amounts.every(amount => Number.isInteger(amount) && amount >= 1 && amount <= 3));
  assert.equal(result.body.total_boxes, amounts.reduce((sum, amount) => sum + amount, 0));
  assert.ok(state.events.includes("commit"));
});

test("commit failure returns a safe error rather than premature creation success", async () => {
  const state = scenario(() => ({ insertId: 71, affectedRows: 1 }));
  state.commitError = new Error("commit details must stay private");
  const result = await request("POST", "/api/customers", customerBody);
  assert.equal(result.status, 500);
  assert.doesNotMatch(result.body.message, /commit details/);
  assert.ok(state.events.includes("rollback"));
});
