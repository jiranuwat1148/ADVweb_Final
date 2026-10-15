import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { DeliveryPlan } from '../../services/plan-api';

@Component({
  selector: 'app-dispatch-map',
  standalone: true,
  template: '<div #mapHost class="ld-leaflet-map" role="application" aria-label="แผนที่ OpenStreetMap แสดงเส้นทางจัดส่ง"></div>',
  styles: [':host { display: block; width: 100%; height: 100%; min-height: 320px; } .ld-leaflet-map { width: 100%; height: 100%; min-height: 320px; }'],
})
export class DispatchMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) plan!: DeliveryPlan;
  @Input() selectedJobId: number | null = null;
  @Output() selectedJobIdChange = new EventEmitter<number>();
  @ViewChild('mapHost', { static: true }) private mapHost!: ElementRef<HTMLDivElement>;

  private leaflet?: typeof import('leaflet/dist/leaflet-src.esm.js');
  private map?: import('leaflet').Map;
  private layers?: import('leaflet').FeatureGroup;
  private resizeObserver?: ResizeObserver;
  private renderedPlan?: DeliveryPlan;
  private bounds?: import('leaflet').LatLngBounds;
  private pendingFit = false;
  private destroyed = false;

  ngAfterViewInit(): void {
    void this.initializeMap();
  }

  private async initializeMap(): Promise<void> {
    const leaflet = await import('leaflet/dist/leaflet-src.esm.js');
    if (this.destroyed) return;
    this.leaflet = leaflet;
    this.map = leaflet.map(this.mapHost.nativeElement, { preferCanvas: true });
    leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      updateWhenIdle: true,
      keepBuffer: 1,
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    }).addTo(this.map);
    this.layers = leaflet.featureGroup().addTo(this.map);
    this.resizeObserver = new ResizeObserver(() => {
      this.map?.invalidateSize({ pan: false });
      this.fitPlanBounds();
    });
    this.resizeObserver.observe(this.mapHost.nativeElement);
    this.renderPlan();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map || (!changes['plan'] && !changes['selectedJobId'])) return;
    this.renderPlan();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.map?.remove();
    this.map = undefined;
  }

  private renderPlan(): void {
    const L = this.leaflet;
    if (!L || !this.map || !this.layers || !this.plan) return;
    const planChanged = this.renderedPlan !== this.plan;
    this.layers.clearLayers();
    this.bounds = L.latLngBounds([[this.plan.shop.latitude, this.plan.shop.longitude]]);

    for (const job of this.plan.jobs) {
      const selected = this.selectedJobId === null || this.selectedJobId === job.id;
      const coordinates: import('leaflet').LatLngTuple[] = job.geometry.coordinates
        .filter(([longitude, latitude]) => Number.isFinite(longitude) && Number.isFinite(latitude))
        .map(([longitude, latitude]) => [latitude, longitude]);
      coordinates.forEach(point => this.bounds?.extend(point));

      const route = L.polyline(coordinates, {
        color: job.color,
        weight: selected ? 6 : 4,
        opacity: selected ? 0.95 : 0.55,
      }).addTo(this.layers);
      route.on('click', () => this.selectedJobIdChange.emit(job.id));

      for (const stop of job.stops) {
        const marker = L.marker([stop.latitude, stop.longitude], {
          icon: L.divIcon({
            className: 'ld-map-stop-icon',
            html: `<span style="--route-color:${this.safeColor(job.color)}">${stop.sequence_no}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          opacity: selected ? 1 : 0.55,
        }).addTo(this.layers);
        this.bounds?.extend([stop.latitude, stop.longitude]);
        marker.on('click', () => this.selectedJobIdChange.emit(job.id));
      }
    }

    L.marker([this.plan.shop.latitude, this.plan.shop.longitude], {
      icon: L.divIcon({
        className: 'ld-map-shop-icon',
        html: '<span>ร้าน</span>',
        iconSize: [42, 32],
        iconAnchor: [21, 16],
      }),
      zIndexOffset: 1000,
    }).addTo(this.layers);

    this.pendingFit ||= planChanged;
    this.renderedPlan = this.plan;
    this.fitPlanBounds();
  }

  private fitPlanBounds(): void {
    if (!this.pendingFit || !this.map || !this.bounds?.isValid()) return;
    const size = this.map.getSize();
    if (!size.x || !size.y) return;
    this.map.fitBounds(this.bounds.pad(0.18), { maxZoom: 16, animate: false });
    this.pendingFit = false;
  }

  private safeColor(color: string): string {
    return /^#[\da-f]{6}$/i.test(color) ? color : '#217a54';
  }
}
