import mongoose from "mongoose";
const { Schema } = mongoose;

const schoolSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

export const School = mongoose.model("School", schoolSchema);
