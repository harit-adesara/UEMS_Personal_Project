import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { User } from "../models/user.js";

/**
 * Attach user (based on email) before rate limiting
 */
export const attachUser = async (req, res, next) => {
  try {
    if (req.user) {
      req._user = req.user;
      req._userChecked = true;
      return next();
    }

    const email = req.body?.email;

    if (!email) {
      req._userChecked = true;
      return next();
    }

    if (!req._userChecked) {
      req._user = await User.findOne({ email }).select("_id email password");
      req._userChecked = true;
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Global IP limiter
 */
export const ipLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => ipKeyGenerator(req),

  message: {
    success: false,
    message: "Too many requests, try again later",
  },
});

/**
 * Known email limiter (valid account)
 */
export const knownEmailLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 min
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => {
    if (!req.body?.email) return ipKeyGenerator(req);
    return `email-${req.body.email}`;
  },

  skip: (req) => !req._user || !!req.user,

  message: {
    success: false,
    message: "Too many login attempts for this account",
  },
});

/**
 * Unknown email limiter (invalid account attempts)
 */
export const unknownEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => ipKeyGenerator(req),

  skip: (req) => !!req._user || !!req.user,

  message: {
    success: false,
    message: "Too many invalid attempts, try later",
  },
});

/**
 * Resend email limiter
 */
export const resendEmailLimiter = rateLimit({
  windowMs: 3 * 60 * 60 * 1000, // 3 hours
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,

  keyGenerator: (req) => ipKeyGenerator(req),

  skip: (req) => !!req.user,

  message: {
    success: false,
    message: "Too many requests for email resend",
  },
});
