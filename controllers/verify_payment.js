import { ApiResponse } from "../utils/api_response.js";
import { ApiError } from "../utils/api_error.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Registration } from "../models/registration.js";
import { Attendance } from "../models/attendance.js";

export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, signature, eventId } = req.body;
  const registration = await Registration.findOne({
    user: req.user._id,
    event: eventId,
  });

  if (!registration) {
    throw new ApiError(404, "Registration not found");
  }

  if (!registration.razorpayOrderId) {
    throw new ApiError(400, "This event does not require payment");
  }

  if (registration.paid) {
    throw new ApiError(400, "Payment already verified");
  }

  const secret = process.env.KEY_SECRET;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(razorpayOrderId + "|" + razorpayPaymentId);
  const generatedSignature = hmac.digest("hex");
  if (generatedSignature === signature) {
    const update = await Registration.findOneAndUpdate(
      {
        user: req.user._id,
        event: eventId,
        razorpayOrderId: razorpayOrderId,
      },
      {
        paid: true,
        razorpayPaymentId: razorpayPaymentId,
        paidAt: new Date(),
      },
      { new: true },
    );
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

    if (!update) {
      throw new ApiError(404, "Registration not found");
    }

    res.status(200).json(new ApiResponse(200, "Payment verified"));
  } else {
    throw new ApiError(404, "Payment not verified");
  }
});
