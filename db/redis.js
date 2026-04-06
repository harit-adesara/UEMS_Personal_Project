import { Redis } from "@upstash/redis";
import dotenv from "dotenv";

dotenv.config({
  path: "./.env",
});

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export function generateToken() {
  return crypto.randomBytes(6).toString("hex");
}

export async function storeToken(eventId) {
  const token = generateToken();
  await redis.set(`event:${eventId}:token`, token, { ex: 30 });
  return token;
}

export async function getToken(eventId) {
  return await redis.get(`event:${eventId}:token`);
}
