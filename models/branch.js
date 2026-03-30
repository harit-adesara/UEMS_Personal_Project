import mongoose from "mongoose";
const { Schema } = mongoose;

const branchSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    school: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export const Branch = mongoose.model("Branch", branchSchema);
