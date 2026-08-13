/**
 * GET  /api/state?role=trainer|therapist   the whole app state, sanitised
 * POST /api/state                          { courses }  — trainer writes
 *
 * One document in, one document out. Crude on purpose: at this size the
 * simplicity is worth more than the round trips it costs.
 */

import { readState, writeState, sanitize, json } from "./_lib/store.js";
import { USERS } from "./_lib/seed.js";

export default async function handler(req, res) {
  const state = await readState();

  if (req.method === "GET") {
    const trainer = req.query.role === "trainer";
    const clean = sanitize(state, { trainer });

    // Rule 2: therapists only see published courses.
    // Rule 3: and never a course they authored themselves.
    if (!trainer) {
      const me = USERS.therapist.id;
      clean.courses = clean.courses.filter(
        (c) => c.status === "published" && c.createdBy !== me
      );
    }
    return json(res, { ...clean, users: USERS });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || !Array.isArray(body.courses)) {
      return json(res, { error: "expected { courses: [] }" }, 400);
    }

    // Rule 1: publishing locks the course. A published course cannot be
    // overwritten by a later save — enforced here, not just in the UI, because
    // the UI is not where a rule like this should live.
    const locked = new Map(
      state.courses.filter((c) => c.status === "published").map((c) => [c.id, c])
    );
    const courses = body.courses.map((c) => locked.get(c.id) ?? c);

    // Answers are stripped on the way out, so an edit to a published course
    // could otherwise wipe its answer key. Locked courses keep the stored copy.
    for (const incoming of body.courses) {
      if (locked.has(incoming.id) || incoming.status !== "published") continue;
      // Newly published this save: keep the answers the trainer just wrote.
      const idx = courses.findIndex((c) => c.id === incoming.id);
      if (idx >= 0) courses[idx] = { ...incoming, publishedAt: today() };
    }

    await writeState({ ...state, courses });
    return json(res, { ok: true });
  }

  return json(res, { error: "method not allowed" }, 405);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
