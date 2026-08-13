# Build plan — Sadhana

Approve this, then code generation goes to Sonnet agents working in parallel
against the frozen contracts below.

---

## Status

**Done (Opus — the rule-critical parts, deliberately not delegated):**

| File | What it guarantees |
|---|---|
| `SCOPING.md` | Committed before any code, as required |
| `api/_lib/store.js` | KV + memory fallback; `sanitize()` strips answer keys |
| `api/_lib/seed.js` | Hot Stone Massage L1 — 3 modules, 8 steps, all 5 types (deliberately not "Balinese", which is the pre-filled AI-draft prompt) |
| `api/state.js` | Rules 1, 2, 3 enforced server-side |
| `api/grade.js` | Rule 4 — server-only grading, honest attempt log |

**Remaining — to Sonnet:**

| # | Task | Agent | Files |
|---|---|---|---|
| A | Gemini course drafting | `draft-api` | `api/draft.js` |
| B | Brand, shell, CSS | `frontend-shell` | `public/index.html`, `public/style.css` |
| C | App logic — both roles | `frontend-logic` | `public/app.js` |

A, B and C touch disjoint files and share the frozen contracts, so they run at
the same time without collision.

---

## The four rules, and where each is enforced

1. **Draft-only editing; publishing locks** → `api/state.js`, published courses
   are never overwritten by a later save
2. **Therapists see published only** → `api/state.js`, filtered server-side
3. **Trainer cannot take own course** → `api/state.js`, `createdBy !== me`
4. **Answers never reach the learner** → `sanitize()` strips by course *status*,
   not by trusting the role switcher

Rule 4 is the architectural one. Say it out loud at the walkthrough.

---

## FROZEN — API contract

Agents must not change these shapes.

```
GET /api/state?role=trainer|therapist
→ { courses: [Course], progress: {}, users: {trainer:{id,name}, therapist:{...}} }

POST /api/state           { courses: [Course] }              → { ok: true }
POST /api/grade           { courseId, stepId, answers: {qId: idx} }
→ { score, passed, passMark, right, total,
    perQuestion: [{id, correct}], attempts }
POST /api/draft           { description }                    → { course: Course }
```

```js
Course = { id, title, summary, level, duration,
           status: "draft"|"published", createdBy, createdByName,
           publishedAt, modules: [Module] }
Module = { id, title, steps: [Step] }

Step = { id, type, title, ...payload }
  text  → { html }
  video → { url, note }
  image → { url, caption }
  task  → { instructions, items: [string] }
  quiz  → { passMark, questions: [{ id, q, options: [string], correct? }] }
```

`correct` is present **only** for a draft course fetched with `role=trainer`.
The learner UI must never expect it.

---

## FROZEN — DOM contract

So B and C can be written simultaneously.

```
#app                     root
#role-switch             button — toggles trainer/therapist
#view-trainer            trainer surface  (hidden via [hidden])
#view-learner            learner surface
#course-list             <div> — cards injected by app.js
#builder                 course builder
#builder-modules         <div> — modules/steps injected
#ai-panel                AI drafting panel
#ai-input                <textarea>
#ai-go                   button
#ai-status               <p> — status/errors
#player                  learner step player
#player-step             <div> — current step rendered here
#player-progress         <div> — progress bar + counts
#toast                   <div> — transient messages
```

Class hooks: `.card .step .step--locked .step--done .btn .btn--primary
.pill .quiz-option .is-selected`

---

## Brand

**Sadhana** — साधना, practice. Dark, warm stone, one metallic accent. System
fonts only (serif display vs clean sans) so there is no font-loading risk.

```css
--bg:#12100E  --surface:#1B1815  --line:#2E2823
--gold:#C8A96A  --text:#F2EDE4  --muted:#9A9086
--display: "Iowan Old Style", Palatino, Georgia, serif;
--body: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
```

Learner surface: **one step at a time, centred, calm, no chrome.** Explicitly
not an admin dashboard — the brief calls this out.

---

## Time

| Block | Ends at |
|---|---|
| Now → +12 | A, B, C run in parallel |
| +12 → +20 | I integrate, run locally, **deploy live URL** |
| +20 → +40 | Fix what the three agents got wrong; real end-to-end pass |
| +40 → +55 | AI drafting proven live; polish learner surface |
| +55 → +70 | Full walkthrough rehearsal, redeploy |
| +70 → +90 | Buffer. Email the URL. |

**Deploy at ~minute 20, not at the end.** Their 10-minute deploy budget assumes
deploying last; that is how people end up submitting nothing.

---

## Blocking on you

1. **Gemini key** → paste into `.env` as `GEMINI_API_KEY=...` (gitignored). Task
   A is written against it but cannot be tested without it.
2. **`npx vercel login`** — interactive, so you must run it. Do it now, in a
   spare terminal, so it is not blocking at minute 20.
3. Optional: Upstash KV. Without it the app still runs on the memory fallback;
   state just will not survive a cold lambda.

---

## Verification before submitting

- [ ] Trainer: AI-draft a course, edit a step, publish → builder locks
- [ ] Switch to therapist → the course you authored is **not** listed
- [ ] Learner: step 2 locked until step 1 done
- [ ] Quiz: fail it, retake, pass — progress reflects reality
- [ ] Network tab: **no `correct` field anywhere** in any response
- [ ] Reload mid-course → progress survived
- [ ] Live URL works in a fresh browser
