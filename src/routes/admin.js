import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Attempt from "../models/Attempt.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const r = Router();
r.use(requireAuth, requireAdmin);

// Status buckets for the dashboard.
const statusOf = (u) => {
  if (u.competent) return "competent";
  if (u.attemptCount > 0) return "needs_retake";
  if (u.progress?.guideDone || Object.keys(u.progress?.exercises || {}).length) return "in_training";
  return "not_started";
};

r.get("/summary", async (_req, res) => {
  const managers = await User.find({ role: "manager" });
  const counts = { total: managers.length, competent: 0, needs_retake: 0, in_training: 0, not_started: 0, assigned: 0 };
  for (const m of managers) {
    counts[statusOf(m)]++;
    if (m.centre) counts.assigned++;
  }
  res.json({ counts });
});

r.get("/managers", async (req, res) => {
  const q = { role: "manager" };
  if (req.query.status === "competent") q.competent = true;
  const list = await User.find(q).sort({ createdAt: -1 }).limit(500);
  const out = list.map((u) => ({ ...u.toPublic(), status: statusOf(u) }));
  res.json({ managers: req.query.status && req.query.status !== "competent" ? out.filter((m) => m.status === req.query.status) : out });
});

r.get("/managers/:id/attempts", async (req, res) => {
  const list = await Attempt.find({ user: req.params.id, status: "submitted" }).sort({ finishedAt: -1 }).limit(50)
    .select("-tasks.actions");
  res.json({ attempts: list });
});

// Assignment is only allowed once the manager is competent.
r.patch("/managers/:id/assignment", async (req, res) => {
  const u = await User.findOne({ _id: req.params.id, role: "manager" });
  if (!u) return res.status(404).json({ error: "Manager not found" });
  const centre = String(req.body?.centre ?? "").trim().slice(0, 80);
  if (centre && !u.competent)
    return res.status(409).json({ error: "This manager has not reached Competent yet, so cannot be assigned to a centre" });
  u.centre = centre;
  if (typeof req.body?.state === "string") u.state = req.body.state.trim().slice(0, 60);
  await u.save();
  res.json({ manager: u.toPublic() });
});

// Admin creates a manager or another admin.
r.post("/users", async (req, res) => {
  const { name, email, password, role = "manager" } = req.body || {};
  if (!name?.trim() || !/^\S+@\S+\.\S+$/.test(email || "") || typeof password !== "string" || password.length < 8)
    return res.status(400).json({ error: "Name, valid email and password (8+ chars) required" });
  if (!["manager", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: "Email already registered" });
  const u = await User.create({ name: name.trim(), email, role, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ user: u.toPublic() });
});

export default r;
