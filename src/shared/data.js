export const EXAM = {
  name: "Professional Nursing Examination, November 2026",
  description:
    "Computer-based objective test for the Professional Nursing Examination. Candidates write in two sessions.",
  sessions: ["Session 1", "Session 2"],
};
export const TOTAL_Q = 200;
const FIRST = ["Adaeze", "Chinedu", "Funke", "Ibrahim", "Ngozi", "Tunde", "Amaka", "Emeka", "Hauwa", "Segun", "Blessing", "Yusuf", "Chiamaka", "Kelechi", "Zainab", "Femi", "Ifeoma", "Musa", "Titilayo", "Obinna"];
const LAST = ["Okafor", "Adeyemi", "Bello", "Nwosu", "Eze", "Balogun", "Okonkwo", "Ahmed", "Ogunleye", "Umeh", "Ibekwe", "Lawal", "Chukwu", "Afolabi", "Danjuma"];
export const mkCandidate = (i) => ({
  examNo: `NSG26${String(i).padStart(3, "0")}`,
  name: `${LAST[i % LAST.length]} ${FIRST[(i * 7) % FIRST.length]}`.toUpperCase(),
  session: EXAM.sessions[(i - 1) % 2],
  status: "idle",
  answered: 0,
});
export const makeCandidates = (n, start = 1) => Array.from({ length: n }, (_, k) => mkCandidate(start + k));
export const numOf = (c) => Number(c.examNo.slice(-3));
export const freshState = () => ({
  mode: "menu", tour: null, exercise: null, assessment: null, online: true, server: null,
  loggedIn: false, downloaded: false, activated: false, sessionActive: {}, ended: false,
  uploaded: {}, candidates: [], infractions: [], actions: [], syncCount: 0,
});
const ORDER = ["start","created","loggedIn","downloaded","activated","oneSession","writing","flagged","ended","uploaded"];
export function stageState(name) {
  const at = (n) => ORDER.indexOf(name) >= ORDER.indexOf(n);
  const s = freshState();
  if (at("created")) s.server = { id: "DEMO01", password: "demo" };
  if (at("loggedIn")) s.loggedIn = true;
  if (at("downloaded")) { s.downloaded = true; s.candidates = makeCandidates(30); }
  if (at("activated")) s.activated = true;
  if (name === "oneSession") {
    s.sessionActive = { "Session 1": true };
    s.candidates = s.candidates.map((c) =>
      c.session === "Session 1" ? { ...c, status: "writing", answered: 20 + ((numOf(c) * 53) % 120) } : c);
  }
  if (at("writing")) {
    s.sessionActive = { "Session 1": true, "Session 2": true };
    s.candidates = s.candidates.map((c) => {
      const n = numOf(c); const sub = n % 7 === 0;
      return { ...c, status: sub ? "submitted" : "writing", answered: sub ? 150 + ((n * 17) % 51) : 30 + ((n * 53) % 150) };
    });
  }
  if (name === "flagged") {
    s.infractions = [
      { id: "i1", examNo: "NSG26009", reason: "Switched browser tab", at: 1 },
      { id: "i2", examNo: "NSG26009", reason: "Left exam window", at: 2 },
      { id: "i3", examNo: "NSG26009", reason: "Switched browser tab", at: 3 },
      { id: "i4", examNo: "NSG26012", reason: "Copy / paste attempt", at: 4 },
    ];
  }
  if (name === "ended" || name === "uploaded") {
    s.ended = true;
    s.candidates = s.candidates.map((c) => ({ ...c, status: "submitted", answered: Math.max(c.answered, 120) }));
  }
  if (name === "uploaded") s.uploaded = { "Session 1": true, "Session 2": true };
  return s;
}
