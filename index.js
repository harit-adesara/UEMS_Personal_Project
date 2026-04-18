import dotenv, { config } from "dotenv";
dotenv.config({
  path: "./.env",
});

const port = process.env.port || 4000;
import { app } from "./app.js";
import { connectDb } from "./db/index.js";
import { startExpireRegistrationsJob } from "./utils/cron.js";

connectDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`app is litening on http://localhost:${port}`);
      startExpireRegistrationsJob();
    });
  })
  .catch(() => {
    console.log("Not connected to DB");
    process.exit(1);
  });
