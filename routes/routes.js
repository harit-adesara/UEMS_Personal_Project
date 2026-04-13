import express from "express";

import { validate } from "../middleware/validate.js";

import { chatBot } from "../ai/ai.js";

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

router.route("/event/modify-before-approve/:eventId").post(
  verifyJWT,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "epsFile", maxCount: 1 },
  ]),
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

router.route("/event/club/create").post(
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  verifyJWT,
  createEventValidator(),
  createEventClub,
);

router.route("/event/director/create").post(
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  verifyJWT,
  createEventValidator(),
  createEventDirector,
);

router.route("/event/faculty/create").post(
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  verifyJWT,
  createEventValidator(),
  createEventFaculty,
);

router.route("/event/hod/create").post(
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  verifyJWT,
  createEventValidator(),
  createEventHoD,
); // complete

router.route("/event/dean/create").post(
  upload.fields([
    { name: "epsFile", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  verifyJWT,
  createEventValidator(),
  createEventDean,
);
// ------------------- ADMIN -------------------

// User
router.route("/user/create").post(verifyJWT, createUserValidator(), createUser);

router.route("/user/modify").put(modifyUserValidator(), modifyUser);

router.route("/user/delete/:userId").delete(deleteUser);

router.route("/user/get").post(getUser);

router.route("/event").get(getEvent);

router.route("/event/approve/:eventId").put(eventStatusApprove);

router.put("/event/reject/:eventId", eventStatusReject);

router.put("/event/modify", modifyEventValidator, modifyEvent);

router.route("/branch/create").post(createBranch);

router.route("/branch/modify").put(modifyBranch);

router.route("/branch/delete/:branchId").delete(deleteBranch);

router.route("/school/create").post(createSchool);

router.route("/school/modify").put(modifySchool);

router.route("/school/delete/:schoolId").delete(deleteSchool);

router.route("/division/create").post(createDivision);

router.route("/division/modify").put(modifyDivision);

router.route("/division/delete/:divisionId").delete(deleteDivision);

import {
  addFeedback,
  markAttendanceQR,
  registerInEvent,
  eventListStudent,
  viewEventDetail,
  myRegisteredEvent,
  getStudentAttendance,
} from "../controllers/student.js";

router.route("/feedback").post(verifyJWT, addFeedback);

router.route("/attendance/qr").post(verifyJWT, markAttendanceQR);

router.route("/event/register/:eventId").post(verifyJWT, registerInEvent);

router.route("/events/student").get(verifyJWT, eventListStudent);

router.route("/event/:eventId").get(verifyJWT, viewEventDetail);

router.route("/my-events").get(verifyJWT, myRegisteredEvent);

router.route("/attendance/:studentId").get(verifyJWT, getStudentAttendance);

import { verifyPayment } from "../controllers/verify_payment.js";

router.route("/payment/verify").post(verifyJWT, verifyPayment);

// AI

router.route("/chat").post(verifyJWT, chatBot);

export { router };
