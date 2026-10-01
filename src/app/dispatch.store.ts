import { Injectable, effect, signal } from "@angular/core";
import { Customer, DeliveryPlan, Job, Order, SHOP, dateToday } from "./models";
export { SHOP, fmtBaht, dateToday } from "./models";

const STORAGE_KEY = "lunch-dispatch-demo-v1";
const COLORS = [
  "#ef6a45",
  "#347b63",
  "#5478bb",
  "#b085c3",
  "#d39a37",
  "#3d9da4",
  "#bc596f",
  "#7a8553",
  "#937260",
  "#7179a7",
  "#519469",
  "#bd814a",
];
const MAX_DELIVERY_MINUTES = 60;
const BUFFER_MINUTES = 5;
const MINUTES_PER_STOP = 2;

interface Route {
  orders: Order[];
  distanceKm: number;
  boxes: number;
  costCents: number;
  durationMinutes: number;
}

interface StoredState {
  customers: Customer[];
  orders: Order[];
  plans: DeliveryPlan[];
  plan: DeliveryPlan | null;
  sourceVersion: number;
  alternativeCount: number;
}

function uid(prefix: string): string {
  const token =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}-${token}`;
}

/** Straight-line distance, used only by this local demo. */
export function haversineKm(
  a: Pick<Customer, "lat" | "lng">,
  b: Pick<Customer, "lat" | "lng">,
): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLng = (b.lng - a.lng) * radians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * radians) *
      Math.cos(b.lat * radians) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Bill the fixed fee plus the full route distance for every box on the job. */
export function routeCostCents(boxes: number, distanceKm: number): number {
  return 1500 + Math.round(200 * boxes * distanceKm);
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, other) => other !== index)).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

function bestRoute(
  orders: Order[],
  customers: Map<string, Customer>,
): Route | null {
  let best: Route | null = null;
  for (const ordered of permutations(orders)) {
    let previous: Pick<Customer, "lat" | "lng"> = SHOP;
    let distanceKm = 0;
    for (const order of ordered) {
      const customer = customers.get(order.customerId);
      if (!customer) return null;
      distanceKm += haversineKm(previous, customer) * 1.25;
      previous = customer;
    }
    const boxes = ordered.reduce((sum, order) => sum + order.quantity, 0);
    const durationMinutes = distanceKm * 2 + ordered.length * MINUTES_PER_STOP;
    if (durationMinutes + BUFFER_MINUTES > MAX_DELIVERY_MINUTES) continue;
    const costCents = routeCostCents(boxes, distanceKm);
    if (
      !best ||
      costCents < best.costCents ||
      (costCents === best.costCents && distanceKm < best.distanceKm)
    ) {
      best = { orders: ordered, distanceKm, boxes, costCents, durationMinutes };
    }
  }
  return best;
}

function randomSeed(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function jobCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues)
    crypto.getRandomValues(bytes);
  else
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = Math.floor(Math.random() * 256);
  return `LX-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

function etaLabel(minutes: number): string {
  const absolute = 11 * 60 + 30 + Math.ceil(minutes);
  return `${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

/** Greedy merge is a heuristic; alternate seeds explore different favorable merges. */
export function buildPlan(
  customers: Customer[],
  orders: Order[],
  sourceVersion = 0,
  alternativeSeed = 0,
  date = dateToday(),
): DeliveryPlan | null {
  const pending = orders.filter(
    (order) => order.date === date && order.status === "pending",
  );
  if (!pending.length) return null;
  const lookup = new Map(customers.map((customer) => [customer.id, customer]));
  if (
    pending.some(
      (order) =>
        !Number.isInteger(order.quantity) ||
        order.quantity < 1 ||
        order.quantity > 3 ||
        !lookup.has(order.customerId),
    )
  )
    return null;
  let routes: Route[] = [];
  for (const order of pending) {
    const route = bestRoute([order], lookup);
    if (!route) return null;
    routes.push(route);
  }
  const random = randomSeed(alternativeSeed);
  while (true) {
    const candidates: { a: number; b: number; saving: number; route: Route }[] =
      [];
    for (let a = 0; a < routes.length; a++) {
      for (let b = a + 1; b < routes.length; b++) {
        if (routes[a].orders.length + routes[b].orders.length > 3) continue;
        const route = bestRoute(
          [...routes[a].orders, ...routes[b].orders],
          lookup,
        );
        if (!route) continue;
        const saving =
          routes[a].costCents + routes[b].costCents - route.costCents;
        if (saving > 0) candidates.push({ a, b, saving, route });
      }
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => b.saving - a.saving || a.a - b.a || a.b - b.b);
    const candidate =
      candidates[
        alternativeSeed > 0
          ? Math.floor(random() * Math.min(3, candidates.length))
          : 0
      ];
    routes = routes.filter(
      (_, index) => index !== candidate.a && index !== candidate.b,
    );
    routes.push(candidate.route);
  }
  routes.sort((a, b) => a.orders[0].id.localeCompare(b.orders[0].id));
  const usedCodes = new Set<string>();
  const jobs: Job[] = routes.map((route, index) => {
    let elapsed = 0;
    let previous: Pick<Customer, "lat" | "lng"> = SHOP;
    const stops = route.orders.map((order, sequence) => {
      const customer = { ...lookup.get(order.customerId)! };
      elapsed += haversineKm(previous, customer) * 1.25 * 2 + MINUTES_PER_STOP;
      previous = customer;
      return {
        orderId: order.id,
        customerId: customer.id,
        sequence: sequence + 1,
        eta: etaLabel(elapsed),
        boxes: order.quantity,
        customer,
      };
    });
    let code = jobCode();
    while (usedCodes.has(code)) code = jobCode();
    usedCodes.add(code);
    return {
      id: uid("job"),
      code,
      color: COLORS[index % COLORS.length],
      orderIds: route.orders.map((order) => order.id),
      totalBoxes: route.boxes,
      distanceKm: route.distanceKm,
      cost: route.costCents / 100,
      durationMinutes: route.durationMinutes,
      stops,
      path: [
        [SHOP.lat, SHOP.lng],
        ...stops.map(
          (stop) => [stop.customer.lat, stop.customer.lng] as [number, number],
        ),
      ],
    };
  });
  const totalBoxes = jobs.reduce((sum, job) => sum + job.totalBoxes, 0);
  const deliveryCents = routes.reduce((sum, route) => sum + route.costCents, 0);
  return {
    id: uid("plan"),
    createdAt: new Date().toISOString(),
    date,
    status: "draft",
    totalBoxes,
    totalOrders: pending.length,
    totalRevenue: totalBoxes * 65,
    foodCost: totalBoxes * 40,
    deliveryCost: deliveryCents / 100,
    profit: (totalBoxes * 2500 - deliveryCents) / 100,
    totalDistanceKm: jobs.reduce((sum, job) => sum + job.distanceKm, 0),
    durationMinutes: Math.max(...jobs.map((job) => job.durationMinutes)),
    jobs,
    sourceVersion,
  };
}

function seedCustomers(): Customer[] {
  const names = [
    "พิมพ์ชนก",
    "กิตติพงษ์",
    "ณัฐชา",
    "ธนกร",
    "สุภัทรา",
    "วรินทร์",
    "ชญานิศ",
    "ภัทรพล",
    "อรอุมา",
    "นภัส",
    "สิริน",
    "ปกรณ์",
    "จิราพร",
    "ศุภกร",
    "มนัสวี",
    "รัชพล",
    "พิชญา",
    "อธิวัฒน์",
    "วิภาวี",
    "ธีรภัทร",
    "กมลชนก",
    "ณัฐวุฒิ",
    "ปาริฉัตร",
    "อัครพล",
  ];
  const zones = [
    "ฝั่งหอพักทิศเหนือ",
    "โซนขามเรียง",
    "โซนคณะวิทย์",
    "ฝั่งหอพักทิศใต้",
    "โซนตลาดน้อย",
    "โซนคณะศึกษา",
    "โซนหอพักตะวันตก",
    "โซนหน้ามอ",
  ];
  return names.map((name, index) => {
    const cluster = Math.floor(index / 3);
    const angle = (cluster * Math.PI) / 4 + ((index % 3) - 1) * 0.045;
    const radius = 0.65 + (cluster % 4) * 0.39 + (index % 3) * 0.065;
    return {
      id: `cus-${String(index + 1).padStart(3, "0")}`,
      name: `คุณ${name}`,
      phone: `089000${String(1000 + index)}`,
      address: `${index + 10}/1 หอพัก${name} ต.ขามเรียง อ.กันทรวิชัย จ.มหาสารคาม`,
      lat: SHOP.lat + (Math.sin(angle) * radius) / 111.32,
      lng:
        SHOP.lng +
        (Math.cos(angle) * radius) /
          (111.32 * Math.cos((SHOP.lat * Math.PI) / 180)),
      zone: zones[cluster],
    };
  });
}

function seedOrders(customers: Customer[], count = 24): Order[] {
  const date = dateToday();
  return Array.from({ length: count }, (_, index) => ({
    id: uid(`ORD-${String(index + 1).padStart(3, "0")}`),
    customerId: customers[index % customers.length].id,
    quantity: (index % 3) + 1,
    date,
    status: "pending",
  }));
}

function freshState(): StoredState {
  const customers = seedCustomers();
  return {
    customers,
    orders: seedOrders(customers),
    plans: [],
    plan: null,
    sourceVersion: 1,
    alternativeCount: 0,
  };
}

function readState(): StoredState {
  try {
    if (typeof localStorage === "undefined") return freshState();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const state = JSON.parse(raw) as StoredState;
    const validCustomers =
      Array.isArray(state.customers) &&
      state.customers.every(
        (c) =>
          typeof c.id === "string" &&
          typeof c.name === "string" &&
          typeof c.phone === "string" &&
          typeof c.address === "string" &&
          typeof c.zone === "string" &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng),
      );
    const validOrders =
      Array.isArray(state.orders) &&
      state.orders.every(
        (o) =>
          typeof o.id === "string" &&
          typeof o.customerId === "string" &&
          typeof o.date === "string" &&
          Number.isInteger(o.quantity) &&
          o.quantity >= 1 &&
          o.quantity <= 3 &&
          ["pending", "assigned", "delivered", "cancelled"].includes(o.status),
      );
    const validPlan = (p: DeliveryPlan): boolean =>
      !!p &&
      typeof p.id === "string" &&
      typeof p.date === "string" &&
      ["draft", "confirmed"].includes(p.status) &&
      Number.isFinite(p.profit) &&
      Array.isArray(p.jobs) &&
      p.jobs.every(
        (j) =>
          Array.isArray(j.stops) &&
          Array.isArray(j.path) &&
          Array.isArray(j.orderIds) &&
          typeof j.code === "string" &&
          Number.isFinite(j.distanceKm),
      );
    if (
      !validCustomers ||
      !validOrders ||
      !Array.isArray(state.plans) ||
      !state.plans.every(validPlan) ||
      (state.plan !== null && !validPlan(state.plan)) ||
      !Number.isInteger(state.sourceVersion)
    )
      return freshState();
    return {
      ...state,
      // Keep historical plans, but today's workspace must start without yesterday's selection.
      plan: state.plan?.date === dateToday() ? state.plan : null,
      alternativeCount: Number.isInteger(state.alternativeCount)
        ? state.alternativeCount
        : 0,
    };
  } catch {
    return freshState();
  }
}

@Injectable({ providedIn: "root" })
export class DispatchStore {
  private readonly initial = readState();
  readonly customers = signal<Customer[]>(this.initial.customers);
  readonly orders = signal<Order[]>(this.initial.orders);
  readonly plans = signal<DeliveryPlan[]>(this.initial.plans);
  readonly plan = signal<DeliveryPlan | null>(this.initial.plan);
  readonly error = signal("");
  private readonly sourceVersion = signal(this.initial.sourceVersion);
  private readonly alternativeCount = signal(this.initial.alternativeCount);

  constructor() {
    effect(() => {
      const state: StoredState = {
        customers: this.customers(),
        orders: this.orders(),
        plans: this.plans(),
        plan: this.plan(),
        sourceVersion: this.sourceVersion(),
        alternativeCount: this.alternativeCount(),
      };
      try {
        if (typeof localStorage !== "undefined")
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* Demo remains usable when browser storage is unavailable. */
      }
    });
  }

  private fail(message: string): string {
    this.error.set(message);
    return message;
  }

  private orderChangesBlocked(): boolean {
    return this.plans().some(
      (plan) => plan.date === dateToday() && plan.status === "confirmed",
    );
  }

  private changed(): void {
    this.sourceVersion.update((version) => version + 1);
    if (this.plan()?.status === "draft") this.plan.set(null);
    this.error.set("");
  }

  simulateOrders(count = 24): string | null {
    if (this.orderChangesBlocked())
      return this.fail("ยืนยันแผนวันนี้แล้ว จึงเปลี่ยนออเดอร์ของรอบนี้ไม่ได้");
    if (!Number.isInteger(count) || count < 1 || count > 30)
      return this.fail("เลือกจำนวนออเดอร์ทดสอบ 1–30 รายการ");
    if (!this.customers().length)
      return this.fail("เพิ่มลูกค้าก่อนจำลองออเดอร์");
    const historical = this.orders().filter(
      (order) => order.date !== dateToday(),
    );
    this.orders.set([...historical, ...seedOrders(this.customers(), count)]);
    this.changed();
    return null;
  }

  addOrder(customerId: string, quantity: number): string | null {
    if (this.orderChangesBlocked())
      return this.fail("ยืนยันแผนวันนี้แล้ว จึงเพิ่มออเดอร์ในรอบนี้ไม่ได้");
    if (!this.customers().some((customer) => customer.id === customerId))
      return this.fail("เลือกลูกค้าที่มีอยู่ในระบบ");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 3)
      return this.fail("แต่ละออเดอร์สั่งได้ 1–3 กล่อง");
    this.orders.update((orders) => [
      ...orders,
      {
        id: uid("ORD"),
        customerId,
        quantity,
        date: dateToday(),
        status: "pending",
      },
    ]);
    this.changed();
    return null;
  }

  updateOrder(id: string, quantity: number): string | null {
    const order = this.orders().find((order) => order.id === id);
    if (!order) return this.fail("ไม่พบออเดอร์นี้");
    if (
      order.status !== "pending" ||
      (order.date === dateToday() && this.orderChangesBlocked())
    )
      return this.fail("แก้ไขได้เฉพาะออเดอร์ที่ยังไม่ยืนยันการจัดส่ง");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 3)
      return this.fail("แต่ละออเดอร์สั่งได้ 1–3 กล่อง");
    this.orders.update((orders) =>
      orders.map((order) => (order.id === id ? { ...order, quantity } : order)),
    );
    this.changed();
    return null;
  }

  removeOrder(id: string): string | null {
    const order = this.orders().find((order) => order.id === id);
    if (!order) return this.fail("ไม่พบออเดอร์นี้");
    if (
      order.status !== "pending" ||
      (order.date === dateToday() && this.orderChangesBlocked())
    )
      return this.fail("ยกเลิกได้เฉพาะออเดอร์ที่ยังไม่ยืนยันการจัดส่ง");
    this.orders.update((orders) =>
      orders.map((order) =>
        order.id === id ? { ...order, status: "cancelled" } : order,
      ),
    );
    this.changed();
    return null;
  }

  private validateCustomer(data: Omit<Customer, "id">): string | null {
    if (!data.name.trim() || !data.address.trim())
      return "กรอกชื่อลูกค้าและที่อยู่";
    if (!/^[0-9+()\s-]{9,18}$/.test(data.phone.trim()))
      return "กรอกเบอร์โทรที่ถูกต้อง เช่น 0891234567";
    if (
      !Number.isFinite(data.lat) ||
      !Number.isFinite(data.lng) ||
      data.lat < -90 ||
      data.lat > 90 ||
      data.lng < -180 ||
      data.lng > 180
    )
      return "ระบุพิกัดละติจูดและลองจิจูดให้ถูกต้อง";
    if (haversineKm(SHOP, data) > 3)
      return "ลูกค้าต้องอยู่ในรัศมี 3 กิโลเมตรจากร้าน";
    return null;
  }

  addCustomer(data: Omit<Customer, "id">): string | null {
    const error = this.validateCustomer(data);
    if (error) return this.fail(error);
    this.customers.update((customers) => [
      ...customers,
      {
        ...data,
        name: data.name.trim(),
        phone: data.phone.trim(),
        address: data.address.trim(),
        zone: data.zone.trim() || "โซนอื่น",
        id: uid("cus"),
      },
    ]);
    this.changed();
    return null;
  }

  updateCustomer(id: string, data: Omit<Customer, "id">): string | null {
    if (!this.customers().some((customer) => customer.id === id))
      return this.fail("ไม่พบลูกค้านี้");
    const error = this.validateCustomer(data);
    if (error) return this.fail(error);
    this.customers.update((customers) =>
      customers.map((customer) =>
        customer.id === id
          ? {
              ...data,
              id,
              name: data.name.trim(),
              phone: data.phone.trim(),
              address: data.address.trim(),
              zone: data.zone.trim() || "โซนอื่น",
            }
          : customer,
      ),
    );
    this.changed();
    return null;
  }

  removeCustomer(id: string): string | null {
    if (!this.customers().some((customer) => customer.id === id))
      return this.fail("ไม่พบลูกค้านี้");
    if (
      this.orders().some(
        (order) => order.customerId === id && order.status !== "cancelled",
      )
    )
      return this.fail("ลูกค้านี้มีออเดอร์อยู่ในระบบ จึงลบไม่ได้");
    this.customers.update((customers) =>
      customers.filter((customer) => customer.id !== id),
    );
    this.changed();
    return null;
  }

  generatePlan(alternative = false): DeliveryPlan | null {
    if (this.orderChangesBlocked()) {
      this.fail("ยืนยันแผนวันนี้แล้ว เปิดใบงานไรเดอร์ได้ทันที");
      return null;
    }
    if (
      !this.orders().some(
        (order) => order.date === dateToday() && order.status === "pending",
      )
    ) {
      this.fail("เพิ่มหรือจำลองออเดอร์ของวันนี้ก่อนคำนวณแผน");
      return null;
    }
    const seed = alternative ? this.alternativeCount() + 1 : 0;
    if (alternative) this.alternativeCount.set(seed);
    const plan = buildPlan(
      this.customers(),
      this.orders(),
      this.sourceVersion(),
      seed,
    );
    if (!plan) {
      this.fail(
        "ข้อมูลไม่ครบหรือมีจุดส่งที่ทำเวลาไม่ได้ กรุณาตรวจพิกัดและจำนวนกล่อง",
      );
      return null;
    }
    this.plan.set(plan);
    this.plans.update((plans) => [...plans, plan]);
    this.error.set("");
    return plan;
  }

  confirmPlan(): string | null {
    const plan = this.plan();
    if (!plan) return this.fail("คำนวณแผนก่อนยืนยันการจัดส่ง");
    if (plan.date !== dateToday())
      return this.fail("แผนนี้เป็นของวันอื่น กรุณาคำนวณแผนสำหรับวันนี้");
    if (plan.status === "confirmed") {
      this.error.set("");
      return null;
    }
    if (this.orderChangesBlocked())
      return this.fail("มีแผนที่ยืนยันแล้วสำหรับวันนี้");
    if (plan.sourceVersion !== this.sourceVersion())
      return this.fail("ข้อมูลเปลี่ยนแล้ว กรุณาคำนวณแผนใหม่ก่อนยืนยัน");
    const sourceOrders = this.orders().filter(
      (order) => order.date === plan.date && order.status === "pending",
    );
    const assigned = new Set(plan.jobs.flatMap((job) => job.orderIds));
    if (
      assigned.size !== sourceOrders.length ||
      plan.jobs.some((job) => job.orderIds.length > 3) ||
      sourceOrders.some((order) => !assigned.has(order.id))
    )
      return this.fail("ใบงานไม่ตรงกับออเดอร์ กรุณาคำนวณใหม่");
    const confirmed: DeliveryPlan = { ...plan, status: "confirmed" };
    this.orders.update((orders) =>
      orders.map((order) =>
        assigned.has(order.id) ? { ...order, status: "assigned" } : order,
      ),
    );
    this.plans.update((plans) =>
      plans.map((candidate) =>
        candidate.id === plan.id ? confirmed : candidate,
      ),
    );
    this.plan.set(confirmed);
    this.error.set("");
    return null;
  }

  findJob(code: string): Job | null {
    const normalized = code.trim().toUpperCase();
    for (const plan of this.plans()) {
      if (plan.status !== "confirmed" || plan.date !== dateToday()) continue;
      const job = plan.jobs.find((job) => job.code === normalized);
      if (job) return job;
    }
    return null;
  }
}
