import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Attempt from "../models/Attempt.js";
import OsceAttempt from "../models/OsceAttempt.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const r = Router();
r.use(requireAuth, requireAdmin);

const statusOf = (u) => {
  if (u.competent) return "competent";
  if (u.attemptCount > 0) return "needs_retake";
  if (u.progress?.guideDone || Object.keys(u.progress?.exercises || {}).length)
    return "in_training";
  return "not_started";
};

const osceStatusOf = (u) => {
  const o = u.osce || {};
  if (o.competent) return "competent";
  if (o.attemptCount > 0) return "needs_retake";
  const p = o.progress;
  if (p?.guideDone || Object.keys(p?.exercises || {}).length)
    return "in_training";
  return "not_started";
};

r.get("/summary", async (_req, res) => {
  const managers = await User.find({ role: "manager" });
  const counts = {
    total: managers.length,
    competent: 0,
    needs_retake: 0,
    in_training: 0,
    not_started: 0,
    assigned: 0,
    osce_competent: 0,
    osce_needs_retake: 0,
    osce_in_training: 0,
    osce_not_started: 0,
  };
  for (const m of managers) {
    counts[statusOf(m)]++;
    counts[`osce_${osceStatusOf(m)}`]++;
    if (m.centre) counts.assigned++;
  }
  res.json({ counts });
});

r.get("/managers", async (req, res) => {
  const kind = req.query.kind === "osce" ? "osce" : "cbt";
  const statusFilter = req.query.status;
  const q = { role: "manager" };
  if (kind === "cbt" && statusFilter === "competent") q.competent = true;
  if (kind === "osce" && statusFilter === "competent")
    q["osce.competent"] = true;
  const list = await User.find(q).sort({ createdAt: -1 }).limit(500);
  const statusFn = kind === "osce" ? osceStatusOf : statusOf;
  const out = list.map((u) => ({
    ...u.toPublic(),
    status: statusFn(u),
    cbtStatus: statusOf(u),
    osceStatus: osceStatusOf(u),
  }));
  res.json({
    managers:
      statusFilter && statusFilter !== "competent"
        ? out.filter((m) => m.status === statusFilter)
        : out,
    kind,
  });
});

r.get("/managers/:id/attempts", async (req, res) => {
  const list = await Attempt.find({ user: req.params.id, status: "submitted" })
    .sort({ finishedAt: -1 })
    .limit(50)
    .select("-tasks.actions");
  res.json({ attempts: list });
});

r.get("/managers/:id/osce-attempts", async (req, res) => {
  const list = await OsceAttempt.find({
    user: req.params.id,
    status: "submitted",
  })
    .sort({ finishedAt: -1 })
    .limit(50);
  res.json({ attempts: list });
});

r.patch("/managers/:id/assignment", async (req, res) => {
  const u = await User.findOne({ _id: req.params.id, role: "manager" });
  if (!u) return res.status(404).json({ error: "Manager not found" });
  const centre = String(req.body?.centre ?? "")
    .trim()
    .slice(0, 80);
  if (centre && !u.competent)
    return res
      .status(409)
      .json({
        error:
          "This manager has not reached Competent yet, so cannot be assigned to a centre",
      });
  u.centre = centre;
  if (typeof req.body?.state === "string")
    u.state = req.body.state.trim().slice(0, 60);
  await u.save();
  res.json({ manager: u.toPublic() });
});

r.post("/users", async (req, res) => {
  const { name, email, password, role = "manager" } = req.body || {};
  if (
    !name?.trim() ||
    !/^\S+@\S+\.\S+$/.test(email || "") ||
    typeof password !== "string" ||
    password.length < 8
  )
    return res
      .status(400)
      .json({ error: "Name, valid email and password (8+ chars) required" });
  if (!["manager", "admin"].includes(role))
    return res.status(400).json({ error: "Invalid role" });
  if (await User.findOne({ email: email.toLowerCase() }))
    return res.status(409).json({ error: "Email already registered" });
  const u = await User.create({
    name: name.trim(),
    email,
    role,
    passwordHash: await bcrypt.hash(password, 10),
  });
  res.status(201).json({ user: u.toPublic() });
});

export default r;
