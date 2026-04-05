import { ApiResponse } from "../utils/api_response.js";
import { ApiError } from "../utils/api_error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Registration } from "../models/registration.js";
import { Attendance } from "../models/attendance.js";
import mongoose from "mongoose";

export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, signature, eventId } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const registration = await Registration.findOne({
      student: req.user._id,
      event: eventId,
      razorpayOrderId: razorpayOrderId,
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
    hmac.update(razorpayOrderId + "|" + razorpayPaymentId);
    const generatedSignature = hmac.digest("hex");
    if (generatedSignature === signature) {
      const update = await Registration.findOneAndUpdate(
        {
          student: req.user._id,
          event: eventId,
          razorpayOrderId: razorpayOrderId,
        },
        {
          paid: true,
          razorpayPaymentId: razorpayPaymentId,
          paidAt: new Date(),
        },
        { new: true, session },
      );

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
                  student: req.user.id,
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

          await attendanceDoc.save({ session });
        }
      }

      if (!update) {
        throw new ApiError(404, "Registration not found");
      }

      await session.commitTransaction();
      res.status(200).json(new ApiResponse(200, "Payment verified"));
    } else {
      throw new ApiError(404, "Invalid signature");
    }
  } catch (error) {
    await session.abortTransaction();
    throw new ApiError(404, "Error in verifing payment");
  } finally {
    session.endSession();
  }
});
