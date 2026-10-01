import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(resolve(project, "package.json"));
const ts = require("typescript");
const transpile = (file) =>
  ts.transpileModule(readFileSync(resolve(project, "src/app", file), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true,
    },
  }).outputText;
const dataUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const modelsUrl = dataUrl(transpile("models.ts"));
// A minimal signal adapter lets the store business rules run without Angular's injection context.
// Production Angular typing is verified separately with tsc / ng build.
const angularUrl = dataUrl(`
  export const Injectable = () => target => target;
  export const effect = fn => fn();
  export const signal = initial => {
    let value = initial;
    const getter = () => value;
    getter.set = next => { value = next; };
    getter.update = fn => { value = fn(value); };
    return getter;
  };
`);
const code = transpile("dispatch.store.ts")
  .replace(/(['"])@angular\/core\1/g, JSON.stringify(angularUrl))
  .replace(/(['"])\.\/models\1/g, JSON.stringify(modelsUrl));
const { buildPlan, routeCostCents, DispatchStore } = await import(
  dataUrl(code)
);
const { SHOP, dateToday } = await import(modelsUrl);

assert.equal(
  routeCostCents(6, 2),
  3900,
  "6 boxes over 2 km cost 39 baht including fixed fee",
);
assert.equal(buildPlan([], []), null, "empty plan is rejected");
const store = new DispatchStore();
assert.equal(store.customers().length, 24);
assert.equal(store.orders().length, 24);

const originalOrders = store.orders().map((order) => ({ ...order }));
const plan = store.generatePlan();
assert.ok(plan);
assert.equal(plan.totalOrders, 24);
assert.equal(plan.totalBoxes, 48);
assert.equal(plan.totalRevenue, 3120);
assert.equal(plan.foodCost, 1920);
assert.equal(
  Math.round(plan.profit * 100),
  120000 - Math.round(plan.deliveryCost * 100),
);

function checkConstraints(candidate) {
  assert.ok(candidate);
  const covered = candidate.jobs.flatMap((job) => job.orderIds);
  assert.equal(covered.length, 24);
  assert.equal(new Set(covered).size, 24, "no duplicate assignments");
  assert.deepEqual(
    [...covered].sort(),
    originalOrders.map((order) => order.id).sort(),
    "no missing order",
  );
  for (const job of candidate.jobs) {
    assert.ok(job.orderIds.length <= 3, "at most three orders per rider");
    assert.ok(
      job.durationMinutes + 5 <= 60,
      "reserve five minutes before the deadline",
    );
    assert.equal(
      Math.round(job.cost * 100),
      routeCostCents(job.totalBoxes, job.distanceKm),
    );
    assert.equal(
      job.totalBoxes,
      job.stops.reduce((total, stop) => total + stop.boxes, 0),
    );
    assert.equal(job.path.length, job.stops.length + 1);
    assert.deepEqual(job.path[0], [SHOP.lat, SHOP.lng]);
    for (let i = 0; i < job.stops.length; i++) {
      assert.equal(job.stops[i].sequence, i + 1);
      assert.ok(job.stops[i].eta <= "12:25");
      assert.equal(job.stops[i].orderId, job.orderIds[i]);
    }
  }
}
checkConstraints(plan);
const baselineCost = originalOrders.reduce(
  (total, order) => total + buildPlan(store.customers(), [order]).deliveryCost,
  0,
);
assert.ok(
  plan.deliveryCost <= baselineCost,
  "every greedy merge saves money versus separate jobs",
);
for (let seed = 1; seed <= 20; seed++)
  checkConstraints(buildPlan(store.customers(), originalOrders, 1, seed));

const firstId = store.orders()[0].id;
assert.ok(store.updateOrder(firstId, 4), "quantity above three is rejected");
assert.equal(store.orders()[0].quantity, 1);
assert.equal(store.updateOrder(firstId, 2), null);
assert.equal(
  store.plan(),
  null,
  "editing a draft order invalidates the visible draft",
);
const changedPlan = store.generatePlan();
assert.equal(changedPlan.totalBoxes, 49);
assert.equal(
  store.findJob(changedPlan.jobs[0].code),
  null,
  "unconfirmed jobs stay unavailable",
);
assert.equal(store.confirmPlan(), null);
assert.equal(store.confirmPlan(), null, "confirming twice is idempotent");
assert.ok(store.orders().every((order) => order.status === "assigned"));
assert.ok(store.updateOrder(firstId, 1), "assigned orders cannot be edited");
assert.ok(
  store.simulateOrders(),
  "confirmed batch cannot be replaced by simulation",
);
assert.equal(
  store.generatePlan(),
  null,
  "confirmed batch cannot be overwritten",
);
assert.ok(store.findJob(` ${changedPlan.jobs[0].code.toLowerCase()} `));
const snapshot = store.findJob(changedPlan.jobs[0].code).stops[0].customer;
const originalName = snapshot.name;
assert.equal(
  store.updateCustomer(snapshot.id, { ...snapshot, name: "แก้ชื่อหลังยืนยัน" }),
  null,
);
assert.equal(
  store.findJob(changedPlan.jobs[0].code).stops[0].customer.name,
  originalName,
  "confirmed work keeps its customer snapshot",
);

const farCustomer = { ...store.customers()[0], lat: 18, lng: 103.25 };
assert.equal(
  buildPlan(
    [farCustomer],
    [
      {
        id: "far",
        customerId: farCustomer.id,
        quantity: 1,
        status: "pending",
        date: dateToday(),
      },
    ],
  ),
  null,
  "infeasible destination is rejected",
);
const draftStore = new DispatchStore();
const stalePlan = draftStore.generatePlan();
const draftCustomer = draftStore.customers()[0];
assert.equal(
  draftStore.updateCustomer(draftCustomer.id, {
    ...draftCustomer,
    lat: draftCustomer.lat + 0.0001,
  }),
  null,
);
assert.equal(
  draftStore.plan(),
  null,
  "a changed customer destination invalidates a draft",
);
draftStore.plan.set(stalePlan);
assert.ok(
  draftStore.confirmPlan(),
  "restoring an old draft still fails the source-version guard",
);
assert.ok(
  draftStore.orders().every((order) => order.status === "pending"),
  "stale confirmation leaves orders untouched",
);
assert.equal(
  draftStore.addCustomer({ ...draftCustomer, lat: 0, lng: 0 }),
  "ลูกค้าต้องอยู่ในรัศมี 3 กิโลเมตรจากร้าน",
);
const yesterdayDate = new Date(`${dateToday()}T00:00:00Z`);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterday = yesterdayDate.toISOString().slice(0, 10);
const yesterdayPlan = { ...changedPlan, date: yesterday, status: "confirmed" };
draftStore.plan.set(yesterdayPlan);
assert.ok(
  draftStore.confirmPlan(),
  "a confirmed plan from another day cannot pass idempotency",
);
let persisted = JSON.stringify({
  customers: draftStore.customers(),
  orders: draftStore
    .orders()
    .map((order) => ({ ...order, date: yesterday, status: "assigned" })),
  plans: [yesterdayPlan],
  plan: yesterdayPlan,
  sourceVersion: 2,
  alternativeCount: 0,
});
globalThis.localStorage = {
  getItem: () => persisted,
  setItem: (_key, value) => {
    persisted = value;
  },
};
const nextDayStore = new DispatchStore();
assert.equal(
  nextDayStore.plan(),
  null,
  "yesterday’s persisted active selection is cleared on reload",
);
assert.equal(nextDayStore.plans().length, 1, "historical plans are preserved");
assert.equal(
  nextDayStore.findJob(yesterdayPlan.jobs[0].code),
  null,
  "yesterday’s jobs cannot be opened as today’s jobs",
);
assert.equal(
  nextDayStore.simulateOrders(),
  null,
  "yesterday’s confirmation does not lock today’s simulation",
);
assert.equal(nextDayStore.generatePlan().date, dateToday());
delete globalThis.localStorage;
console.log(
  `Domain checks passed: 24 orders / 48 boxes, ${plan.jobs.length} jobs, delivery ${plan.deliveryCost.toFixed(2)} baht, profit ${plan.profit.toFixed(2)} baht; 20 alternatives plus CRUD/confirmation/snapshot guards.`,
);
