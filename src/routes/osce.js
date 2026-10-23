import { Router } from "express";
import crypto from "node:crypto";
import OsceAttempt from "../models/OsceAttempt.js";
import { requireAuth } from "../middleware/auth.js";
import {
  OSCE_STANDARD,
  TASK_COUNT,
  buildTask,
  evaluateTask,
  buildReport,
} from "../shared/osceAssessment.js";

const r = Router();
r.use(requireAuth);

const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const bool = (v) => !!v;
const comp = (v) => (["idle", "started", "ended"].includes(v) ? v : "idle");

// Only keep fields the checks can touch; bound arrays; coerce types.
const cleanState = (s) => {
  const x = s && typeof s === "object" ? s : {};
  return {
    loggedIn: bool(x.loggedIn),
    online: bool(x.online),
    downloaded: bool(x.downloaded),
    activated: bool(x.activated),
    uploaded: bool(x.uploaded),
    components: {
      osce: comp(x.components?.osce),
      viva: comp(x.components?.viva),
      client_care: comp(x.components?.client_care),
      family_care: comp(x.components?.family_care),
      research: comp(x.components?.research),
    },
    candidates: arr(x.candidates, 500).map((c) => ({
      examNo: String(c?.examNo || ""),
      name: String(c?.name || ""),
      program: String(c?.program || ""),
      team: String(c?.team || ""),
      progress: arr(c?.progress, 6).map(bool),
    })),
    examiners: arr(x.examiners, 100).map((e) => ({
      id: String(e?.id || ""),
      fullName: String(e?.fullName || ""),
      username: String(e?.username || ""),
      password: String(e?.password || ""),
      procedure: String(e?.procedure || ""),
      lead: bool(e?.lead),
    })),
    ips: arr(x.ips, 500).map((i) => ({
      id: String(i?.id || ""),
      ip: String(i?.ip || ""),
      port: Number(i?.port) || 0,
      approved: bool(i?.approved),
      primary: bool(i?.primary),
    })),
    syncCount: Math.max(0, Math.floor(Number(x.syncCount) || 0)),
    mistakes: Math.min(200, Math.max(0, Math.floor(Number(x.mistakes) || 0))),
    events: arr(x.events, 2000).map((e) => String(e).slice(0, 120)),
  };
};

r.post("/", async (req, res) => {
  await OsceAttempt.deleteMany({ user: req.user._id, status: "in_progress" });
  const seed = crypto.randomInt(1, 2147483647);
  const a = await OsceAttempt.create({ user: req.user._id, seed });
  res
    .status(201)
    .json({
      attemptId: a._id,
      seed,
      startedAt: a.startedAt.getTime(),
      taskCount: TASK_COUNT,
    });
});

r.post("/:id/submit", async (req, res) => {
  const a = await OsceAttempt.findOne({
    _id: req.params.id,
    user: req.user._id,
  });
  if (!a) return res.status(404).json({ error: "Attempt not found" });
  if (a.status === "submitted")
    return res.status(409).json({ error: "Attempt already submitted" });

  const tasksIn = req.body?.tasks;
  if (!Array.isArray(tasksIn) || tasksIn.length !== TASK_COUNT)
    return res.status(400).json({ error: `Expected ${TASK_COUNT} tasks` });

  const now = Date.now();
  const budget = (() => {
    let t = 0;
    for (let i = 0; i < TASK_COUNT; i++) t += buildTask(a.seed, i).limit;
    return t;
  })();
  if (now - a.startedAt.getTime() > (budget + 60 * 60) * 1000)
    return res
      .status(400)
      .json({
        error: "Attempt took too long and has expired. Start a new one.",
      });

  const results = tasksIn.map((t, i) => {
    const task = buildTask(a.seed, i);
    const state = cleanState(t?.state);
    const timeSec = Math.min(
      task.limit,
      Math.max(0, Math.floor(Number(t?.timeSec) || 0)),
    );
    const ev = evaluateTask(task, state, state.mistakes);
    return {
      id: task.id,
      title: task.title,
      area: task.area,
      mustPass: task.mustPass,
      practise: task.practise,
      ...ev,
      timeSec,
      timedOut: !!t?.timedOut,
    };
  });

  const report = buildReport(results);
  Object.assign(a, {
    status: "submitted",
    finishedAt: new Date(now),
    standard: OSCE_STANDARD,
    tasks: results,
    ...report,
  });
  await a.save();

  const u = req.user;
  u.osce.attemptCount = (u.osce.attemptCount || 0) + 1;
  u.osce.lastAttemptAt = a.finishedAt;
  if (u.osce.bestOverall == null || report.overall > u.osce.bestOverall) {
    u.osce.bestOverall = report.overall;
    u.osce.bestLevel = report.level;
  }
  u.osce.competent = u.osce.competent || report.passed;
  await u.save();

  res.json({ record: toRecord(a, u) });
});

const toRecord = (a, u) => ({
  attemptId: a._id.toString(),
  name: u?.name,
  startedAt: a.startedAt.getTime(),
  finishedAt: a.finishedAt?.getTime(),
  standard: a.standard,
  overall: a.overall,
  level: a.level,
  passed: a.passed,
  mustPassMet: a.mustPassMet,
  profile: a.profile,
  tasks: a.tasks,
});

r.get("/mine", async (req, res) => {
  const list = await OsceAttempt.find({
    user: req.user._id,
    status: "submitted",
  })
    .sort({ finishedAt: -1 })
    .limit(20);
  res.json({ attempts: list.map((a) => toRecord(a, req.user)) });
});

r.get("/:id", async (req, res) => {
  const a = await OsceAttempt.findById(req.params.id).populate(
    "user",
    "name email",
  );
  if (!a) return res.status(404).json({ error: "Attempt not found" });
  const owner = a.user._id.toString() === req.user._id.toString();
  if (!owner && req.user.role !== "admin")
    return res.status(403).json({ error: "Not allowed" });
  res.json({ record: toRecord(a, a.user) });
});

export default r;
