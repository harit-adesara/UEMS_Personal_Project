import { ApiResponse } from "../utils/api_response.js";
import { ApiError } from "../utils/api_error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Registration } from "../models/registration.js";
import { Attendance } from "../models/attendance.js";
import { Event } from "../models/event.js";
import mongoose from "mongoose";
import { generalNotification, studentNotification } from "../db/bullmq.js";
import crypto from "crypto";

export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, signature, eventId } = req.body;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const registration = await Registration.findOne({
      student: req.user._id,
      event: eventId,
      razorpayOrderId,
      status: "reserved",
    }).session(session);

    if (!registration) {
      throw new ApiError(404, "Registration not found");
    }

    if (!registration.razorpayOrderId) {
      throw new ApiError(400, "This event does not require payment");
    }

    if (registration.paid) {
      await session.commitTransaction();
      return res
        .status(200)
        .json(new ApiResponse(200, "Payment is already verified"));
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(`${razorpayOrderId}|${razorpayPaymentId}`);

    const generatedSignature = hmac.digest("hex");

    if (generatedSignature !== signature) {
      await Registration.updateOne(
        { _id: registration._id },
        { status: "failed" },
        { session },
      );

      await Event.updateOne(
        { _id: eventId },
        { $inc: { seatTaken: -1 } },
        { session },
      );

      await session.commitTransaction();

      return res
        .status(400)
        .json(new ApiResponse(400, "Payment verification failed"));
    }

    const update = await Registration.updateOne(
      { _id: registration._id },
      {
        paid: true,
        status: "confirmed",
        razorpayPaymentId,
        paidAt: new Date(),
        expiresAt: null,
      },
      { session },
    );

    if (update.modifiedCount === 0) {
      throw new ApiError(404, "Error updating registration");
    }

    let attendanceDoc = await Attendance.findOne({ event: eventId }).session(
      session,
    );

    if (!attendanceDoc) {
      [attendanceDoc] = await Attendance.create(
        [
          {
            event: eventId,
            records: [
              {
                student: req.user._id,
                school: req.user.school,
                branch: req.user.branch,
                division: req.user.division || null,
                status: "Absent",
              },
            ],
          },
        ],
        { session },
      );
    } else {
      const exists = attendanceDoc.records.some(
        (r) => r.student.toString() === req.user._id.toString(),
      );

      if (!exists) {
        attendanceDoc.records.push({
          student: req.user._id,
          school: req.user.school,
          branch: req.user.branch,
          division: req.user.division || null,
          status: "Absent",
        });

        await attendanceDoc.save({ session });
      }
    }

    await session.commitTransaction();

    void generalNotification({
      data: {
        userId: req.user._id,
        title: "Registered in Event",
        body: `You have registered in event ${eventId}`,
        meta: { eventId },
      },
      type: "RegisterInEvent",
    });

    return res.status(200).json(new ApiResponse(200, "Payment verified"));
  } catch (error) {
    await session.abortTransaction();
    throw new ApiError(400, error.message || "Error in verifying payment");
  } finally {
    session.endSession();
  }
});
