import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const r = Router();
const emailOk = (e) => typeof e === "string" && /^\S+@\S+\.\S+$/.test(e);

// Managers self-register. Role is always "manager"; admins are created by the seed script or another admin.
r.post("/register", async (req, res) => {
  const { name, email, password, centre = "", state = "" } = req.body || {};
  if (!name?.trim() || !emailOk(email) || typeof password !== "string" || password.length < 8)
    return res.status(400).json({ error: "Name, a valid email and a password of 8+ characters are required" });
  if (await User.findOne({ email: email.toLowerCase() }))
    return res.status(409).json({ error: "That email is already registered" });
  // centre is NOT taken from self-registration: assignment is an admin decision.
  const user = await User.create({
    name: name.trim(), email, state: String(state).slice(0, 60),
    passwordHash: await bcrypt.hash(password, 10), role: "manager",
  });
  res.status(201).json({ token: signToken(user), user: user.toPublic() });
});

r.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = emailOk(email) ? await User.findOne({ email: email.toLowerCase() }) : null;
  if (!user || typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash)))
    return res.status(401).json({ error: "Invalid email or password" });
  res.json({ token: signToken(user), user: user.toPublic() });
});

r.get("/me", requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

// Sync tour/exercise progress from the trainer.
r.put("/progress", requireAuth, async (req, res) => {
  const { guideDone, exercises } = req.body || {};
  if (typeof guideDone === "boolean") req.user.progress.guideDone = guideDone;
  if (exercises && typeof exercises === "object") {
    const clean = {};
    for (const [id, v] of Object.entries(exercises).slice(0, 50))
      if (v && Number.isFinite(v.mistakes) && Number.isFinite(v.time)) clean[id] = { mistakes: v.mistakes, time: v.time };
    req.user.progress.exercises = clean;
  }
  req.user.markModified("progress");
  await req.user.save();
  res.json({ progress: req.user.progress });
});

export default r;
