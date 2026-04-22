import { Queue } from "bullmq";
import dotenv, { config } from "dotenv";
dotenv.config({
  path: "./.env",
});

export const general = new Queue("general", {
  connection: {
    url: process.env.UPSTASH_REDIS_URL,
  },
});

export const student = new Queue("student", {
  connection: {
    url: process.env.UPSTASH_REDIS_URL,
  },
});

export const payment = new Queue("payment", {
  connection: {
    url: process.env.UPSTASH_REDIS_URL,
  },
});

export const generalNotification = async ({ data, type }) => {
  try {
    const res = await general.add(type.toString(), data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: true,
    });
    return res;
  } catch (error) {
    return null;
  }
};

export const studentNotification = async ({ data, type }) => {
  try {
    const res = await student.add(type.toString(), data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: true,
    });
    return res;
  } catch (error) {
    return null;
  }
};

export const paymentQueue = async ({ data, type }) => {
  try {
    const res = await payment.add(type.toString(), data, {
      delay: 15 * 60 * 1000,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
    return res;
  } catch (error) {
    return null;
  }
};
