import { Worker } from "bullmq";
import { admin } from "../db/firebase_msg.js";
import { User } from "../models/user.js";
import { Registration } from "../models/registration.js";
import mongoose from "mongoose";
import dotenv, { config } from "dotenv";
dotenv.config({
  path: "./.env",
});

export const generalWorker = new Worker(
  "general",
  async (job) => {
    const { userId, title, body, meta } = job.data;

    if (!userId) return;

    const user = await User.findById(userId).select(
      "fcmToken notificationEnabled",
    );

    if (!user || !user.fcmToken || user.notificationEnabled === false) return;

    try {
      await admin.messaging().send({
        token: user.fcmToken,
        notification: { title, body },
        data: meta,
      });
    } catch (error) {
      if (
        error.code === "messaging/registration-token-not-registered" ||
        error.code === "messaging/invalid-registration-token"
      ) {
        await User.updateOne({ _id: userId }, { $unset: { fcmToken: "" } });
        return;
      }

      throw error;
    }
  },
  {
    connection: {
      url: process.env.UPSTASH_REDIS_URL,
    },
  },
);

export const studentWorker = new Worker(
  "student",
  async (job) => {
    const { parsedTargets, title, body, meta } = job.data;

    if (!parsedTargets?.length) return;

    let userIds = [];

    for (const t of parsedTargets) {
      const orConditions = [];

      for (const b of t.branches || []) {
        const condition = {
          school: t.school,
          branch: b.branch,
        };

        if (b.StudentYear != null) {
          condition.StudentYear = b.StudentYear;
        }

        if (b.divisions?.length) {
          condition.division = { $in: b.divisions };
        }

        orConditions.push(condition);
      }

      if (!orConditions.length) continue;

      const users = await User.find({
        $or: orConditions,
        notificationEnabled: true,
        fcmToken: { $exists: true, $ne: null },
      }).select("_id fcmToken");

      userIds.push(...users);
    }

    const uniqueUsers = new Map();

    for (const u of userIds) {
      uniqueUsers.set(u._id.toString(), u);
    }

    const finalUsers = [...uniqueUsers.values()];

    if (!finalUsers.length) return;

    const tokens = finalUsers.map((u) => u.fcmToken).filter(Boolean);

    if (!tokens.length) return;

    const chunkSize = 500;

    for (let i = 0; i < tokens.length; i += chunkSize) {
      const chunk = tokens.slice(i, i + chunkSize);

      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: chunk,
          notification: { title, body },
          data: meta,
        });

        response.responses.forEach(async (res, idx) => {
          if (!res.success) {
            const err = res.error?.code;

            if (
              err === "messaging/invalid-registration-token" ||
              err === "messaging/registration-token-not-registered"
            ) {
              const user = finalUsers[i + idx];

              if (user?._id) {
                await User.updateOne(
                  { _id: user._id },
                  { $unset: { fcmToken: "" } },
                );
              }
            }
          }
        });
      } catch (error) {
        throw error;
      }
    }
  },
  {
    connection: {
      url: process.env.UPSTASH_REDIS_URL,
    },
  },
);

export const paymentWorker = new Worker(
  "payment",
  async (job) => {
    const { registerId } = job.data;

    if (!registerId) return;

    const session = await mongoose.startSession();

    try {
      await session.startTransaction();

      const registration =
        await Registration.findById(registerId).session(session);

      if (
        !registration ||
        registration.paid ||
        registration.status !== "reserved"
      ) {
        await session.abortTransaction();
        return;
      }

      await Event.updateOne(
        { _id: registration.event },
        { $inc: { seatTaken: -1 } },
        { session },
      );

      registration.status = "expired";
      await registration.save({ session });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  },
  {
    connection: {
      url: process.env.UPSTASH_REDIS_URL,
    },
  },
);
