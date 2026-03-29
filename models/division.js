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
  },
  { timestamps: true },
);

export const Division = mongoose.model("Division", divisionSchema);
