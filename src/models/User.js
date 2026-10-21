import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["manager", "admin"], default: "manager" },
    // Set by an admin. Only allowed while the manager is competent.
    centre: { type: String, default: "" },
    state: { type: String, default: "" },
    // Mirrors the trainer's localStorage progress (tour + exercises).
    progress: {
      guideDone: { type: Boolean, default: false },
      exercises: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    // Denormalised from the best submitted attempt so the dashboard is one query.
    bestOverall: { type: Number, default: null },
    bestLevel: { type: String, default: null },
    competent: { type: Boolean, default: false },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function () {
  const { passwordHash, __v, ...rest } = this.toObject();
  return rest;
};

export default mongoose.model("User", userSchema);
