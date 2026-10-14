import "dotenv/config";
import { createPool } from "mysql2/promise";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const key of ["DB_HOST", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[key]) {
    throw new Error(`กรุณากรอก ${key} ในไฟล์ .env`);
  }
}

export const conn = createPool({
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT || 19992),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME || "delivery_app",

  waitForConnections: true,
  connectionLimit: 10,

  ssl: {
    ca: readFileSync(
      resolve(process.cwd(), process.env.DB_CA_PATH || "ca.pem"),
      "utf8"
    ),
    rejectUnauthorized: true,
  },
});