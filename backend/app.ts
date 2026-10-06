import express from "express";
import {customerRouter} from "./controller/customer";
import {orderRouter} from "./controller/orders";

export const app = express();

app.use(express.json());
app.use("/api/customers", customerRouter);
app.use("/api/orders", orderRouter);