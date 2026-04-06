import express from "express";
const app = express();
import cookieParser from "cookie-parser";
import { router } from "./routes/routes.js";
import cors from "cors";
import { ipLimiter } from "./rate-limit/rate_limit.js";

app.use(
  cors({
    origin: process.env.cors?.split(",") || "https://localhost:3000",
    credentials: true,
    method: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-type", "Authorization"],
  }),
);

app.use(ipLimiter);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  }),
);

app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("UEMS Personal Project");
});

app.use("/uems/personal", router);

export { app };
