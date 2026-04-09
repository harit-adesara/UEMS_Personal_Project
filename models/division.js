import mongoose from "mongoose";
const { Schema } = mongoose;

const divisionSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

divisionSchema.index(
  { name: 1, branch: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

export const Division = mongoose.model("Division", divisionSchema);
