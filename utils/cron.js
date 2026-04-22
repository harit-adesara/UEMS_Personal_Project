import cron from "node-cron";
import { Registration } from "../models/registration.js";
import mongoose from "mongoose";

export const startExpireRegistrationsJob = () => {
  cron.schedule("0 */6 * * *", async () => {
    const session = await mongoose.startSession();

    try {
      session.startTransaction();

      const expiredRegs = await Registration.find({
        status: "reserved",
        expiresAt: { $lt: new Date() },
      }).session(session);

      if (expiredRegs.length === 0) {
        await session.commitTransaction();
        return;
      }

      for (const reg of expiredRegs) {
        await Event.updateOne(
          { _id: reg.event },
          { $inc: { seatsTaken: -1 } },
          { session },
        );

        await Registration.updateOne(
          { _id: reg._id },
          { status: "expired" },
          { session },
        );
      }

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      console.error("Expire job error:", err);
    } finally {
      session.endSession();
    }
  });
};
