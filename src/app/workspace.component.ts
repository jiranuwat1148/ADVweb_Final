import { Component, computed, inject, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
} from "@angular/router";
import { DispatchStore, SHOP, fmtBaht, dateToday } from "./dispatch.store";
import { Customer, Job } from "./models";
import { RouteMapComponent } from "./route-map.component";
import { IconComponent } from "./icon.component";

@Component({
  selector: "app-workspace",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouteMapComponent,
    IconComponent,
  ],
  templateUrl: "./workspace.component.html",
  styleUrl: "./workspace.component.css",
})
export class WorkspaceComponent {
  readonly store = inject(DispatchStore);
  readonly route = inject(ActivatedRoute);
  readonly router = inject(Router);
  readonly view: string = this.route.snapshot.data["view"] || "overview";
  readonly today = dateToday();
  readonly shop = SHOP;
  readonly money = fmtBaht;
  readonly selectedId = signal<string | null>(null);
  readonly mobileMenu = signal(false);
  readonly search = signal("");
  readonly statusFilter = signal("all");
  readonly modal = signal<"order" | "customer" | "confirm" | "help" | null>(
    null,
  );
  readonly toast = signal("");
  readonly toastError = signal(false);
  readonly busy = signal(false);
  readonly focusCustomer = signal<Customer | null>(null);
  readonly riderJob = signal<Job | null>(null);
  readonly riderError = signal("");
  editingId: string | null = null;
  formCustomer = "";
  formQuantity = 1;
  customerForm = this.emptyCustomer();
  jobCode = "";
  readonly currentOrders = computed(() =>
    this.store
      .orders()
      .filter((o) => o.date === this.today && o.status !== "cancelled"),
  );
  readonly boxes = computed(() =>
    this.currentOrders().reduce((sum, o) => sum + o.quantity, 0),
  );
  readonly currentPlans = computed(() =>
    this.store.plans().filter((p) => p.date === this.today),
  );
  readonly selectedJob = computed(
    () =>
      this.store.plan()?.jobs.find((j) => j.id === this.selectedId()) ||
      this.store.plan()?.jobs[0] ||
      null,
  );
  readonly filteredOrders = computed(() => {
    const term = this.search().toLowerCase();
    return this.currentOrders()
      .map((o) => ({ ...o, customer: this.customer(o.customerId) }))
      .filter(
        (o) =>
          (!term ||
            `${o.id} ${o.customer?.name} ${o.customer?.phone}`
              .toLowerCase()
              .includes(term)) &&
          (this.statusFilter() === "all" || o.status === this.statusFilter()),
      );
  });
  readonly filteredCustomers = computed(() => {
    const term = this.search().toLowerCase();
    return this.store
      .customers()
      .filter(
        (c) =>
          !term ||
          `${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(term),
      );
  });
  readonly dateLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(this.today + "T12:00:00+07:00"));
  get title() {
    return this.view === "orders"
      ? "จัดการออเดอร์"
      : this.view === "customers"
        ? "ลูกค้าของร้าน"
        : "ภาพรวมการจัดส่ง";
  }
  get subtitle() {
    return this.view === "orders"
      ? "เตรียมออเดอร์ให้พร้อม ก่อนออกส่งมื้อเที่ยง"
      : this.view === "customers"
        ? "ทุกจุดส่งอยู่ใกล้ รู้จักลูกค้าให้มากขึ้น"
        : "ทุกกล่องถึงมือ ทุกมื้อทันเวลา";
  }
  customer(id: string) {
    return this.store.customers().find((c) => c.id === id);
  }
  statusText(status: string) {
    return (
      (
        {
          pending: "รอจัดเส้นทาง",
          assigned: "มอบหมายแล้ว",
          delivered: "ส่งสำเร็จ",
          cancelled: "ยกเลิก",
        } as Record<string, string>
      )[status] || status
    );
  }
  jobIndex(job: Job) {
    return (this.store.plan()?.jobs.findIndex((j) => j.id === job.id) ?? 0) + 1;
  }
  notify(message: string, error = false) {
    this.toast.set(message);
    this.toastError.set(error);
    setTimeout(() => this.toast.set(""), 4200);
  }
  plan(alternative = false) {
    this.busy.set(true);
    setTimeout(() => {
      const result = this.store.generatePlan(alternative);
      this.busy.set(false);
      if (result) {
        this.selectedId.set(result.jobs[0]?.id || null);
        this.notify(
          alternative
            ? "แผนทางเลือกพร้อมแล้ว เปรียบเทียบต้นทุนก่อนยืนยัน"
            : "จัดเส้นทางเรียบร้อย พร้อมตรวจสอบใบงาน",
        );
      } else this.notify(this.store.error() || "ไม่สามารถจัดแผนได้", true);
    }, 350);
  }
  simulate() {
    const error = this.store.simulateOrders(24);
    this.notify(error || "สร้างออเดอร์จำลอง 24 รายการแล้ว", !!error);
  }
  confirm() {
    const error = this.store.confirmPlan();
    if (error) {
      this.notify(error, true);
      return;
    }
    this.modal.set(null);
    this.notify("ยืนยันแผนแล้ว ส่งเลขใบงานให้ไรเดอร์ได้เลย");
  }
  selectPlan(id: string) {
    const current = this.store.plan();
    const selected = this.currentPlans().find((p) => p.id === id);
    if (
      !current ||
      current.status === "confirmed" ||
      !selected ||
      selected.sourceVersion !== current.sourceVersion
    ) {
      this.notify("ข้อมูลเปลี่ยนแล้ว กรุณาคำนวณแผนใหม่ก่อนเลือก", true);
      return;
    }
    this.store.plan.set(selected);
    this.selectedId.set(selected.jobs[0]?.id || null);
    this.notify("เลือกแผนนี้แล้ว ตรวจสอบก่อนยืนยันได้เลย");
  }
  openOrder(id: string | null = null) {
    this.editingId = id;
    const order = this.store.orders().find((o) => o.id === id);
    this.formCustomer =
      order?.customerId || this.store.customers()[0]?.id || "";
    this.formQuantity = order?.quantity || 1;
    this.modal.set("order");
  }
  saveOrder() {
    const error = this.editingId
      ? this.store.updateOrder(this.editingId, Number(this.formQuantity))
      : this.store.addOrder(this.formCustomer, Number(this.formQuantity));
    if (error) {
      this.notify(error, true);
      return;
    }
    this.modal.set(null);
    this.notify(this.editingId ? "แก้ไขออเดอร์แล้ว" : "เพิ่มออเดอร์เรียบร้อย");
  }
  removeOrder(id: string) {
    if (!window.confirm("ยกเลิกออเดอร์นี้ใช่ไหม?")) return;
    const error = this.store.removeOrder(id);
    this.notify(error || "ยกเลิกออเดอร์แล้ว", !!error);
  }
  emptyCustomer(): Omit<Customer, "id"> {
    return {
      name: "",
      phone: "",
      address: "",
      lat: SHOP.lat,
      lng: SHOP.lng,
      zone: "ขามเรียง",
    };
  }
  openCustomer(id: string | null = null) {
    this.editingId = id;
    const customer = this.store.customers().find((c) => c.id === id);
    this.customerForm = customer
      ? {
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          lat: customer.lat,
          lng: customer.lng,
          zone: customer.zone,
        }
      : this.emptyCustomer();
    this.modal.set("customer");
  }
  saveCustomer() {
    const data = {
      ...this.customerForm,
      lat: Number(this.customerForm.lat),
      lng: Number(this.customerForm.lng),
    };
    const error = this.editingId
      ? this.store.updateCustomer(this.editingId, data)
      : this.store.addCustomer(data);
    if (error) {
      this.notify(error, true);
      return;
    }
    if (this.editingId && this.focusCustomer()?.id === this.editingId)
      this.focusCustomer.set(this.customer(this.editingId) || null);
    this.modal.set(null);
    this.notify("บันทึกข้อมูลลูกค้าแล้ว");
  }
  removeCustomer(id: string) {
    if (!window.confirm("ลบลูกค้านี้จากรายการใช่ไหม?")) return;
    const error = this.store.removeCustomer(id);
    if (!error && this.focusCustomer()?.id === id) this.focusCustomer.set(null);
    this.notify(error || "ลบข้อมูลลูกค้าแล้ว", !!error);
  }
  mapsUrl(lat: number, lng: number) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  }
  lookup() {
    const job = this.store.findJob(this.jobCode.trim());
    this.riderJob.set(job);
    this.riderError.set(
      job ? "" : "ไม่พบใบงานที่ยืนยันแล้ว กรุณาตรวจสอบรหัสอีกครั้ง",
    );
  }
  async copyCode(job: Job) {
    try {
      await navigator.clipboard.writeText(job.code);
      this.notify("คัดลอกเลขใบงานแล้ว");
    } catch {
      this.notify("เลขใบงาน: " + job.code);
    }
  }
  previewJob(job: Job) {
    this.router.navigate(["/rider"], { queryParams: { code: job.code } });
  }
  constructor() {
    if (
      this.view === "overview" &&
      !this.store.plan() &&
      this.currentOrders().length
    ) {
      this.store.generatePlan();
    }
    if (this.view === "rider") {
      this.jobCode = this.route.snapshot.queryParamMap.get("code") || "";
      if (this.jobCode) this.lookup();
    }
  }
}
