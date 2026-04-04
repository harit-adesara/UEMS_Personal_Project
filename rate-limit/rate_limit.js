import rateLimit from "express-rate-limit";

const ipLimiter = rateLimit({
  windowMs: 2 * 60 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: "Too many request try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const emailLimit = rateLimit({
  windowMs: 1 * 60 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: "Too many login request try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body.email,
});

const resendLimit = rateLimit({
  windowMs: 1 * 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: "Too many email request try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body.email,
});

export { ipLimiter, emailLimit, resendLimit };
