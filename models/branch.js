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

branchSchema.index(
  { name: 1, school: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const Branch = mongoose.model("Branch", branchSchema);
