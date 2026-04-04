import { ApiResponse } from "../utils/api_response.js";
import { ApiError } from "../utils/api_error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.js";
import { Event } from "../models/event.js";
import { Branch } from "../models/branch.js";
import { School } from "../models/school.js";
import { Feedback } from "../models/feedback.js";
import { Division } from "../models/division.js";
import { registerEmail, sendEmail } from "../utils/mail.js";
import { redis, storeToken, getToken } from "../db/redis.js";
import { Attendance } from "../models/attendance.js";
import { Registration } from "../models/registration.js";

const addFeedback = asyncHandler(async (req, res) => {
  if (req.user.role !== "Student") {
    throw new ApiError(404, "Only students can give feedback");
  }

  const userId = req.user._id;
  const { eventId, rating, comment } = req.body;

  const register = await Registration.findOne({ userId, eventId });

  if (!register) {
    throw new ApiError(404, "You have not register in this event");
  }

  if (!eventId || !rating) {
    throw new ApiError(400, "Event and rating required");
  }

  const event = await Event.findById(eventId).select("endTime");
  if (!event) {
    throw new ApiError(404, "Event not found");
  }

  const now = new Date();
  const endTime = new Date(event.endTime);

  if (endTime > now) {
    throw new ApiError(400, "Feedback allowed only after event ends");
  }

  const deadline = new Date(endTime.getTime() + 48 * 60 * 60 * 1000);
  if (now > deadline) {
    throw new ApiError(400, "Feedback window closed");
  }

  let feedbackDoc = await Feedback.findOne({ event: eventId }).select(
    "feedbacks",
  );

  if (!feedbackDoc) {
    await Feedback.create({
      event: eventId,
      feedbacks: [
        {
          user: userId,
          rating,
          comment,
        },
      ],
    });

    return res.status(201).json({
      success: true,
      message: "Feedback submitted",
    });
  }

  const already = feedbackDoc.feedbacks.some(
    (f) => f.user.toString() === userId.toString(),
  );

  if (already) {
    throw new ApiError(400, "Feedback already submitted");
  }

  feedbackDoc.feedbacks.push({
    user: userId,
    rating,
    comment,
  });

  await feedbackDoc.save();

  res.status(201).json(new ApiResponse(200, { message: "Feedback submitted" }));
});

const markAttendanceQR = asyncHandler(async (req, res) => {
  const { eventId } = req.body;
  const userId = req.user._id;

  const attendanceDoc = await Attendance.findOne({ event: eventId });
  if (!attendanceDoc) throw new ApiError(404, "Attendance document not found");

  const record = attendanceDoc.records.find(
    (r) => r.student.toString() === userId.toString(),
  );
  if (!record) {
    throw new ApiError(400, "You are not registered for this event");
  }

  if (record.status === "Present") {
    return res.status(400).json({ message: "Attendance already marked" });
  }

  record.status = "Present";
  await attendanceDoc.save();

  res.status(200).json({ message: "Attendance marked successfully" });
});

const registerInEvent = asyncHandler(async (req, res) => {
  try {
    if (req.user.role !== "Student") {
      throw new ApiError(404, "Unauthorized user");
    }
    const { eventId } = req.params;
    const event = await Event.findById(eventId);
    if (!event) {
      throw new ApiError(404, "Event not found");
    }
    if (event.status !== "Accepted") {
      throw new ApiError(404, "Event is not accepted yet");
    }
    const existing = await Registration.findOne({
      user: req.user._id,
      event: eventId,
    });
    if (existing) {
      throw new ApiError(404, "User already registerd");
    }
    if (event.amount === 0) {
      const registration = await Registration.create({
        event: eventId,
        student: req.user._id,
        school: req.user.school,
        branch: req.user.branch,
        division: req.user.division,
        paid: true,
        registeredAt: new Date(),
      });

      let attendanceDoc = await Attendance.findOne({ event: eventId });

      if (!attendanceDoc) {
        attendanceDoc = await Attendance.create({
          event: eventId,
          records: [
            {
              student: req.user.id,
              school: req.user.school,
              branch: req.user.branch,
              division: req.user.division || null,
              status: "Absent",
            },
          ],
        });
      } else {
        const exists = attendanceDoc.records.some(
          (r) => r.student.toString() === req.user.id.toString(),
        );
        if (!exists) {
          attendanceDoc.records.push({
            student: req.user.id,
            school: req.user.school,
            branch: req.user.branch,
            division: req.user.division || null,
            status: "Absent",
          });
          await attendanceDoc.save();
        }
      }
      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { isPaid: false, registration },
            "Registation done",
          ),
        );
    }
    const order = await razorpayInstance.orders.create({
      amount: event.amount * 100,
      currency: "INR",
      receipt: `rec_${req.user._id.toString().slice(-8)}_${eventId.toString().slice(-8)}`,
    });

    await Registration.create({
      event: eventId,
      user: req.user._id,
      school: req.user.school,
      branch: req.user.branch,
      division: req.user.division,
      razorpayOrderId: order.id,
    });

    return res.status(200).json(
      new ApiResponse(200, {
        isPaid: true,
        order: {
          razorpayOrderId: order.id,
          amount: order.amount,
          currency: order.currency,
        },
      }),
    );
  } catch (error) {
    console.log(error);
    throw new ApiError(404, "Error while registration");
  }
});

const eventListStudent = asyncHandler(async (req, res) => {
  if (req.user.role !== "Student") {
    throw new ApiError(403, "Unauthorized user");
  }

  const { school, branch, year, division } = req.user;
  let filter = { status: "Accepted" };

  // Date filter
  if (req.query.date) {
    const start = new Date(req.query.date);
    const end = new Date(req.query.date);
    end.setHours(23, 59, 59, 999);
    filter.startTime = { $gte: start, $lte: end };
  } else {
    filter.startTime = { $gte: new Date() };
  }

  if (req.query.name) filter.name = { $regex: req.query.name, $options: "i" };
  if (req.query.organizedBy)
    filter.organizedBy = { $regex: req.query.organizedBy, $options: "i" };

  filter.targets = {
    $elemMatch: {
      school,
      branches: {
        $elemMatch: {
          $and: [
            { branch: { $in: [branch, null] } },
            { StudentYear: { $in: [year, null] } },
            {
              $or: [
                { divisions: { $size: 0 } },
                { divisions: { $in: [division] } },
              ],
            },
          ],
        },
      },
    },
  };

  const events = await Event.find(filter).sort({ startTime: -1 });

  if (!events.length)
    throw new ApiError(404, "No events found for your profile");

  res.status(200).json(new ApiResponse(200, { events }));
});

const viewEventDetail = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const event = await Event.findOne({ _id: eventId, status: "Approved" });
  if (!event) {
    throw new ApiError(404, "Event not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { event }, "Event fetched successfully"));
});

const myRegisteredEvent = asyncHandler(async (req, res) => {
  if (req.user.role !== "Student") {
    throw new ApiError(404, "Unauthorized user");
  }
  let filter = { status: "Accepted", student: req.user.id };

  if (req.query.date) {
    const start = new Date(req.query.date);
    const end = new Date(req.query.date);
    end.setHours(23, 59, 59, 999);
    filter.startTime = { $gte: start, $lte: end };
  } else {
    filter.startTime = { $gte: new Date() };
  }

  if (req.query.name) filter.name = { $regex: req.query.name, $options: "i" };
  if (req.query.organizedBy)
    filter.organizedBy = { $regex: req.query.organizedBy, $options: "i" };

  const event = (await Registration.find(filter)).sort({
    registeredAt: -1,
  });

  if (event.length === 0) {
    throw new ApiError(404, "Event not found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, { event }, "Event fetched successfully"));
});

const getStudentAttendance = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  if (req.user.role !== "Student" || req.user._id.toString() !== studentId) {
    throw new ApiError(403, "Unauthorized");
  }

  const attendanceRecords = await Attendance.find(
    { "records.student": studentId },
    { "records.$": 1, event: 1 },
  ).populate("event", "name date organizedBy");

  res.status(200).json({ attendance });
});
