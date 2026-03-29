import mongoose from "mongoose";
const { Schema } = mongoose;

const eventSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    detail: {
      type: String,
      required: true,
      trim: true,
    },

    photo: {
      type: String,
    },

    epsFile: {
      type: String,
      required: true,
      trim: true,
    },

    organizedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    targets: [
      {
        school: {
          type: Schema.Types.ObjectId,
          ref: "School",
          required: true,
        },
        branches: [
          {
            branch: {
              type: Schema.Types.ObjectId,
              ref: "Branch",
              required: true,
            },
            divisions: [
              {
                type: Schema.Types.ObjectId,
                ref: "Division",
              },
            ],
          },
        ],
      },
    ],

    startTime: {
      type: Date,
      required: true,
    },

    endTime: {
      type: Date,
    },

    registrationDeadline: {
      type: Date,
      default: null,
      validate: {
        validator: function (value) {
          return !value || value <= this.startTime;
        },
        message: "Registration deadline must be before start time",
      },
    },

    venue: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    amount: {
      type: Number,
      default: 0,
    },

    approvalHistory: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          required: true,
        },
        status: {
          type: String,
          enum: ["Approved", "Rejected"],
          required: true,
        },
        reason: {
          type: String,
          trim: true,
          default: "",
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

export const Event = mongoose.model("Event", eventSchema);
