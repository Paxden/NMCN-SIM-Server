// Only the pure helpers the grader needs (the client's exercises.js also holds UI exercise definitions).
export const is = (type, payload = {}) => (a) =>
  a.type === type && Object.entries(payload).every(([k, v]) => a.payload?.[k] === v);

export function exerciseProgress(ex, actions) {
  let i = 0;
  for (const a of actions) {
    if (i < ex.steps.length && ex.steps[i].match(a)) i++;
  }
  return i;
}

export function wrongCount(ex, actions) {
  return ex.wrong ? actions.filter(ex.wrong).length : 0;
}
