import mongoose from "mongoose";
import { roles } from "../utils/constants.js";
const { Schema } = mongoose;
import jwt from "jsonwebtoken";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const userSchema = new Schema(
  {
    avatar: {
      type: {
        url: String,
        localPath: String,
      },
      default: {
        url: "https://placehold.co/200",
        localPath: "",
      },
    },
    role: {
      type: String,
      enum: roles,
      default: "Student",
    },
    username: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    fullname: {
      type: String,
      trim: true,
      required: true,
    },
    roll_number: {
      type: String,
      trim: true,
      required: function () {
        return this.role === "Student";
      },
    },
    divison: {
      type: String,
      required: function () {
        return this.role === "Student";
      },
    },
    email: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      trim: true,
      select: false,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: {
      type: String,
    },
    emailVerificationExpiry: {
      type: Date,
    },
    forgetPasswordToken: {
      type: String,
    },
    forgetPasswordExpiry: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "deleted"],
      default: "inactive",
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: function () {
        return this.role === "Student" || this.role === "HoD";
      },
    },
    school: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: function () {
        return this.role === "Dean" || this.role === "Student";
      },
    },
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", function (next) {
  if ((this.role === "HoD" || this.role === "Student") && !this.branch) {
    return next(new Error("HoD must have branch"));
  }

  if ((this.role === "Dean" || this.role === "Student") && !this.school) {
    return next(new Error("Dean must have school"));
  }

  if (this.role !== "HoD" && this.role !== "Student") {
    this.branch = undefined;
  }

  if (this.role !== "Dean" && this.role !== "Student") {
    this.school = undefined;
  }

  next();
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    },
  );
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    },
  );
};

userSchema.methods.generateTemporaryToken = function () {
  const unHashedToken = crypto.randomBytes(20).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(unHashedToken)
    .digest("hex");
  const tokenExpiry = new Date(Date.now() + 20 * 60 * 1000);
  return { unHashedToken, hashedToken, tokenExpiry };
};

userSchema.index(
  { roll_number: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: "Student",
      roll_number: { $type: "string" },
    },
  },
);

export const User = mongoose.model("User", userSchema);
