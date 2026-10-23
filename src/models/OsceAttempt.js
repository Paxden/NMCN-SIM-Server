import mongoose from "mongoose";

const osceAttemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    seed: { type: Number, required: true },
    status: {
      type: String,
      enum: ["in_progress", "submitted"],
      default: "in_progress",
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,
    overall: Number,
    level: String,
    passed: Boolean,
    mustPassMet: Boolean,
    profile: [{ _id: false, area: String, score: Number }],
    standard: mongoose.Schema.Types.Mixed,
    tasks: [mongoose.Schema.Types.Mixed],
  },
  { timestamps: true },
);

export default mongoose.model("OsceAttempt", osceAttemptSchema);
