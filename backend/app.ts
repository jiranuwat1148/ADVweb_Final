import express from "express";
import {customerRouter} from "./controller/customer";

export const app = express();

app.use(express.json());
app.use("/api/customers", customerRouter);