import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import * as L from "leaflet";
import { Customer, Job, SHOP } from "./models";

interface SchematicPoint {
  x: number;
  y: number;
}
interface SchematicRoute {
  job: Job;
  points: string;
  stops: { x: number; y: number; sequence: number; name: string }[];
}

@Component({
  selector: "app-route-map",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-shell">
      <svg
        class="schematic-map"
        [attr.viewBox]="schematicViewBox"
        preserveAspectRatio="xMidYMid slice"
        aria-label="แผนที่เส้นทางจัดส่งจำลอง"
      >
        <defs>
          <pattern
            id="map-blocks"
            width="130"
            height="110"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-14)"
          >
            <rect width="130" height="110" fill="#f3f1e9" />
            <rect x="12" y="12" width="105" height="85" rx="8" fill="#e9e7dc" />
            <rect x="24" y="25" width="35" height="23" rx="3" fill="#dedfd5" />
            <rect x="70" y="57" width="30" height="25" rx="3" fill="#e1e0d5" />
          </pattern>
          <filter
            id="marker-shadow"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity=".15" />
          </filter>
        </defs>
        <rect width="1000" height="720" fill="url(#map-blocks)" />
        <path
          d="M-40 90 C140 40 255 75 305 210 S350 300 490 284 L540 70 L675 78 L704 303 C665 406 540 433 437 386 L356 458 L242 389 L232 225 L-40 213Z"
          fill="#dbe6d5"
        />
        <path
          d="M735 513 L836 425 L1030 449 L1030 730 L782 730Z"
          fill="#dbe6d5"
        />
        <path
          d="M905 -50 C855 157 976 270 863 383 S758 553 880 766"
          fill="none"
          stroke="#d2e6e7"
          stroke-width="35"
        />
        <g fill="none" stroke-linecap="round">
          <path
            d="M-40 592 L1040 325 M154 -70 L455 760 M710 -60 L503 780"
            stroke="#e4deca"
            stroke-width="21"
          />
          <path
            d="M-40 592 L1040 325 M154 -70 L455 760 M710 -60 L503 780"
            stroke="#fffdf7"
            stroke-width="14"
          />
          <path
            d="M-20 339 L1020 76 M-30 115 L1010 590 M155 0 L-10 720 M775 0 L949 740"
            stroke="#fffdf8"
            stroke-width="9"
          />
          <path
            d="M-40 592 L1040 325 M154 -70 L455 760"
            stroke="#d9d4bf"
            stroke-width="1"
            stroke-dasharray="9 12"
          />
        </g>
        <g class="place-labels" fill="#8b9684" text-anchor="middle">
          <text x="254" y="153">มหาวิทยาลัยมหาสารคาม</text>
          <text x="555" y="230">เขตขามเรียง</text>
          <text x="837" y="595">สวนสาธารณะ</text>
          <text x="717" y="105" fill="#a3a08f">ถนนท่าขอนยาง</text>
        </g>
        <g *ngFor="let route of schematicRoutes">
          <polyline
            [attr.points]="route.points"
            fill="none"
            stroke="white"
            [attr.stroke-width]="selectedJobId === route.job.id ? 11 : 8"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          <polyline
            [attr.points]="route.points"
            fill="none"
            [attr.stroke]="route.job.color"
            [attr.stroke-width]="selectedJobId === route.job.id ? 6 : 4"
            [attr.opacity]="
              selectedJobId && selectedJobId !== route.job.id ? 0.65 : 0.9
            "
            stroke-linejoin="round"
            stroke-linecap="round"
            class="schematic-route"
            (click)="chooseJob(route.job.id)"
          />
          <g
            *ngFor="let stop of route.stops"
            class="schematic-stop"
            [attr.transform]="'translate(' + stop.x + ',' + stop.y + ')'"
            tabindex="0"
            role="button"
            [attr.aria-label]="'จุดส่งที่ ' + stop.sequence + ' ' + stop.name"
            (click)="chooseJob(route.job.id)"
            (keydown.enter)="chooseJob(route.job.id)"
          >
            <title>{{ stop.name }}</title>
            <circle r="14.5" fill="white" filter="url(#marker-shadow)" />
            <circle r="11.5" [attr.fill]="route.job.color" />
            <text
              y="4"
              text-anchor="middle"
              fill="white"
              font-size="11"
              font-weight="700"
            >
              {{ stop.sequence }}
            </text>
          </g>
        </g>
        <g
          [attr.transform]="
            'translate(' + schematicShop.x + ',' + schematicShop.y + ')'
          "
        >
          <circle r="20" fill="white" filter="url(#marker-shadow)" />
          <circle r="16" fill="#243d35" />
          <path
            d="M-10 -4 L10 -4 L8 -11 L-8 -11 Z M-8 -2 V10 H8 V-2 M-3 10 V3 H3 V10"
            stroke="white"
            stroke-width="2"
            fill="none"
            stroke-linejoin="round"
          />
        </g>
        <g
          *ngIf="schematicFocus"
          [attr.transform]="
            'translate(' + schematicFocus.x + ',' + schematicFocus.y + ')'
          "
        >
          <circle
            r="23"
            fill="#b77641"
            fill-opacity=".13"
            stroke="#b77641"
            stroke-width="2"
          />
          <circle r="7" fill="#b77641" stroke="white" stroke-width="3" />
        </g>
      </svg>

      <div
        #map
        class="leaflet-map"
        [class.tiles-visible]="tilesReady"
        aria-label="แผนที่จัดเส้นทาง"
        [attr.aria-hidden]="!tilesReady"
      ></div>

      <div *ngIf="showLocation" class="map-location">
        <span class="location-dot"></span>
        <div>
          <strong>รอบมหาวิทยาลัยมหาสารคาม</strong
          ><span>พื้นที่จัดส่ง · รัศมีประมาณ 3 กม.</span>
        </div>
      </div>

      <div class="map-controls">
        <button
          type="button"
          (click)="fitAll()"
          title="แสดงทุกเส้นทาง"
          aria-label="แสดงทุกเส้นทาง"
          class="fit-button"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
          >
            <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
        <div class="zoom-buttons">
          <button type="button" (click)="zoomIn()" aria-label="ขยายแผนที่">
            +</button
          ><button type="button" (click)="zoomOut()" aria-label="ย่อแผนที่">
            −
          </button>
        </div>
      </div>

      <div *ngIf="focusCustomer" class="focus-card">
        <span class="focus-dot"></span><strong>{{ focusCustomer.name }}</strong
        ><span>ตำแหน่งลูกค้า</span>
      </div>

      <div class="map-footer">
        <span><i></i> เส้นทางจำลอง · ระยะทางประมาณ</span
        ><span *ngIf="!tilesReady" class="offline-note"
          >แผนที่แสดงภาพจำลอง</span
        >
      </div>
    </div>
  `,
  styleUrl: "./route-map.component.css",
})
export class RouteMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() jobs: Job[] = [];
  @Input() selectedJobId: string | null = null;
  @Input() focusCustomer: Customer | null = null;
  @Input() showLocation = true;
  @Output() selectedJobIdChange = new EventEmitter<string>();
  @ViewChild("map", { static: true })
  private mapElement!: ElementRef<HTMLDivElement>;

  tilesReady = false;
  schematicRoutes: SchematicRoute[] = [];
  schematicShop: SchematicPoint = { x: 500, y: 360 };
  schematicFocus: SchematicPoint | null = null;
  private schematicZoom = 1;
  private map?: L.Map;
  private routeGroup?: L.FeatureGroup;
  private focusLayer?: L.CircleMarker;
  private routeLines = new Map<string, L.Polyline>();
  private routeBounds?: L.LatLngBounds;
  private resizeObserver?: ResizeObserver;

  constructor(
    private zone: NgZone,
    private changeDetector: ChangeDetectorRef,
  ) {}

  ngAfterViewInit(): void {
    this.updateSchematic();
    this.zone.runOutsideAngular(() => {
      this.map = L.map(this.mapElement.nativeElement, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 12,
        maxZoom: 19,
      }).setView([SHOP.lat, SHOP.lng], 15);
      L.control
        .attribution({ position: "bottomright", prefix: false })
        .addTo(this.map);
      const tiles = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
        },
      );
      tiles.on("tileload", () =>
        this.zone.run(() => {
          if (!this.tilesReady) {
            this.tilesReady = true;
            this.changeDetector.markForCheck();
          }
        }),
      );
      tiles.addTo(this.map);
      this.renderRoutes();
      this.renderFocus();
      this.resizeObserver = new ResizeObserver(() =>
        this.map?.invalidateSize({ pan: false }),
      );
      this.resizeObserver.observe(this.mapElement.nativeElement);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["jobs"] || changes["focusCustomer"]) this.updateSchematic();
    if (!this.map) return;
    if (changes["jobs"]) this.renderRoutes();
    else if (changes["selectedJobId"]) this.styleRoutes();
    if (changes["focusCustomer"] || changes["jobs"]) this.renderFocus();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
    this.map = undefined;
  }

  fitAll(): void {
    this.schematicZoom = 1;
    if (!this.map) return;
    this.map.invalidateSize({ pan: false });
    if (this.routeBounds?.isValid())
      this.map.fitBounds(this.routeBounds, {
        paddingTopLeft: [30, 75],
        paddingBottomRight: [30, 35],
        maxZoom: 16,
      });
    else this.map.setView([SHOP.lat, SHOP.lng], 15);
  }

  get schematicViewBox(): string {
    const width = 1000 / this.schematicZoom,
      height = 720 / this.schematicZoom;
    return `${500 - width / 2} ${360 - height / 2} ${width} ${height}`;
  }

  zoomIn(): void {
    if (!this.tilesReady)
      this.schematicZoom = Math.min(3, this.schematicZoom * 1.25);
    this.map?.zoomIn();
  }
  zoomOut(): void {
    if (!this.tilesReady)
      this.schematicZoom = Math.max(0.8, this.schematicZoom / 1.25);
    this.map?.zoomOut();
  }

  chooseJob(id: string): void {
    this.zone.run(() => {
      this.selectedJobId = id;
      this.styleRoutes();
      this.selectedJobIdChange.emit(id);
      this.changeDetector.markForCheck();
    });
  }

  private renderRoutes(): void {
    if (!this.map) return;
    this.routeGroup?.remove();
    this.routeLines.clear();
    this.routeGroup = L.featureGroup().addTo(this.map);
    this.routeBounds = L.latLngBounds([[SHOP.lat, SHOP.lng]]);
    for (const job of this.jobs) {
      const path = job.path.length
        ? job.path
        : ([
            [SHOP.lat, SHOP.lng],
            ...job.stops.map((stop) => [stop.customer.lat, stop.customer.lng]),
          ] as [number, number][]);
      const line = L.polyline(path, {
        color: job.color,
        weight: 4,
        opacity: 0.85,
        lineJoin: "round",
        lineCap: "round",
      }).addTo(this.routeGroup);
      line.on("click", () => this.chooseJob(job.id));
      this.routeLines.set(job.id, line);
      path.forEach((point) => this.routeBounds?.extend(point));
      for (const stop of job.stops) {
        const sequence = Number.isFinite(stop.sequence)
          ? Math.trunc(stop.sequence)
          : 0;
        // Only validated color values and numeric labels are inserted into marker HTML.
        const color = /^#[0-9a-f]{3,8}$/i.test(job.color)
          ? job.color
          : "#435d52";
        const icon = L.divIcon({
          className: "delivery-marker",
          html: `<span style="background:${color}">${sequence}</span>`,
          iconSize: [29, 29],
          iconAnchor: [14.5, 14.5],
        });
        const marker = L.marker([stop.customer.lat, stop.customer.lng], {
          icon,
          title: stop.customer.name,
          keyboard: true,
        }).addTo(this.routeGroup);
        marker.on("click", () => this.chooseJob(job.id));
        this.routeBounds.extend([stop.customer.lat, stop.customer.lng]);
      }
    }
    const shopIcon = L.divIcon({
      className: "shop-marker",
      html: '<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 10h18l-2-6H5l-2 6ZM5 12v9h14v-9M9 21v-6h6v6"/></svg></span>',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
    L.marker([SHOP.lat, SHOP.lng], { icon: shopIcon, title: SHOP.name }).addTo(
      this.routeGroup,
    );
    this.styleRoutes();
    this.fitAll();
  }

  private styleRoutes(): void {
    for (const [id, line] of this.routeLines) {
      const selected = id === this.selectedJobId;
      line.setStyle({
        weight: selected ? 6 : 4,
        opacity: this.selectedJobId && !selected ? 0.65 : 0.9,
      });
      if (selected) line.bringToFront();
    }
  }

  private renderFocus(): void {
    if (!this.map) return;
    this.focusLayer?.remove();
    if (!this.focusCustomer) {
      this.focusLayer = undefined;
      return;
    }
    const position: [number, number] = [
      this.focusCustomer.lat,
      this.focusCustomer.lng,
    ];
    this.focusLayer = L.circleMarker(position, {
      radius: 12,
      color: "#b77641",
      weight: 3,
      fillColor: "#b77641",
      fillOpacity: 0.18,
    }).addTo(this.map);
    this.map.setView(position, 16);
  }

  private updateSchematic(): void {
    const positions: [number, number][] = [[SHOP.lat, SHOP.lng]];
    for (const job of this.jobs) {
      positions.push(...job.path);
      for (const stop of job.stops)
        positions.push([stop.customer.lat, stop.customer.lng]);
    }
    if (this.focusCustomer)
      positions.push([this.focusCustomer.lat, this.focusCustomer.lng]);
    const latitudes = positions.map((p) => p[0]);
    const longitudes = positions.map((p) => p[1]);
    const minLat = Math.min(...latitudes),
      maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes),
      maxLng = Math.max(...longitudes);
    const midLat = (minLat + maxLat) / 2,
      midLng = (minLng + maxLng) / 2;
    const spanLat = Math.max(maxLat - minLat, 0.017),
      spanLng = Math.max(maxLng - minLng, 0.023);
    const project = (lat: number, lng: number): SchematicPoint => ({
      x: 500 + ((lng - midLng) / spanLng) * 730,
      y: 385 - ((lat - midLat) / spanLat) * 490,
    });
    this.schematicShop = project(SHOP.lat, SHOP.lng);
    this.schematicFocus = this.focusCustomer
      ? project(this.focusCustomer.lat, this.focusCustomer.lng)
      : null;
    this.schematicRoutes = this.jobs.map((job) => {
      const path: [number, number][] = job.path.length
        ? job.path
        : [
            [SHOP.lat, SHOP.lng],
            ...job.stops.map(
              (stop) =>
                [stop.customer.lat, stop.customer.lng] as [number, number],
            ),
          ];
      return {
        job,
        points: path
          .map(([lat, lng]) => {
            const point = project(lat, lng);
            return `${point.x},${point.y}`;
          })
          .join(" "),
        stops: job.stops.map((stop) => ({
          ...project(stop.customer.lat, stop.customer.lng),
          sequence: stop.sequence,
          name: stop.customer.name,
        })),
      };
    });
  }
}
