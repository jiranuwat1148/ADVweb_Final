import express from "express";
import { customerRouter } from "./controller/customer";
import { orderRouter } from "./controller/orders";
import { authRouter } from "./controller/auth";
import { planRouter } from "./controller/plans";
import { riderRouter } from "./controller/rider";
import { requireOwner } from "./middleware/auth";

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.use("/api/auth/login", authRouter);
app.use("/api/rider/jobs/lookup", riderRouter);
app.use("/api/customers", requireOwner, customerRouter);
app.use("/api/orders", requireOwner, orderRouter);
app.use("/api/plans", requireOwner, planRouter);

app.use((_req, res) => { res.status(404).json({ message: "ไม่พบ API ที่เรียก" }); });
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500;
  if (status === 400 || status === 413) {
    res.status(status).json({ message: status === 413 ? "ข้อมูลที่ส่งมามีขนาดใหญ่เกินไป" : "JSON ที่ส่งมาไม่ถูกต้อง" });
    return;
  }
  console.error("API error", { status: 500 });
  res.status(500).json({ message: "ระบบทำงานไม่สำเร็จ" });
});
