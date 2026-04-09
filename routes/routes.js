import express from "express";

import { validate } from "../middleware/validate.js";

import {
  attachUser,
  knownEmailLimiter,
  unknownEmailLimiter,
  resendEmailLimiter,
} from "../rate-limit/rate_limit.js";

import {
  registerval,
  loginval,
  createUserValidator,
  modifyUserValidator,
  modifyEventValidator,
  createEventValidator,
  modifyEventBeforeApproveValidator,
  modifyEventAfterApproveValidator,
} from "../validator/index.js";

import {
  createUser,
  modifyUser,
  deleteUser,
  getUser,
  getEvent,
  eventStatusApprove,
  eventStatusReject,
  createBranch,
  createSchool,
  createDivision,
  modifyBranch,
  modifySchool,
  modifyDivision,
  deleteBranch,
  deleteDivision,
  deleteSchool,
  modifyEvent,
} from "../controllers/function.js";

import {
  login,
  logOut,
  registerUser,
  getCurrentUser,
  refreshAccessToken,
  forgotPasswordRequest,
  resetForgetPassword,
  changePassword,
  resendCreateUserMail,
} from "../controllers/auth.js";

import { verifyJWT } from "../middleware/verifyJwt.js";

import {
  modifyEventBeforeApproveCommon,
  modifyEventAfterApproveCommon,
  deleteEventCommon,
  getEventCommon,
  myEvent,
  getEventFeedbackCommon,
  getEventApprovalOrReject,
  eventStatusApproveCommon,
  eventStatusRejectCommon,
  startAttendance,
  getCurrentToken,
  manualMarkAttendance,
  getRegisteredStudents,
  getStudentAttendanceList,
} from "../controllers/common.js";

const router = express.Router();

router
  .route("/login")
  .post(
    attachUser,
    unknownEmailLimiter,
    knownEmailLimiter,
    loginval(),
    validate,
    login,
  ); //complete

router
  .route("/forgot-password")
  .post(
    attachUser,
    unknownEmailLimiter,
    knownEmailLimiter,
    forgotPasswordRequest,
  );

router.route("/reset-password/:resetToken").post(resetForgetPassword);

router
  .route("/resend-invite")
  .post(attachUser, resendEmailLimiter, resendCreateUserMail); //complete

router.route("/register/:unHashedToken").post(registerval(), registerUser); // complete

router.route("/refresh-token").post(refreshAccessToken);

router.route("/me").get(verifyJWT, getCurrentUser); // complete

router.route("/logout").post(verifyJWT, logOut); // complete

router.route("/change-password").post(verifyJWT, changePassword); //complete

router
  .route("/event/modify-before-approve/:eventId")
  .post(
    verifyJWT,
    modifyEventBeforeApproveValidator(),
    modifyEventBeforeApproveCommon,
  );

router
  .route("/event/modify-after-approve/:eventId")
  .post(
    verifyJWT,
    modifyEventAfterApproveValidator(),
    modifyEventAfterApproveCommon,
  );

router.route("/event/delete/:eventId").post(verifyJWT, deleteEventCommon);

router.route("/events").get(verifyJWT, getEventCommon);

router.route("/my-events").get(verifyJWT, myEvent);

router.route("/event/feedback/:eventId").get(verifyJWT, getEventFeedbackCommon);

router
  .route("/events/approval-or-reject")
  .get(verifyJWT, getEventApprovalOrReject);

router
  .route("/event/approve/:eventId")
  .post(verifyJWT, eventStatusApproveCommon);

router.route("/event/reject/:eventId").post(verifyJWT, eventStatusRejectCommon);

router.route("/attendance/start").post(verifyJWT, startAttendance);

router.route("/attendance/token").get(verifyJWT, getCurrentToken);

router.route("/attendance/manual-mark").post(verifyJWT, manualMarkAttendance);

router.route("/registrations/:eventId").get(verifyJWT, getRegisteredStudents);

router
  .route("/attendance/list/:eventId")
  .get(verifyJWT, getStudentAttendanceList);

import {
  createEventFaculty,
  createEventHoD,
  createEventDean,
  createEventDirector,
  createEventClub,
} from "../controllers/function.js";

import { upload } from "../db/multer.js";

router.post(
  "/event/club/create",
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  verifyJWT,
  createEventValidator(),
  createEventClub,
);

router.post(
  "/event/director/create",
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  createEventValidator(),
  createEventDirector,
);

router.post(
  "/event/faculty/create",
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  createEventValidator(),
  createEventFaculty,
);

router.post(
  "/event/hod/create",
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  verifyJWT,
  createEventValidator(),
  createEventHoD,
); // complete

router.post(
  "/event/dean/create",
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  createEventValidator(),
  createEventDean,
);
// ------------------- ADMIN -------------------

// User
router.post("/user/create", verifyJWT, createUserValidator(), createUser);

router.put("/user/modify", modifyUserValidator(), modifyUser);

router.delete("/user/delete/:userId", deleteUser);

router.post("/user/get", getUser);

router.get("/event", getEvent);

router.put("/event/approve/:eventId", eventStatusApprove);

router.put("/event/reject/:eventId", eventStatusReject);

router.put("/event/modify", modifyEventValidator, modifyEvent);

router.post("/branch/create", createBranch);

router.put("/branch/modify", modifyBranch);

router.delete("/branch/delete/:branchId", deleteBranch);

router.post("/school/create", createSchool);

router.put("/school/modify", modifySchool);

router.delete("/school/delete/:schoolId", deleteSchool);

router.post("/division/create", createDivision);

router.put("/division/modify", modifyDivision);

router.delete("/division/delete/:divisionId", deleteDivision);

import {
  addFeedback,
  markAttendanceQR,
  registerInEvent,
  eventListStudent,
  viewEventDetail,
  myRegisteredEvent,
  getStudentAttendance,
} from "../controllers/student.js";

router.post("/feedback", verifyJWT, addFeedback);

router.post("/attendance/qr", verifyJWT, markAttendanceQR);

router.post("/event/register/:eventId", verifyJWT, registerInEvent);

router.get("/events", verifyJWT, eventListStudent);

router.get("/event/:eventId", verifyJWT, viewEventDetail);

router.get("/my-events", verifyJWT, myRegisteredEvent);

router.get("/attendance/:studentId", verifyJWT, getStudentAttendance);

import { verifyPayment } from "../controllers/verify_payment.js";

router.post("/payment/verify", verifyJWT, verifyPayment);

export { router };
