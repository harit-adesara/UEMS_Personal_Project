import cron from "node-cron";
import { Registration } from "../models/registration.js";

export const startExpireRegistrationsJob = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      const result = await Registration.updateMany(
        {
          status: "reserved",
          expiresAt: { $lt: now },
        },
        {
          $set: { status: "expired" },
        },
      );
    } catch (error) {
      throw new ApiError(404, "Error in cron");
    }
  });
};
