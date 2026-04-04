import { ApiResponse } from "../utils/api_response.js";
import { ApiError } from "../utils/api_error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.js";
import { Event } from "../models/event.js";
import { Branch } from "../models/branch.js";
import { School } from "../models/school.js";
import { Event } from "../models/event.js";
import { Feedback } from "../models/feedback.js";
import { Division } from "../models/division.js";
import { registerEmail, sendEmail } from "../utils/mail.js";
import { redis, storeToken, getToken } from "../db/redis.js";
import { Attendance } from "../models/attendance.js";
import { determineEventLevel } from "./function.js";
import { Registration } from "../models/registration.js";
import {
  validateSchool,
  validateBranch,
  validateDivision,
} from "./function.js";

const deleteFromCloudinary = async (public_id, type) => {
  if (!public_id) return;

  const resource_type = type === "pdf" ? "raw" : "image";

  await cloudinary.uploader.destroy(public_id, { resource_type });
};

const modifyEventBeforeApproveCommon = asyncHandler(async (req, res) => {
  if (!["Faculty", "HoD", "Dean", "Director", "Club"].includes(req.user.role)) {
    throw new ApiError(403, "Unauthorized user");
  }

  const { eventId } = req.params;
  const updates = req.body;

  const event = await Event.findById(eventId);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  if (event.organizedBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only modify your own event");
  }

  if (event.status !== "Pending") {
    throw new ApiError(400, "Approved events cannot be modified");
  }

  if (updates.name) {
    const year = updates.startTime
      ? new Date(updates.startTime).getFullYear()
      : event.startTime.getFullYear();

    const name = updates.name || event.name;

    const existing = await Event.findOne({ name, year });

    if (existing && existing._id.toString() !== eventId) {
      throw new ApiError(
        400,
        `Event "${name}" already exists for year ${year}`,
      );
    }
  }

  let level = "";
  let status = "";

  if (updates.targets) {
    const parsedTargets = JSON.parse(updates.targets);

    for (const t of parsedTargets) {
      await validateSchool(t.school);

      for (const b of t.branches) {
        if (b.StudentYear != null && (b.StudentYear < 1 || b.StudentYear > 5)) {
          throw new ApiError(400, "Invalid StudentYear");
        }

        await validateBranch(b.branch, t.school);

        if (b.divisions?.length) {
          for (const d of b.divisions) {
            await validateDivision(d, b.branch);
          }
        }
      }
    }

    ({ level, status } = await determineEventLevel(parsedTargets));

    if (req.user.role === "Faculty" && level === "Division")
      status = "Approved";

    if (req.user.role === "HoD" && ["Division", "School"].includes(level))
      status = "Approved";

    if (
      req.user.role === "Dean" &&
      ["Division", "School", "College"].includes(level)
    )
      status = "Approved";

    if (req.user.role === "Club" && level === "Division") {
      status = "Pending";
      throw new ApiError(404, "Club can not create division level event");
    }

    updates.targets = parsedTargets;
  }

  const allowedFields = [
    "name",
    "detail",
    "targets",
    "startTime",
    "endTime",
    "registrationDeadline",
    "venue",
    "amount",
  ];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Field '${key}' cannot be updated`);
    }
  }

  const startTime = updates.startTime
    ? new Date(updates.startTime)
    : event.startTime;

  const endTime = updates.endTime ? new Date(updates.endTime) : event.endTime;

  const registrationDeadline = updates.registrationDeadline
    ? new Date(updates.registrationDeadline)
    : event.registrationDeadline;

  if (endTime && startTime && endTime < startTime) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (registrationDeadline && startTime && registrationDeadline > startTime) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      event[key] = updates[key];
    }
  }

  const photoFile = req.files?.photo?.[0];
  const epsFile = req.files?.eps?.[0];

  if (photoFile) {
    const uploadedPhoto = await uploadToCloudinary(
      photoFile,
      "events/photo",
      "image",
    );

    if (event.photo?.public_id) {
      await deleteFromCloudinary(event.photo.public_id, "image");
    }

    event.photo = uploadedPhoto;
  }

  if (epsFile) {
    const uploadedEps = await uploadToCloudinary(epsFile, "events/eps", "pdf");

    if (event.eps?.public_id) {
      await deleteFromCloudinary(event.eps.public_id, "pdf");
    }

    event.eps = uploadedEps;
  }

  if (level) event.level = level;
  if (status) event.status = status;

  await event.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { event }, "Event modified successfully"));
});

const modifyEventAfterApproveCommon = asyncHandler(async (req, res) => {
  if (!["Faculty", "HoD", "Dean", "Director", "Club"].includes(req.user.role)) {
    throw new ApiError(403, "Unauthorized user");
  }

  const { eventId } = req.params;
  const updates = req.body;

  const event = await Event.findById(eventId);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  if (event.organizedBy.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only modify your own event");
  }

  if (event.status !== "Approved") {
    throw new ApiError(400, "Rejected events cannot be modified");
  }

  const allowedFields = [
    "detail",
    "startTime",
    "endTime",
    "registrationDeadline",
    "venue",
  ];

  for (const key of Object.keys(updates)) {
    if (!allowedFields.includes(key)) {
      throw new ApiError(400, `Field '${key}' cannot be updated`);
    }
  }

  const startTime = updates.startTime
    ? new Date(updates.startTime)
    : event.startTime;

  const endTime = updates.endTime ? new Date(updates.endTime) : event.endTime;

  const registrationDeadline = updates.registrationDeadline
    ? new Date(updates.registrationDeadline)
    : event.registrationDeadline;

  if (endTime && startTime && endTime < startTime) {
    throw new ApiError(400, "End time must be after start time");
  }

  if (registrationDeadline && startTime && registrationDeadline > startTime) {
    throw new ApiError(400, "Registration deadline must be before start time");
  }

  for (const key of Object.keys(updates)) {
    event[key] = updates[key];
  }

  await event.save();

  res
    .status(200)
    .json(new ApiResponse(200, { event }, "Event modified successfully"));
});

const deleteEventCommon = asyncHandler(async (req, res) => {
  if (!["Faculty", "HoD", "Dean", "Director", "Club"].includes(req.user.role)) {
    throw new ApiError(404, "Unauthorized user");
  }
  const { eventId } = req.params;

  if (!eventId) {
    throw new ApiError(404, "Event ID not present");
  }

  const event = await Event.findById(eventId);

  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  if (event.organizedBy.toString() !== req.user._id.toString()) {
    throw new ApiError(404, "Only owner of this event can delete it");
  }

  if (event.status !== "Pending") {
    throw new ApiError(404, "Only pending event can be deleted");
  }

  await event.deleteOne();

  res.status(200).json(new ApiResponse(200, {}, "Event deleted successfully"));
});

const getEventCommon = asyncHandler(async (req, res) => {
  if (!["Faculty", "HoD", "Dean", "Director", "Club"].includes(req.user.role)) {
    throw new ApiError(404, "Unauthorized user");
  }

  let filter = {};
  if (req.query.date) {
    const start = new Date(req.query.date);
    const end = new Date(req.query.date);
    end.setHours(23, 59, 59, 999);

    filter.startTime = {
      $gte: start,
      $lte: end,
    };
  } else {
    filter.startTime = { $gte: new Date() };
  }
  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.organizedBy) {
    filter.organizedBy = req.query.organizedBy;
  }
  if (req.query.name) {
    filter.name = req.query.name;
  }
  const events = await Event.find(filter).sort({ startTime: -1 });
  if (events.length === 0) {
    throw new ApiError(404, "Events not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { events }, "Event fetched successfully"));
});

const myEvent = asyncHandler(async (req, res) => {
  try {
    if (
      !["Faculty", "HoD", "Dean", "Director", "Club"].includes(req.user.role)
    ) {
      throw new ApiError(404, "Unauthorized user");
    }

    const id = req.user._id;
    if (!id) {
      throw new ApiError(404, "Error not found");
    }

    let filter = {
      organizedBy: id,
    };

    if (req.query.date) {
      const start = new Date(req.query.date);
      const end = new Date(req.query.date);
      end.setHours(23, 59, 59, 999);

      filter.startTime = {
        $gte: start,
        $lte: end,
      };
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.name) {
      filter.name = req.query.name;
    }

    const event = await Event.find(filter).sort({ startTime: -1 });
    if (!event.length) {
      throw new ApiError(404, "Event not found");
    }
    return res
      .status(200)
      .json(new ApiResponse(200, { event }, "Event fetched successfully"));
  } catch (error) {
    throw new ApiError(404, "Something went wrong while fetching event");
  }
});

const getEventFeedbackCommon = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  const feedback = await Feedback.findOne({ event: eventId })
    .select("feedbacks event")
    .populate("feedbacks.user", "name email")
    .populate("event", "name organizedBy");

  if (!feedback) {
    return res.status(404).json({
      success: false,
      message: "No feedback found",
    });
  }

  if (
    req.user.role !== "Admin" &&
    feedback.event.organizedBy.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(404, "Unauthorized user");
  }

  res.status(200).json({
    success: true,
    event: feedback.event,
    count: feedback.feedbacks.length,
    data: feedback.feedbacks,
  });
});

const getEventApprovalOrReject = asyncHandler(async (req, res) => {
  if (
    req.user.role !== "HoD" ||
    req.user.role !== "Dean" ||
    req.user.role !== "Director"
  ) {
    throw new ApiError(404, "Unauthorized user");
  }

  let filter = {};
  if (req.user.role === "HoD") {
    filter.level = "Branch";
  } else if (req.user.role === "Dean") {
    filter.level = "School";
  } else if (req.user.role === "Director") {
    filter.level = "College";
  }
  if (req.query.date) {
    const start = new Date(req.query.date);
    const end = new Date(req.query.date);
    end.setHours(23, 59, 59, 999);

    filter.startTime = {
      $gte: start,
      $lte: end,
    };
  } else {
    filter.startTime = { $gte: new Date() };
  }
  if (req.query.organizedBy) {
    filter.organizedBy = req.query.organizedBy;
  }
  if (req.query.name) {
    filter.name = req.query.name;
  }
  const events = await Event.find(filter).sort({ startTime: -1 });
  if (events.length === 0) {
    throw new ApiError(404, "Events not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { events }, "Event fetched successfully"));
});

const eventStatusApprove = asyncHandler(async (req, res) => {
  try {
    if (
      req.user.role !== "HoD" ||
      req.user.role !== "Dean" ||
      req.user.role !== "Director"
    ) {
      throw new ApiError(404, "Unauthorized user");
    }
    const { eventId } = req.params;
    const { reason } = req.body;
    if (!eventId) {
      throw new ApiError(404, "Error while selecting event");
    }
    const event = await Event.findById(eventId);
    if (!event) {
      throw new ApiError(404, "Event not found");
    }
    if (event.status === "Approved" || event.status === "Rejected") {
      throw new ApiError(404, "You can not modify event");
    }
    event.status = "Approved";
    event.approvalHistory.push({
      user: req.user._id,
      role: req.user.role,
      status: "Approved",
      reason: reason || "Not mentioned",
      timestamp: new Date(),
    });
    await event.save();
    return res.status(200).json(200, "Event accepted");
  } catch (error) {
    throw new ApiError(404, "Error while approving event");
  }
});

const eventStatusReject = asyncHandler(async (req, res) => {
  try {
    if (
      req.user.role !== "HoD" ||
      req.user.role !== "Dean" ||
      req.user.role !== "Director"
    ) {
      throw new ApiError(404, "Unauthorized user");
    }
    const { eventId } = req.params;
    const { reason } = req.body;
    if (!eventId) {
      throw new ApiError(404, "Error while selecting event");
    }
    const event = await Event.findById(eventId);
    if (!event) {
      throw new ApiError(404, "Event not found");
    }
    if (event.status === "Approved" || event.status === "Rejected") {
      throw new ApiError(404, "You can not modify event");
    }
    event.status = "Rejected";
    event.approvalHistory.push({
      user: req.user._id,
      role: req.user.role,
      status: "Rejected",
      reason: reason || "Not mentioned",
      timestamp: new Date(),
    });
    await event.save();
    return res.status(200).json(200, "Event rejected");
  } catch (error) {
    throw new ApiError(404, "Error while rejecting event");
  }
});

const startAttendance = asyncHandler(async (req, res) => {
  const { eventId } = req.body;

  const event = await Event.findById(eventId);
  if (!event) {
    throw new ApiError(404, "Event not exsits");
  }
  if (event.status !== "Accepted") {
    throw new ApiError(404, "Event is not accepted");
  }

  let attendance = await Attendance.findOne({ event: eventId });
  if (!attendance) {
    throw new ApiError(404, "Event not found");
  }

  // 🔹 FIRST TOKEN (0–30 sec)
  await storeToken(eventId);

  let rotations = 1;

  const interval = setInterval(async () => {
    if (rotations >= 2) {
      clearInterval(interval);
      return;
    }

    // 🔹 SECOND TOKEN (30–60 sec)
    await storeToken(eventId);

    rotations++;
  }, 30000);

  res.json({ message: "Attendance started (1 min window)" });
});

const getCurrentToken = asyncHandler(async (req, res) => {
  const { eventId } = req.query;

  const token = await getToken(eventId);

  if (!token) {
    return res.status(400).json({ message: "Attendance closed" });
  }

  res.json({ token });
});

const manualMarkAttendance = asyncHandler(async (req, res) => {
  const { eventId, studentIds } = req.body;

  if (!eventId || !Array.isArray(studentIds) || studentIds.length === 0) {
    throw new ApiError(400, "eventId and studentIds are required");
  }

  const attendanceDoc = await Attendance.findOne({ event: eventId });
  if (!attendanceDoc) {
    throw new ApiError(404, "Attendance document not found for this event");
  }

  if (!["Faculty", "HoD", "Admin"].includes(req.user.role)) {
    throw new ApiError(403, "Unauthorized");
  }

  attendanceDoc.records.forEach((record) => {
    if (studentIds.includes(record.student.toString())) {
      record.status = "Present";
    }
  });

  await attendanceDoc.save();

  res
    .status(200)
    .json(
      new ApiResponse(200, { attendanceDoc }, "Attendance done successfully"),
    );
});

const getRegisteredStudents = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const event = await Registration.find({ event: eventId }).populate(
    "student",
    "fullname roll_number division",
  );
  if (!event) throw new ApiError(404, "Event not found");

  if (
    req.user.role !== "Admin" ||
    event.organizedBy.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, "Unauthorized");
  }

  res
    .status(200)
    .json(
      new ApiResponse(200, { event }, "Registrations fetched successfully"),
    );
});

const getStudentAttendanceList = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const record = await Attendance.findOne({ event: eventId }).populate(
    "event",
    "name organizedBy",
  );

  if (
    req.user.role !== "Admin" &&
    req.user.id.toString() !== record.event.organizedBy.toString()
  ) {
    throw new ApiError(404, "Unauthorized user");
  }
  if (!record) {
    throw new ApiError(404, "Attendance not found");
  }
  return res.status(200).json(new ApiResponse(200, { record }));
});

export {
  modifyEventBeforeApproveCommon,
  modifyEventAfterApproveCommon,
  deleteEventCommon,
  getEventCommon,
  myEvent,
  getEventFeedbackCommon,
  getEventApprovalOrReject,
  eventStatusApprove,
  eventStatusReject,
  startAttendance,
  getCurrentToken,
  manualMarkAttendance,
  getRegisteredStudents,
  getStudentAttendanceList,
};
