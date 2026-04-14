import { User } from "../models/user.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/api_error.js";
import { ApiResponse } from "../utils/api_response.js";

export const saveFCMToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new ApiError(400, "FCM token required");
  }

  await User.updateOne(
    {
      _id: req.user._id,
    },
    {
      fcmToken: token,
      notificationEnabled: true,
    },
  );

  return res.status(200).json(new ApiResponse(200, {}, "Notification enable"));
});

export const toggleNotification = asyncHandler(async (req, res) => {
  const { enabled } = req.body;

  if (typeof enabled !== "boolean") {
    throw new ApiError(400, "enabled must be boolean");
  }

  await User.updateOne(
    {
      _id: req.user._id,
    },
    { notificationEnabled: enabled },
  );
  return res.status(200).json({ success: true });
});
