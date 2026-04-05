import mongoose from "mongoose";
const { Schema } = mongoose;

const attendanceSchema = new Schema(
  {
    event: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      unique: true,
    },

    records: [
      {
        student: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
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
          default: null,
        },
        status: {
          type: String,
          enum: ["Present", "Absent"],
          default: "Absent",
        },
      },
    ],
  },
  { timestamps: true },
);

attendanceSchema.index({ event: 1 }, { unique: true });

export const Attendance = mongoose.model("Attendance", attendanceSchema);
