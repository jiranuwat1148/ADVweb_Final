import type { Response } from "express";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function sendApiError(res: Response, error: unknown, fallback: string, context: string): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN";
  // Do not log SQL values or customer details.
  console.error(context, { code });
  if (code === "ER_BAD_FIELD_ERROR" || code === "ER_NO_SUCH_TABLE") {
    res.status(503).json({ message: "โครงสร้างฐานข้อมูลยังไม่พร้อม กรุณารัน npm run db:migrate" });
    return;
  }
  res.status(500).json({ message: fallback });
}
