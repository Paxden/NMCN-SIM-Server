import { Router } from "express";
import crypto from "node:crypto";
import Attempt from "../models/Attempt.js";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { STANDARD, TASK_COUNT, buildReport, buildTask, gradeTask } from "../shared/assessment.js";

const r = Router();
r.use(requireAuth);

const MAX_ACTIONS = 2000;
const clean = (actions) =>
  (Array.isArray(actions) ? actions : []).slice(0, MAX_ACTIONS).map((a) => ({
    type: String(a?.type || "").slice(0, 40),
    payload: a?.payload && typeof a.payload === "object" ? JSON.parse(JSON.stringify(a.payload)) : {},
    at: Number(a?.at) || 0,
  }));

// Start: the SERVER picks the seed, so the client cannot choose easy tasks.
r.post("/", async (req, res) => {
  // Close any older unfinished attempt so there is only one live attempt per user.
  await Attempt.deleteMany({ user: req.user._id, status: "in_progress" });
  const seed = crypto.randomInt(1, 2147483647);
  const a = await Attempt.create({ user: req.user._id, seed });
  res.status(201).json({ attemptId: a._id, seed, startedAt: a.startedAt.getTime(), taskCount: TASK_COUNT });
});

// Submit: the server rebuilds every task from the seed and re-scores the logged actions.
// Scores sent by the client are ignored.
r.post("/:id/submit", async (req, res) => {
  const a = await Attempt.findOne({ _id: req.params.id, user: req.user._id });
  if (!a) return res.status(404).json({ error: "Attempt not found" });
  if (a.status === "submitted") return res.status(409).json({ error: "Attempt already submitted" });

  const tasksIn = req.body?.tasks;
  if (!Array.isArray(tasksIn) || tasksIn.length !== TASK_COUNT)
    return res.status(400).json({ error: `Expected ${TASK_COUNT} tasks` });

  const now = Date.now();
  const budget = (() => {
    let t = 0;
    for (let i = 0; i < TASK_COUNT; i++) t += buildTask(a.seed, i).timeLimit;
    return t;
  })();
  // An attempt cannot finish after much longer than the sum of its time limits plus breaks.
  if (now - a.startedAt.getTime() > (budget + 60 * 60) * 1000)
    return res.status(400).json({ error: "Attempt took too long and has expired. Start a new one." });

  const results = tasksIn.map((t, i) => {
    const task = buildTask(a.seed, i);
    const actions = clean(t?.actions);
    const errors = Math.min(50, Math.max(0, Math.floor(Number(t?.errors) || 0)));
    const timeSec = Math.min(task.timeLimit, Math.max(0, Math.floor(Number(t?.timeSec) || 0)));
    return { ...gradeTask(task, actions, { errors, timeSec, timedOut: !!t?.timedOut }), errors, actions };
  });

  const report = buildReport(results);
  Object.assign(a, { status: "submitted", finishedAt: new Date(now), standard: STANDARD, tasks: results, ...report });
  await a.save();

  // Update the manager's best result.
  const u = req.user;
  u.attemptCount += 1;
  u.lastAttemptAt = a.finishedAt;
  if (u.bestOverall == null || report.overall > u.bestOverall) {
    u.bestOverall = report.overall;
    u.bestLevel = report.level;
  }
  u.competent = u.competent || report.passed;
  await u.save();

  res.json({ record: toRecord(a, u) });
});

const toRecord = (a, u) => ({
  attemptId: a._id.toString(),
  name: u?.name,
  startedAt: a.startedAt.getTime(),
  finishedAt: a.finishedAt?.getTime(),
  standard: a.standard,
  overall: a.overall, level: a.level, passed: a.passed, mustPassMet: a.mustPassMet,
  profile: a.profile, tasks: a.tasks,
});

r.get("/mine", async (req, res) => {
  const list = await Attempt.find({ user: req.user._id, status: "submitted" })
    .sort({ finishedAt: -1 }).limit(20);
  res.json({ attempts: list.map((a) => toRecord(a, req.user)) });
});

r.get("/:id", async (req, res) => {
  const a = await Attempt.findById(req.params.id).populate("user", "name email centre");
  if (!a) return res.status(404).json({ error: "Attempt not found" });
  const owner = a.user._id.toString() === req.user._id.toString();
  if (!owner && req.user.role !== "admin") return res.status(403).json({ error: "Not allowed" });
  res.json({ record: toRecord(a, a.user) });
});

export default r;
