import { Router } from "express";
import { validate } from "../middleware/validate";
import { registerUser, login } from "../controllers/auth";
import {
  ipLimiter,
  attachUser,
  unknownEmailLimiter,
  knownEmailLimiter,
} from "../rate-limit/rate_limit.js";
const router = Router();

router
  .route("/register")
  .post(
    ipLimiter,
    attachUser,
    unknownEmailLimiter,
    knownEmailLimiter,
    register(),
    validate,
    registerUser,
  );
router
  .route("/login")
  .post(
    ipLimiter,
    attachUser,
    unknownEmailLimiter,
    knownEmailLimiter,
    login(),
    validate,
    login,
  );

router.route();
export { router };
