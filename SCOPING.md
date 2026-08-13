# Sadhana — scoping note

*साधना — practice. The work you repeat until it belongs to you.*

The training platform for a luxury salon and spa brand. Written before any code.

---

## Who the learners are

They withheld this, so this is my read of it.

1. **The new therapist (0–6 months).** Hired, on payroll, and **cannot touch a
   paying client yet.** She is the reason this exists. Every day she is not
   signed off costs the business money and costs her confidence. She needs one
   thing at a time, zero ambiguity about what is next, and visible proof she is
   getting closer.
2. **The experienced therapist learning a new protocol.** Already competent,
   adding Balinese deep tissue to her repertoire. She will resent being made to
   crawl. The quiz is her real gate, not the video.
3. **The senior therapist who builds the training.** Excellent at the treatment,
   time-poor, and not a content designer. Facing an empty course builder is
   where this platform dies. **The AI draft exists for her**, not as a demo
   feature — it turns a blank page into something to react to.

The thing being modelled is not "courses." It is **the competence gate**: nobody
touches a client until the system says they are ready, and that claim has to be
honest enough to bet a client's body on.

## What is in v1

- **Role switcher** — trainer / therapist. No login.
- **Trainer**: course → modules → ordered steps. Five step types: video (embed
  by URL), rich text, image, practice task, quiz. Add, reorder, edit, publish.
  **Publishing locks the course.**
- **AI-assisted drafting**: describe a course in plain language, get modules,
  steps and quiz questions back **as editable content in the builder** — not as
  text on a screen. Reviewed and changed before it is published.
- **Therapist**: sees published courses only. Steps unlock one at a time. Video
  completes on watching, quiz on passing, tasks on confirming. Progress persists
  across a closed browser and **reflects reality, not optimism** — failing is
  allowed and retaking is expected.
- **Quizzes are graded server-side. Correct answers are never sent to the
  learner's browser.**
- **One course built properly**: Hot Stone Massage, Level 1 — seeded and
  already published, so the app is never empty. Deliberately a *different*
  treatment from the AI-draft demo prompt below, so drafting that one live
  doesn't look like a duplicate of something already on screen.
- **The AI-draft textarea comes pre-filled** with "Balinese deep tissue, level
  2, for therapists with 6 months experience" — one click drafts a second,
  visibly fresh course live, which is the actual demo of the AI feature.

## What I am deliberately leaving out, and why

| Cut | Why |
|---|---|
| Real authentication | A role switcher demonstrates every rule that matters. Auth is a solved, boring problem and would eat a third of the clock. |
| Media upload / storage | They said not to build storage. Video and images are URLs. |
| Trainer analytics — who completed what | It is a whole second product surface. It is also **the first thing I would build next**, because "who is signed off" is the question the business actually asks. |
| Course versioning, unpublish, edit-after-publish | Publishing locks. Adding versioning to that is a data-model problem, not a UI one, and it does not change the demo. |
| Certificates, notifications, multi-language, offline | None of these are the competence gate. |
| More than one seeded course | Depth over breadth. One real course beats six stubs. |
| A WYSIWYG toolbar for rich-text steps | The trainer authors structured HTML directly (`<p>`, `<ul>`, `<strong>`, `<h3>`); the learner sees it fully formatted — bullets, bold, headings all render. Only the *authoring* input is textarea-shaped, not the *output*. A real toolbar needs a library we don't have without an install, or 20+ minutes to hand-build selection-wrapping buttons. Named here rather than discovered at the walkthrough. |

## Where it breaks at 500 therapists

State is a single JSON document in KV, read-modify-write. Two therapists
finishing a step in the same second can lose one write. The fix is per-learner
progress keys and a relational store for courses — an hour of work, not a
rewrite. Video is embedded from third parties, so playback scales for free;
"watched" is a client-reported claim and at 500 people with a competence gate
attached, that needs real playback telemetry. And the honest limit is not
technical: **a quiz is a weak proxy for whether someone can actually perform a
massage.** The senior therapist's sign-off is the real gate, and v2 should model
it explicitly.
