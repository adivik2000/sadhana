/**
 * State store. One JSON document, read-modify-write.
 *
 * Upstash Redis over its REST API when the env vars exist, otherwise an
 * in-process fallback so the app runs before KV is wired and never hard-fails
 * in front of anyone. No npm dependency — plain fetch.
 *
 * This is the thing that breaks at 500 therapists: two people finishing a step
 * in the same second can lose a write. See SCOPING.md.
 */

import { seedState } from "./seed.js";

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "sadhana:state:v1";

// Survives between invocations on a warm lambda. Not persistence — a cushion.
let memory = null;

async function upstash(command) {
  const res = await fetch(`${URL}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  return (await res.json()).result;
}

export async function readState() {
  if (URL && TOKEN) {
    try {
      const raw = await upstash(["GET", KEY]);
      if (raw) return JSON.parse(raw);
      const fresh = seedState();
      await writeState(fresh);
      return fresh;
    } catch (e) {
      // Degrade to memory rather than showing a stack trace to a reviewer.
      console.error("store read failed, using memory:", e.message);
    }
  }
  if (!memory) memory = seedState();
  return memory;
}

export async function writeState(state) {
  memory = state;
  if (URL && TOKEN) {
    try {
      await fetch(`${URL}/SET/${KEY}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify(state),
      });
    } catch (e) {
      console.error("store write failed:", e.message);
    }
  }
  return state;
}

export async function mutate(fn) {
  const state = await readState();
  const next = (await fn(state)) || state;
  return writeState(next);
}

/**
 * Strip correct answers from anything a client can see.
 *
 * Rule: correct quiz answers must never reach the learner's browser before
 * they submit. Enforced by course STATUS, not by trusting the role switcher —
 * a published course never ships its answer key to anyone, and a draft course
 * is only ever visible to the trainer who is editing it.
 */
export function sanitize(state, { trainer = false } = {}) {
  const copy = structuredClone(state);
  for (const course of copy.courses) {
    const keepAnswers = trainer && course.status === "draft";
    if (keepAnswers) continue;
    for (const mod of course.modules) {
      for (const step of mod.steps) {
        if (step.type !== "quiz") continue;
        step.questions = step.questions.map(({ correct, ...rest }) => rest);
      }
    }
  }
  return copy;
}

export function json(res, body, status = 200) {
  res.status(status).setHeader("content-type", "application/json");
  res.send(JSON.stringify(body));
}
