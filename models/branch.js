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
  },
  { timestamps: true },
);

export const Branch = mongoose.model("Branch", branchSchema);
