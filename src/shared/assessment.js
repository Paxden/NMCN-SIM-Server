// Server copy of the client's assessment.js. Keep the two in sync (imports only differ by .js extension).
import { stageState } from "./data.js";
import { exerciseProgress, is, wrongCount } from "./exercises.js";

export const STANDARD = {
  highlyCompetent: 90,
  competent: 70,
  remediation: 50,
  taskPass: 60,
  penaltyPerMistake: 10,
};

const rng = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};
const no = (n) => `NSG26${String(n).padStart(3, "0")}`;
const pickNo = (r, exclude = []) => {
  for (;;) {
    const n = 1 + Math.floor(r() * 30);
    if (n % 7 !== 0 && !exclude.includes(n)) return n;
  }
};

const FACTORIES = [
  () => ({
    id: "setup", title: "Server set-up", area: "Server set-up", mustPass: true, timeLimit: 240,
    situation: "You have just arrived at the exam centre and the server has not been set up. Get Session 1 ready so that its candidates can start writing.",
    prepare: () => stageState("start"),
    steps: [
      { match: is("server_created") },
      { match: is("login") },
      { match: is("download") },
      { match: is("activate_exam") },
      { match: is("activate_session", { session: "Session 1" }) },
    ],
    wrong: is("reset_server"),
  }),
  () => ({
    id: "offline", title: "Exam data not on the server", area: "Connectivity", mustPass: false, timeLimit: 150, ignoreErrors: true,
    situation: "The exam has not been downloaded onto this server, and the server cannot reach the central server. Get the exam data onto the server.",
    prepare: () => ({ ...stageState("loggedIn"), online: false }),
    steps: [{ match: is("net_on") }, { match: is("download") }],
  }),
  (r) => {
    const n = no(pickNo(r));
    return {
      id: "disconnect", title: "Candidate computer crashed", area: "Candidate management", mustPass: false, timeLimit: 120,
      situation: `Candidate ${n} says the computer crashed and the screen went blank. They must carry on from where they stopped.`,
      prepare: () => stageState("writing"),
      steps: [{ match: is("relogin", { examNo: n }) }],
      wrong: (a) =>
        ["reset_candidate", "reset_server", "end_exam"].includes(a.type) ||
        (a.type === "relogin" && a.payload.examNo !== n),
    };
  },
  (r) => {
    const a = pickNo(r);
    const b = pickNo(r, [a]);
    const n = no(a);
    return {
      id: "infraction", title: "Candidate flagged by mistake", area: "Infractions", mustPass: false, timeLimit: 120,
      situation: `The invigilator confirms that candidate ${n} was flagged by mistake. It was a false alarm. Sort it out without affecting any other candidate.`,
      prepare: () => {
        const s = stageState("writing");
        const rec = (examNo, reason, i) => ({ id: `i${i}`, examNo, reason, at: i });
        s.infractions = [
          rec(n, "Switched browser tab", 1), rec(n, "Left exam window", 2),
          rec(n, "Switched browser tab", 3), rec(no(b), "Copy / paste attempt", 4),
        ];
        return s;
      },
      steps: [{ match: is("unflag", { examNo: n }) }],
      wrong: (x) =>
        ["reset_candidate", "reset_server", "end_exam"].includes(x.type) ||
        (x.type === "unflag" && x.payload.examNo !== n),
    };
  },
  (r) => {
    const a = pickNo(r);
    const n = no(a);
    const k = 20 + Math.floor(r() * 70);
    return {
      id: "mistake", title: "Candidate submitted by mistake", area: "Candidate management", mustPass: true, timeLimit: 180,
      situation: `Candidate ${n} pressed Submit by accident after answering only ${k} questions. They need to be able to write the exam again.`,
      prepare: () => {
        const s = stageState("writing");
        s.candidates = s.candidates.map((c) => (c.examNo === n ? { ...c, status: "submitted", answered: k } : c));
        return s;
      },
      steps: [
        { match: is("reset_candidate", { examNo: n }) },
        { match: is("relogin", { examNo: n }) },
      ],
      wrong: (x) =>
        ["reset_server", "end_exam"].includes(x.type) ||
        (x.type === "reset_candidate" && x.payload.examNo !== n),
    };
  },
  () => ({
    id: "close", title: "Exam time is over", area: "Exam closure", mustPass: true, timeLimit: 180,
    situation: "Exam time is over. Make sure the exam is closed and the results of both sessions reach the central server.",
    prepare: () => stageState("writing"),
    steps: [
      { match: is("end_exam") },
      { match: is("upload", { session: "Session 1" }) },
      { match: is("upload", { session: "Session 2" }) },
    ],
    wrong: (a) => ["reset_server", "reset_candidate"].includes(a.type),
  }),
];

export const TASK_COUNT = FACTORIES.length;
export function buildTask(seed, index) {
  return FACTORIES[index](rng(seed + index * 7919));
}

export function gradeTask(task, actions, { errors, timeSec, timedOut }) {
  const total = task.steps.length;
  const done = exerciseProgress(task, actions);
  const completed = done >= total;
  const harmful = wrongCount(task, actions);
  const mistakes = (task.ignoreErrors ? 0 : errors) + harmful;
  const score = completed
    ? Math.max(50, 100 - STANDARD.penaltyPerMistake * mistakes)
    : Math.round((49 * done) / total);
  return {
    id: task.id, title: task.title, area: task.area, mustPass: task.mustPass, situation: task.situation,
    stepsDone: done, stepsTotal: total, mistakes, timeSec, timedOut, score,
    passed: completed && score >= STANDARD.taskPass,
  };
}

export function buildReport(results) {
  const overall = Math.round(results.reduce((a, r) => a + r.score, 0) / results.length);
  const mustPassMet = results.every((r) => !r.mustPass || r.passed);
  let level;
  if (mustPassMet && overall >= STANDARD.highlyCompetent) level = "Highly Competent";
  else if (mustPassMet && overall >= STANDARD.competent) level = "Competent";
  else if (overall >= STANDARD.remediation) level = "Requires Remediation";
  else level = "Not Competent";
  const byArea = {};
  results.forEach((r) => (byArea[r.area] ||= []).push(r.score));
  const profile = Object.entries(byArea).map(([area, v]) => ({
    area, score: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
  }));
  return { overall, level, passed: level === "Competent" || level === "Highly Competent", mustPassMet, profile };
}
