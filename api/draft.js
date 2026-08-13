// POST /api/draft — turns a trainer's plain-language course description into a
// structured, editable Course object for the Sadhana builder.
//
// Why validation exists: this is the seam between an LLM and a UI that renders
// arbitrary structured content as editable form fields. The model is asked for
// strict JSON but is not a reliable source of truth — it can omit fields, invent
// step types, return the wrong option count on a quiz, or wrap the JSON in a
// markdown fence. Anything that reaches the frontend unvalidated becomes either
// a crash in the builder or, worse, a quiz that silently can't be graded. So we
// parse defensively and repair/drop rather than trust, and only fail the request
// if nothing usable survives.

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const STEP_TYPES = new Set(["text", "video", "image", "task", "quiz"]);

const SYSTEM = `You are an instructional designer for Sadhana, the internal training platform of a luxury salon and spa brand. You write course drafts for a trainer to review and edit — never for a client to read.

Audience: hands-on therapists delivering real treatments to paying clients. Write for a senior spa therapist who would be irritated by fluff. Real technique, real timings, real pressure and angles, what commonly goes wrong, what the client feels, and the contraindications that actually matter for the subject. Respect any stated experience level or grade in the brief and pitch the depth accordingly — do not explain basics to a level 2/6-months-experience audience, and do not assume expertise for a brand-new starter.

Structure rules:
- 3 to 4 modules, each with 2 to 4 steps.
- Mix step types across the course. Do not make every step "text".
- Include at least one "task" step: a short checklist of things the therapist physically does or checks during practice, phrased as imperative actions.
- Include at least one "video" step: a placeholder for footage the trainer will paste in later. Its "note" must say precisely what the therapist should watch for (e.g. hand position at a specific point, timing of a transition), not "watch the video".
- The course must end with a final module that is a quiz module: one "quiz" step with 3 to 5 scenario-based questions. Each question presents a judgement call a therapist would actually face ("A client mentions X mid-treatment, you should...") — never vocabulary or definition recall. Exactly 4 options per question, all plausible to someone who hasn't studied, with exactly one correct answer.
- Text steps must teach something specific and non-obvious: a timing in seconds or minutes, a pressure level, an angle, a sequencing decision, a failure mode and its fix. Never generic filler like "Introduction to massage" or "Welcome to the module".
- Surface contraindications and safety checks wherever the treatment subject warrants them (heat, pressure, allergens, medical conditions, pregnancy, skin conditions, etc.) — as part of the relevant step, not bolted on.
- Write in British English, second person, calm and direct. No marketing language, no emoji, no exclamation marks, no flattery, no filler sentences.

Output STRICT JSON only, matching this shape exactly, with no markdown fence and no commentary:
{
  "title": string,
  "summary": string,
  "level": string,
  "duration": string,
  "modules": [
    {
      "title": string,
      "steps": [
        { "type": "text", "title": string, "html": string }
        | { "type": "video", "title": string, "note": string }
        | { "type": "image", "title": string, "caption": string }
        | { "type": "task", "title": string, "instructions": string, "items": [string] }
        | { "type": "quiz", "title": string, "passMark": number, "questions": [{ "q": string, "options": [string, string, string, string], "correct": number }] }
      ]
    }
  ]
}
"html" fields may only use <p>, <ul>, <ol>, <li>, <strong>, <em>, <h3> tags — nothing else. Do not include ids anywhere; they are assigned afterwards.`;

// Strips a ```json ... ``` (or bare ```) fence some models wrap around JSON output.
function stripFence(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function asString(v, fallback = "") {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((s) => typeof s === "string" && s.trim());
}

// Coerces a single raw step into a valid Step, or returns null if it cannot
// be salvaged. Unknown/malformed steps are dropped rather than passed through,
// since the builder renders each type with a dedicated, type-specific form.
function repairStep(raw, sIndex) {
  if (!raw || typeof raw !== "object" || !STEP_TYPES.has(raw.type)) return null;
  const id = `s-${sIndex}`;
  const title = asString(raw.title, "Untitled step");

  switch (raw.type) {
    case "text": {
      const html = asString(raw.html);
      if (!html) return null;
      return { id, type: "text", title, html };
    }
    case "video":
      return { id, type: "video", title, url: "", note: asString(raw.note, "Note what to watch for.") };
    case "image":
      return { id, type: "image", title, url: "", caption: asString(raw.caption, title) };
    case "task": {
      const items = asStringArray(raw.items);
      if (!items.length) return null;
      return { id, type: "task", title, instructions: asString(raw.instructions, "Complete the following in practice:"), items };
    }
    case "quiz": {
      const questions = (Array.isArray(raw.questions) ? raw.questions : [])
        .map((q, qIndex) => repairQuestion(q, qIndex, id))
        .filter(Boolean);
      if (!questions.length) return null;
      const passMark = Number.isFinite(raw.passMark) ? raw.passMark : 75;
      return { id, type: "quiz", title, passMark, questions };
    }
    default:
      return null;
  }
}

function repairQuestion(raw, qIndex, stepId) {
  if (!raw || typeof raw !== "object") return null;
  const q = asString(raw.q);
  const options = asStringArray(raw.options);
  if (!q || options.length !== 4) return null;
  const correct = Number.isInteger(raw.correct) && raw.correct >= 0 && raw.correct <= 3 ? raw.correct : 0;
  return { id: `${stepId}-q-${qIndex}`, q, options, correct };
}

function repairModule(raw, mIndex) {
  if (!raw || typeof raw !== "object") return null;
  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s, sIndex) => repairStep(s, `${mIndex}-${sIndex}`))
    .filter(Boolean)
    .map((s, i) => ({ ...s, id: `s-${mIndex}-${i}` }));
  if (!steps.length) return null;
  return { id: `m-${mIndex}`, title: asString(raw.title, `Module ${mIndex + 1}`), steps };
}

function repairCourse(raw, description) {
  if (!raw || typeof raw !== "object") return null;
  const modules = (Array.isArray(raw.modules) ? raw.modules : [])
    .map((m, mIndex) => repairModule(m, mIndex))
    .filter(Boolean);
  if (!modules.length) return null;

  return {
    id: `c-${Date.now().toString(36)}`,
    title: asString(raw.title, description.slice(0, 60)),
    summary: asString(raw.summary, description.slice(0, 200)),
    level: asString(raw.level, "Not specified"),
    duration: asString(raw.duration, "Not specified"),
    status: "draft",
    createdBy: "u-trainer-you",
    createdByName: "You",
    publishedAt: null,
    modules,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const description = asString(req.body?.description);
  if (!description) {
    res.status(400).json({ error: "description is required" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not set" });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  let text;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents: [{ parts: [{ text: description }] }],
          generationConfig: { response_mime_type: "application/json", temperature: 0.4 },
        }),
        signal: controller.signal,
      }
    );

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      res.status(502).json({ error: `Gemini request failed (${r.status}): ${body.slice(0, 300)}` });
      return;
    }

    const data = await r.json();
    text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: "Gemini returned no content" });
      return;
    }
  } catch (err) {
    const timedOut = err?.name === "AbortError";
    res.status(502).json({ error: timedOut ? "Gemini request timed out" : `Gemini request failed: ${err.message}` });
    return;
  } finally {
    clearTimeout(timeout);
  }

  let raw;
  try {
    raw = JSON.parse(stripFence(text));
  } catch {
    res.status(502).json({ error: "Gemini did not return valid JSON" });
    return;
  }

  const course = repairCourse(raw, description);
  if (!course) {
    res.status(502).json({ error: "Gemini's draft could not be turned into a usable course" });
    return;
  }

  res.status(200).json({ course });
}
