import rateLimit from "express-rate-limit";
import User from "../models/user.model.js";

export const attachUser = async (req, res, next) => {
  if (req.user) {
    req._user = req.user;
    req._userChecked = true;
    return next();
  }

  const email = req.body.email;
  if (!email) return next();

  if (!req._userChecked) {
    req._user = await User.findOne({ email }).select("_id email password");
    req._userChecked = true;
  }
  next();
};

export const ipLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, try again later",
  },
});

export const knownEmailLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `email-${req.body.email}`,

  skip: (req) => !req._user || !!req.user,

  message: {
    success: false,
    message: "Too many login attempts for this account",
  },
});

export const unknownEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,

  skip: (req) => !!req._user || !!req.user,

  message: {
    success: false,
    message: "Too many invalid attempts, try later",
  },
});
