import mongoose from "mongoose";

const OsceProgressSchema = new mongoose.Schema(
  {
    competent: { type: Boolean, default: false },
    bestOverall: { type: Number, default: null },
    bestLevel: { type: String, default: null },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    progress: {
      guideDone: { type: Boolean, default: false },
      exercises: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["manager", "admin"], default: "manager" },
    centre: { type: String, default: "" },
    state: { type: String, default: "" },
    progress: {
      guideDone: { type: Boolean, default: false },
      exercises: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    bestOverall: { type: Number, default: null },
    bestLevel: { type: String, default: null },
    competent: { type: Boolean, default: false },
    attemptCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    // CAOSCE (OSCE) — tracked independently from CBT.
    osce: { type: OsceProgressSchema, default: () => ({}) },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function () {
  const { passwordHash, __v, ...rest } = this.toObject();
  return rest;
};

export default mongoose.model("User", userSchema);
