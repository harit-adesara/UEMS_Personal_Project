import mongoose from "mongoose";
const { Schema } = mongoose;

const registrationSchema = new Schema(
  {
    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    student: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    school: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },

    division: {
      type: Schema.Types.ObjectId,
      ref: "Division",
      required: true,
    },

    paid: {
      type: Boolean,
      default: false,
      index: true,
    },

    fee: {
      type: Number,
      default: 0,
    },

    razorpayOrderId: {
      type: String,
      default: null,
      index: true,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },

    razorpaySignature: {
      type: String,
      default: null,
    },

    registeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

registrationSchema.index({ event: 1, student: 1 }, { unique: true });

export const Registration = mongoose.model("Registration", registrationSchema);
