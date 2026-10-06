import { DecimalPipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, ElementRef, inject, signal, untracked, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Customer, CustomerInput, DeliveryApi, errorMessage } from '../../services/delivery-api';
import { DeliveryStore } from '../../services/delivery-store';

interface CustomerForm {
  name: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

@Component({
  selector: 'app-customer-page',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './customer-page.html',
  styleUrl: './customer-page.css',
})
export class CustomerPage {
  readonly store = inject(DeliveryStore);
  private readonly api = inject(DeliveryApi);
  readonly search = signal('');
  readonly selectedId = signal<number | null>(null);
  readonly selectedCustomer = signal<Customer | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal('');
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly formError = signal('');
  readonly deleteError = signal('');
  readonly notice = signal('');
  readonly editingId = signal<number | null>(null);
  readonly deleteTarget = signal<Customer | null>(null);
  readonly filteredCustomers = computed(() => {
    const term = this.search().trim().toLocaleLowerCase('th-TH');
    return this.store.customers().filter(customer =>
      !term || `${customer.name} ${customer.phone} ${customer.address ?? ''}`.toLocaleLowerCase('th-TH').includes(term));
  });
  readonly mapsUrl = computed(() => {
    const customer = this.selectedCustomer();
    if (!customer || !Number.isFinite(customer.latitude) || !Number.isFinite(customer.longitude)) return null;
    return `https://www.google.com/maps/search/?api=1&query=${customer.latitude},${customer.longitude}`;
  });

  @ViewChild('customerDialog') customerDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('deleteDialog') deleteDialog?: ElementRef<HTMLDialogElement>;
  form: CustomerForm = this.emptyForm();
  private detailRequest = 0;
  private lastCustomerList = this.store.customers();

  constructor() {
    effect(() => {
      const customers = this.store.customers();
      if (customers === this.lastCustomerList) return;
      this.lastCustomerList = customers;
      untracked(() => {
        const id = this.selectedId();
        if (id === null) return;
        const customer = customers.find(row => row.id === id);
        if (!customer) {
          this.clearSelection();
          return;
        }
        // A refreshed list is authoritative; ignore any older detail GET still in flight.
        this.detailRequest++;
        this.selectedCustomer.set(customer);
        this.detailError.set('');
        this.detailLoading.set(false);
      });
    });
    inject(DestroyRef).onDestroy(() => { this.detailRequest++; });
  }

  private emptyForm(): CustomerForm {
    return { name: '', phone: '', address: '', latitude: null, longitude: null };
  }

  async reloadCustomers(): Promise<void> {
    try {
      await this.store.loadCustomers();
    } catch { /* Shared store exposes the actual API error next to the list. */ }
  }

  async selectCustomer(id: number): Promise<void> {
    const request = ++this.detailRequest;
    this.selectedId.set(id);
    this.selectedCustomer.set(null);
    this.detailError.set('');
    this.detailLoading.set(true);
    try {
      const customer = await this.api.getCustomer(id);
      if (request === this.detailRequest) this.selectedCustomer.set(customer);
    } catch (error) {
      if (request === this.detailRequest) this.detailError.set(errorMessage(error));
    } finally {
      if (request === this.detailRequest) this.detailLoading.set(false);
    }
  }

  retryDetail(): void {
    const id = this.selectedId();
    if (id !== null) void this.selectCustomer(id);
  }

  private clearSelection(): void {
    this.detailRequest++;
    this.selectedId.set(null);
    this.selectedCustomer.set(null);
    this.detailError.set('');
    this.detailLoading.set(false);
  }

  openAdd(): void {
    if (this.saving() || this.deleting()) return;
    this.editingId.set(null);
    this.form = this.emptyForm();
    this.formError.set('');
    this.customerDialog?.nativeElement.showModal();
  }

  openEdit(customer: Customer): void {
    if (this.saving() || this.deleting()) return;
    this.editingId.set(customer.id);
    this.form = { name: customer.name, phone: customer.phone, address: customer.address ?? '', latitude: customer.latitude, longitude: customer.longitude };
    this.formError.set('');
    this.customerDialog?.nativeElement.showModal();
  }

  closeCustomerDialog(): void {
    if (!this.saving()) this.customerDialog?.nativeElement.close();
  }

  cancelCustomerDialog(event: Event): void {
    if (this.saving()) event.preventDefault();
  }

  private validatedInput(): CustomerInput | null {
    const name = this.form.name.trim();
    const phone = this.form.phone.trim();
    const address = this.form.address.trim();
    const { latitude, longitude } = this.form;
    if (!name || name.length > 100) this.formError.set('กรุณากรอกชื่อไม่เกิน 100 ตัวอักษร');
    else if (!phone || phone.length > 20) this.formError.set('กรุณากรอกเบอร์โทรไม่เกิน 20 ตัวอักษร');
    else if (address.length > 500) this.formError.set('ที่อยู่ต้องเป็นข้อความไม่เกิน 500 ตัวอักษร');
    else if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) this.formError.set('กรอกละติจูด -90 ถึง 90 และลองจิจูด -180 ถึง 180 ให้ถูกต้อง');
    else return { name, phone, address: address || null, latitude, longitude };
    return null;
  }

  async saveCustomer(): Promise<void> {
    if (this.saving()) return;
    this.formError.set('');
    const input = this.validatedInput();
    if (!input) return;
    const id = this.editingId();
    this.saving.set(true);
    try {
      let saved: { id: number; message: string };
      try {
        saved = id === null ? await this.api.createCustomer(input) : await this.api.updateCustomer(id, input);
      } catch (error) {
        this.formError.set(errorMessage(error));
        return;
      }
      this.customerDialog?.nativeElement.close();
      this.notice.set(saved.message);
      // Refresh failures stay separate from a successful save, preventing accidental duplicate POSTs.
      await Promise.allSettled(id === null
        ? [this.store.loadCustomers()]
        : [this.store.loadCustomers(), this.store.loadOrders()]);
      await this.selectCustomer(saved.id);
    } finally { this.saving.set(false); }
  }

  openDelete(customer: Customer): void {
    if (this.saving() || this.deleting()) return;
    this.deleteTarget.set(customer);
    this.deleteError.set('');
    this.deleteDialog?.nativeElement.showModal();
  }

  closeDeleteDialog(): void {
    if (!this.deleting()) this.deleteDialog?.nativeElement.close();
  }

  cancelDeleteDialog(event: Event): void {
    if (this.deleting()) event.preventDefault();
  }

  async deleteCustomer(): Promise<void> {
    const customer = this.deleteTarget();
    if (!customer || this.deleting()) return;
    this.deleting.set(true);
    this.deleteError.set('');
    try {
      let message: string;
      try {
        message = (await this.api.deleteCustomer(customer.id)).message;
      } catch (error) {
        // In particular, HTTP 409 must leave the customer and related orders intact.
        this.deleteError.set(errorMessage(error));
        return;
      }
      if (this.selectedId() === customer.id) this.clearSelection();
      this.deleteDialog?.nativeElement.close();
      this.deleteTarget.set(null);
      this.notice.set(message);
      await Promise.allSettled([this.store.loadCustomers(), this.store.loadOrders()]);
    } finally { this.deleting.set(false); }
  }
}
