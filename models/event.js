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

    eps: {
      url: { type: String, required: true },
      resourceType: { type: String, required: true },
      public_id: { type: String, required: true },
    },
    photo: {
      url: String,
      resourceType: String,
      public_id: String,
    },

    organizedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    level: {
      type: String,
      enum: ["Division", "College", "Branch", "School"],
      required: true,
    },

    year: {
      type: Number,
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
            StudentYear: {
              type: Number,
              default: null,
            },
            branch: {
              type: Schema.Types.ObjectId,
              ref: "Branch",
              default: null,
            },
            divisions: [
              {
                type: Schema.Types.ObjectId,
                ref: "Division",
                default: null,
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

    capacity: {
      type: Number,
      default: null,
      min: 1,
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

eventSchema.index({ name: 1, year: 1 }, { unique: true });

export const Event = mongoose.model("Event", eventSchema);
