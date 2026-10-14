export function isDeliveryDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1000-01-01" || value > "9999-12-31") return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 4294967295 ? id : null;
}

export function todayInBangkok(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// Return a MySQL Bangkok-local DATETIME string; elapsed is after 11:30.
export function deliveryTime(date: string, elapsedMinutes: number): string {
  const start = new Date(`${date}T11:30:00+07:00`);
  const end = new Date(start.getTime() + Math.ceil(elapsedMinutes * 60) * 1000);
  const local = new Date(end.getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 19).replace("T", " ");
}
