import { Component, Input } from "@angular/core";

const ICONS: Record<string, string> = {
  bowl: "M4 10h16l-2 9H6z M7 6h10 M12 2v2",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  box: "m3 7 9-5 9 5v10l-9 5-9-5z m0 0 9 5 9-5 M12 12v10 M7 4.8l9 5",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  bike: "M8 7h5l4 10 M6 17l4-10 M9 3h4 M13 7h5 M9 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M23 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  clock: "M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  arrow: "M5 12h14 m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  plus: "M12 5v14 M5 12h14",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12 M6 18 18 6",
  refresh:
    "M3 11a9 9 0 0 1 15-6l3 3 M21 3v5h-5 M21 13a9 9 0 0 1-15 6l-3-3 M3 21v-5h5",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  search: "M21 21l-4.5-4.5 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0",
  calendar:
    "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  wallet: "M3 6h16v3 M3 6V4h15 M3 6v14h18V9H3 M21 13h-6v4h6",
  route:
    "M6 6v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V6 M9 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  help: "M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  logout: "M9 3H3v18h6 M8 12h13 m-5-5 5 5-5 5",
  edit: "m16 3 5 5-12 12-6 1 1-6z M13 6l5 5",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  phone:
    "m6 3 3 5-2 2a14 14 0 0 0 7 7l2-2 5 3c0 3-2 4-4 3C9 19 5 15 3 7 2 5 3 3 6 3",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  external: "M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7",
  leaf: "M20 3c-9-1-16 3-16 10a7 7 0 0 0 7 7c7 0 10-8 9-17 M3 21 15 9",
  info: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  arrowUp: "m7 14 5-5 5 5 M12 9v10",
  settings:
    "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
};

@Component({
  selector: "app-icon",
  standalone: true,
  template:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path [attr.d]="path"/></svg>',
  styles:
    ":host{display:inline-flex;width:20px;height:20px;flex-shrink:0}svg{width:100%;height:100%}",
})
export class IconComponent {
  @Input() name = "grid";
  get path() {
    return ICONS[this.name] || ICONS["grid"];
  }
}
