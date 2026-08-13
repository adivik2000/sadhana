/**
 * POST /api/grade   { courseId, stepId, answers: {qId: optionIndex} }
 *
 * Grading happens here and only here. The answer key never leaves the server
 * for a published course, so a learner cannot read it out of the page source,
 * the network tab, or app state. This is rule 4, and it is the reason this app
 * has a backend at all.
 *
 * Progress is written in the same call: an attempt that is not recorded is an
 * attempt that did not honestly happen.
 */

import { readState, writeState, json } from "./_lib/store.js";
import { USERS } from "./_lib/seed.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "POST only" }, 405);

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { courseId, stepId, answers = {} } = body || {};

  const state = await readState();
  const course = state.courses.find((c) => c.id === courseId);
  const step = course?.modules.flatMap((m) => m.steps).find((s) => s.id === stepId);

  if (!step || step.type !== "quiz") {
    return json(res, { error: "no such quiz step" }, 404);
  }

  let right = 0;
  const perQuestion = step.questions.map((q) => {
    const given = answers[q.id];
    const ok = given === q.correct;
    if (ok) right += 1;
    // Tell them WHICH they got wrong, but never what the right answer was —
    // otherwise a retake is just a memory test of the previous response.
    return { id: q.id, correct: ok };
  });

  const score = Math.round((right / step.questions.length) * 100);
  const passed = score >= (step.passMark ?? 70);

  // Record the attempt. Failing is allowed and expected; what is not allowed
  // is progress that flatters the learner.
  const me = USERS.therapist.id;
  const progress = state.progress ?? {};
  const mine = (progress[me] ??= {});
  const forCourse = (mine[courseId] ??= { completed: [], attempts: {} });
  (forCourse.attempts[stepId] ??= []).push({
    score,
    passed,
    at: new Date().toISOString(),
  });
  if (passed && !forCourse.completed.includes(stepId)) {
    forCourse.completed.push(stepId);
  }

  await writeState({ ...state, progress });

  return json(res, {
    score,
    passed,
    passMark: step.passMark ?? 70,
    right,
    total: step.questions.length,
    perQuestion,
    attempts: forCourse.attempts[stepId].length,
  });
}
