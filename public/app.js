// =============================================================================
// Sadhana — trainer/therapist training platform. Vanilla ES module, no build.
// Sections: state, api, render-trainer, render-builder, render-learner,
//           render-player, quiz, progress, events, boot.
// =============================================================================

// ----------------------------------------------------------------------------
// state
// ----------------------------------------------------------------------------
// Single in-memory store. `progress` is whatever the server hands back on
// GET /api/state — its exact per-step shape isn't nailed down by the brief,
// so every read of it goes through the defensive helpers in the "progress"
// section below instead of assuming a shape here.
const state = {
  role: 'trainer',
  courses: [],
  progress: {},
  users: {},
  builderCourseId: null,   // course currently open in the builder
  playerCourseId: null,    // course currently open in the player
  playerIndex: {},         // courseId -> index of step currently shown
  quizAnswers: {},         // `${courseId}:${stepId}` -> { qId: optionIndex }
  quizResults: {},         // `${courseId}:${stepId}` -> last /api/grade response
  taskChecks: {},          // `${courseId}:${stepId}` -> { itemIndex: bool }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Escape everything by default — the one deliberate exception is the raw
// `html` field on text steps, handled where it's rendered (see render-player).
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function toast(message, isError = false) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', isError);
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 3500);
}

// ----------------------------------------------------------------------------
// api
// ----------------------------------------------------------------------------
async function fetchJSON(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    toast(`Network error: ${err.message}`, true);
    throw err;
  }
  if (!res.ok) {
    toast(`Request failed (${res.status})`, true);
    throw new Error(`${res.status} ${res.statusText}`);
  }
  try {
    return await res.json();
  } catch (err) {
    toast('Server returned invalid data', true);
    throw err;
  }
}

const api = {
  getState: (role) => fetchJSON(`/api/state?role=${encodeURIComponent(role)}`),
  saveState: (courses) => fetchJSON('/api/state', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courses }),
  }),
  draft: (description) => fetchJSON('/api/draft', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  }),
  grade: (courseId, stepId, answers) => fetchJSON('/api/grade', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId, stepId, answers }),
  }),
};

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api.saveState(state.courses);
      toast('Saved');
    } catch { /* toast already shown by fetchJSON */ }
  }, 700);
}

async function loadState() {
  try {
    const data = await api.getState(state.role);
    state.courses = data.courses || [];
    state.progress = data.progress || {};
    state.users = data.users || {};
  } catch { /* toast already shown */ }
}

// ----------------------------------------------------------------------------
// progress — normalizes server progress + localStorage into a single answer
// ----------------------------------------------------------------------------
const LOCAL_KEY = 'sadhana:progress:v1';

function loadLocalProgress() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; }
  catch { return {}; }
}
function saveLocalProgress(map) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(map)); } catch { /* storage unavailable, non-fatal */ }
}

// Server progress shape isn't specified beyond `progress:{}`; accept either
// progress[courseId][stepId] === true, or === { done, passed }.
function serverStepDone(courseId, stepId) {
  const course = state.progress?.[courseId];
  const v = course?.[stepId];
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'object') return !!(v.done || v.passed);
  return false;
}

function isStepDone(courseId, step) {
  if (step.type === 'quiz') {
    const local = state.quizResults[`${courseId}:${step.id}`];
    return !!local?.passed || serverStepDone(courseId, step.id);
  }
  const local = loadLocalProgress()[courseId]?.[step.id];
  return !!local || serverStepDone(courseId, step.id);
}

function markNonQuizDone(courseId, stepId) {
  const map = loadLocalProgress();
  map[courseId] = map[courseId] || {};
  map[courseId][stepId] = true;
  saveLocalProgress(map);
}

function courseProgressSummary(course) {
  const steps = course.modules.flatMap((m) => m.steps);
  const done = steps.filter((s) => isStepDone(course.id, s)).length;
  return { done, total: steps.length };
}

// ----------------------------------------------------------------------------
// render-trainer
// ----------------------------------------------------------------------------
function renderTrainerHome() {
  state.builderCourseId = null;
  $('#builder').hidden = true;
  $('#course-list-trainer').hidden = false;
  const list = $('#course-list-trainer');
  if (!state.courses.length) {
    list.innerHTML = '<p class="pill">No courses yet — draft one with AI or add a module below.</p>';
    return;
  }
  list.innerHTML = state.courses.map((c) => {
    const steps = c.modules.reduce((n, m) => n + m.steps.length, 0);
    return `
      <div class="card" data-course-id="${escapeHtml(c.id)}" data-action="open-builder">
        <p class="card__eyebrow">By ${escapeHtml(c.createdByName || 'Unknown')}</p>
        <h3>${escapeHtml(c.title)}</h3>
        <span class="pill">${escapeHtml(c.status)}</span>
        <p>${escapeHtml(c.summary || '')}</p>
        <p>${c.modules.length} modules · ${steps} steps</p>
      </div>`;
  }).join('');
}

// ----------------------------------------------------------------------------
// render-builder
// ----------------------------------------------------------------------------
const STEP_TYPES = ['text', 'video', 'image', 'task', 'quiz'];

function findCourse(id) { return state.courses.find((c) => c.id === id); }
function findModule(course, moduleId) { return course.modules.find((m) => m.id === moduleId); }
function findStep(module, stepId) { return module.steps.find((s) => s.id === stepId); }

function openBuilder(courseId) {
  state.builderCourseId = courseId;
  $('#course-list-trainer').hidden = true;
  $('#builder').hidden = false;
  renderBuilder();
}

function stepFieldEditor(course, module, step) {
  const locked = course.status === 'published';
  const dis = locked ? 'disabled' : '';
  switch (step.type) {
    case 'text':
      return `<label>HTML content
        <textarea ${dis} data-role="step-field" data-field="html" data-module-id="${module.id}" data-step-id="${step.id}">${escapeHtml(step.html || '')}</textarea>
      </label>`;
    case 'video':
      return `
        <label>Video URL
          <input ${dis} type="text" data-role="step-field" data-field="url" data-module-id="${module.id}" data-step-id="${step.id}" value="${escapeHtml(step.url || '')}">
        </label>
        <label>Note
          <input ${dis} type="text" data-role="step-field" data-field="note" data-module-id="${module.id}" data-step-id="${step.id}" value="${escapeHtml(step.note || '')}">
        </label>`;
    case 'image':
      return `
        <label>Image URL
          <input ${dis} type="text" data-role="step-field" data-field="url" data-module-id="${module.id}" data-step-id="${step.id}" value="${escapeHtml(step.url || '')}">
        </label>
        <label>Caption
          <input ${dis} type="text" data-role="step-field" data-field="caption" data-module-id="${module.id}" data-step-id="${step.id}" value="${escapeHtml(step.caption || '')}">
        </label>`;
    case 'task':
      return `
        <label>Instructions
          <textarea ${dis} data-role="step-field" data-field="instructions" data-module-id="${module.id}" data-step-id="${step.id}">${escapeHtml(step.instructions || '')}</textarea>
        </label>
        <div class="task-items">
          ${(step.items || []).map((item, i) => `
            <div class="task-item-row">
              <input ${dis} type="text" data-role="task-item" data-module-id="${module.id}" data-step-id="${step.id}" data-item-index="${i}" value="${escapeHtml(item)}">
              <button ${dis} class="btn" data-action="delete-task-item" data-module-id="${module.id}" data-step-id="${step.id}" data-item-index="${i}">✕</button>
            </div>`).join('')}
        </div>
        <button ${dis} class="btn" data-action="add-task-item" data-module-id="${module.id}" data-step-id="${step.id}">+ Add item</button>`;
    case 'quiz':
      return `
        <label>Pass mark (%)
          <input ${dis} type="number" min="0" max="100" data-role="step-field" data-field="passMark" data-module-id="${module.id}" data-step-id="${step.id}" value="${step.passMark ?? 70}">
        </label>
        ${(step.questions || []).map((q) => `
          <div class="quiz-question-editor">
            <input ${dis} type="text" data-role="quiz-q" data-module-id="${module.id}" data-step-id="${step.id}" data-qid="${q.id}" value="${escapeHtml(q.q)}" placeholder="Question">
            ${q.options.map((opt, i) => `
              <div class="quiz-option-editor">
                <input ${dis} type="radio" name="correct-${q.id}" data-role="quiz-correct" data-module-id="${module.id}" data-step-id="${step.id}" data-qid="${q.id}" value="${i}" ${q.correct === i ? 'checked' : ''}>
                <input ${dis} type="text" data-role="quiz-opt" data-module-id="${module.id}" data-step-id="${step.id}" data-qid="${q.id}" data-opt-index="${i}" value="${escapeHtml(opt)}">
              </div>`).join('')}
            <button ${dis} class="btn" data-action="delete-question" data-module-id="${module.id}" data-step-id="${step.id}" data-qid="${q.id}">Delete question</button>
          </div>`).join('')}
        <button ${dis} class="btn" data-action="add-question" data-module-id="${module.id}" data-step-id="${step.id}">+ Add question</button>`;
    default:
      return '';
  }
}

function renderBuilder() {
  const course = findCourse(state.builderCourseId);
  const builder = $('#builder');
  if (!course) { builder.innerHTML = ''; return; }
  const locked = course.status === 'published';
  const dis = locked ? 'disabled' : '';

  const header = `
    <div class="card">
      <button class="btn" data-action="back-to-list">← Back</button>
      <label>Title
        <input ${dis} type="text" data-role="course-title" value="${escapeHtml(course.title)}">
      </label>
      <label>Summary
        <textarea ${dis} data-role="course-summary">${escapeHtml(course.summary || '')}</textarea>
      </label>
      <span class="pill">${escapeHtml(course.status)}</span>
      ${locked
        ? '<p class="pill">Published — locked</p>'
        : `<button class="btn" data-action="save-draft">Save draft</button>
           <button class="btn btn--primary" data-action="publish">Publish</button>`}
    </div>`;

  const modulesHtml = course.modules.map((m) => `
    <div class="card" data-module-id="${m.id}">
      <input ${dis} type="text" data-role="module-title" data-module-id="${m.id}" value="${escapeHtml(m.title)}">
      <button ${dis} class="btn" data-action="delete-module" data-module-id="${m.id}">Delete module</button>
      <div class="steps">
        ${m.steps.map((s, i) => `
          <div class="step" data-module-id="${m.id}" data-step-id="${s.id}">
            <input ${dis} type="text" data-role="step-title" data-module-id="${m.id}" data-step-id="${s.id}" value="${escapeHtml(s.title)}">
            <span class="pill">${escapeHtml(s.type)}</span>
            <button ${dis} class="btn" data-action="move-step-up" data-module-id="${m.id}" data-step-id="${s.id}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button ${dis} class="btn" data-action="move-step-down" data-module-id="${m.id}" data-step-id="${s.id}" ${i === m.steps.length - 1 ? 'disabled' : ''}>↓</button>
            <button ${dis} class="btn" data-action="delete-step" data-module-id="${m.id}" data-step-id="${s.id}">Delete</button>
            ${stepFieldEditor(course, m, s)}
          </div>`).join('')}
      </div>
      ${!locked ? `
        <select class="add-step-type" data-module-id="${m.id}">
          ${STEP_TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <button class="btn" data-action="add-step" data-module-id="${m.id}">+ Add step</button>` : ''}
    </div>`).join('');

  builder.innerHTML = header +
    `<div id="builder-modules">${modulesHtml}</div>` +
    (!locked ? '<button class="btn" data-action="add-module">+ Add module</button>' : '');
}

// ----------------------------------------------------------------------------
// render-learner
// ----------------------------------------------------------------------------
function renderLearnerHome() {
  state.playerCourseId = null;
  $('#player').hidden = true;
  $('#course-list-learner').hidden = false;
  const list = $('#course-list-learner');
  const published = state.courses.filter((c) => c.status === 'published');
  if (!published.length) {
    list.innerHTML = '<p class="pill">No published courses yet.</p>';
    return;
  }
  list.innerHTML = published.map((c) => {
    const { done, total } = courseProgressSummary(c);
    return `
      <div class="card" data-course-id="${escapeHtml(c.id)}" data-action="open-player">
        <p class="card__eyebrow">By ${escapeHtml(c.createdByName || 'Unknown')}</p>
        <h3>${escapeHtml(c.title)}</h3>
        <span class="pill">${done} of ${total} steps</span>
        <p>${escapeHtml(c.summary || '')}</p>
      </div>`;
  }).join('');
}

// ----------------------------------------------------------------------------
// render-player
// ----------------------------------------------------------------------------
function flatSteps(course) {
  return course.modules.flatMap((m) => m.steps.map((s) => ({ ...s, moduleId: m.id })));
}

function openPlayer(courseId) {
  state.playerCourseId = courseId;
  $('#course-list-learner').hidden = true;
  $('#player').hidden = false;
  renderPlayer();
}

function videoEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return url; // already an embeddable URL, or unrecognized — try it as-is
  } catch { return null; }
}

function renderPlayer() {
  const course = findCourse(state.playerCourseId);
  if (!course) return;
  const steps = flatSteps(course);
  const doneFlags = steps.map((s) => isStepDone(course.id, s));
  const firstIncomplete = doneFlags.indexOf(false);
  const lastAllowed = firstIncomplete === -1 ? steps.length - 1 : firstIncomplete;
  if (state.playerIndex[course.id] == null || state.playerIndex[course.id] > lastAllowed) {
    state.playerIndex[course.id] = lastAllowed;
  }
  const idx = state.playerIndex[course.id];
  const doneCount = doneFlags.filter(Boolean).length;

  // progress strip: text summary + one clickable pill per step, locked ones inert
  $('#player-progress').innerHTML = `
    <p>${doneCount} of ${steps.length} steps complete</p>
    <div class="step-nav">
      ${steps.map((s, i) => {
        const locked = i > lastAllowed;
        // .step-pip, not .step — these are small nav dots, not builder rows,
        // and must not inherit .step's row padding/layout.
        const cls = ['step-pip', doneFlags[i] ? 'step-pip--done' : '', locked ? 'step-pip--locked' : '', i === idx ? 'is-selected' : ''].filter(Boolean).join(' ');
        return `<span class="${cls}" ${locked ? '' : `data-action="goto-step" data-step-index="${i}"`}>${i + 1}</span>`;
      }).join('')}
    </div>`;

  const stepEl = $('#player-step');
  // Deliberately no .card wrapper here — a bordered box reads as "admin
  // dashboard", which the brief explicitly says to avoid. .player-step's own
  // centred, boxless typography (in style.css) is the intended look.
  if (steps.length && doneCount === steps.length) {
    stepEl.innerHTML = `
      <p class="player-step__eyebrow">Complete</p>
      <h2 class="player-step__title">${escapeHtml(course.title)}</h2>
      <div class="player-step__body">
        <p>Signed off as competent. Every step, including all quizzes, has been completed and passed.</p>
      </div>`;
    return;
  }
  const step = steps[idx];
  if (!step) { stepEl.innerHTML = ''; return; }
  stepEl.innerHTML = `
    <p class="player-step__eyebrow">Step ${idx + 1} of ${steps.length}</p>
    <h2 class="player-step__title">${escapeHtml(step.title)}</h2>
    <div class="player-step__body step-body" data-step-id="${step.id}">${stepBody(course, step)}</div>`;
  wireStepControls(course, step);
}

// Renders the interactive content + completion control for the current step.
// This is the only place raw HTML is injected without escaping — text steps'
// `html` is trainer-authored content, and rendering it as real markup is a
// deliberate trust decision (trainers are the content authors, not the public).
function stepBody(course, step) {
  switch (step.type) {
    case 'text':
      return `<div class="step-content">${step.html || ''}</div>
        <button class="btn btn--primary" data-action="complete-simple">Continue</button>`;
    case 'image':
      return `<img src="${escapeHtml(step.url || '')}" alt="${escapeHtml(step.caption || '')}" style="max-width:100%">
        <p>${escapeHtml(step.caption || '')}</p>
        <button class="btn btn--primary" data-action="complete-simple">Continue</button>`;
    case 'video': {
      const embed = videoEmbedUrl(step.url);
      const media = embed
        ? `<iframe src="${escapeHtml(embed)}" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0"></iframe>`
        : '<p class="pill">No video provided</p>';
      return `${media}<p>${escapeHtml(step.note || '')}</p>
        <button class="btn btn--primary" data-action="complete-video">I watched this</button>`;
    }
    case 'task': {
      const key = `${course.id}:${step.id}`;
      const checks = state.taskChecks[key] || {};
      const items = step.items || [];
      const allChecked = items.length > 0 && items.every((_, i) => checks[i]);
      return `
        <ul class="task-checklist">
          ${items.map((item, i) => `
            <li>
              <label><input type="checkbox" data-action="toggle-task-item" data-item-index="${i}" ${checks[i] ? 'checked' : ''}> ${escapeHtml(item)}</label>
            </li>`).join('')}
        </ul>
        <button class="btn btn--primary" data-action="complete-task" ${allChecked ? '' : 'disabled'}>Mark complete</button>`;
    }
    case 'quiz':
      return renderQuiz(course, step);
    default:
      return '';
  }
}

// ----------------------------------------------------------------------------
// quiz — grading is always server-side via /api/grade; `correct` is never read here
// ----------------------------------------------------------------------------
function renderQuiz(course, step) {
  const key = `${course.id}:${step.id}`;
  const answers = state.quizAnswers[key] || {};
  const result = state.quizResults[key];

  const questions = (step.questions || []).map((q) => `
    <div class="quiz-question">
      <p>${escapeHtml(q.q)}</p>
      <div class="quiz-options">
        ${q.options.map((opt, i) => {
          const selected = answers[q.id] === i;
          const wrong = result && !result.passed && result.perQuestion?.find((p) => p.id === q.id && !p.correct) && selected;
          const cls = ['quiz-option', selected ? 'is-selected' : '', wrong ? 'is-incorrect' : ''].filter(Boolean).join(' ');
          return `<div class="${cls}" data-action="select-option" data-qid="${q.id}" data-opt-index="${i}">
            ${escapeHtml(opt)}${wrong ? ' — incorrect' : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');

  const allAnswered = (step.questions || []).every((q) => answers[q.id] != null);
  const resultHtml = result
    ? `<p class="pill">${result.passed ? 'Passed' : 'Not yet'} — ${result.right}/${result.total} correct (pass mark ${result.passMark}%) · attempt ${result.attempts}</p>`
    : '';

  return `
    <div class="quiz" data-step-id="${step.id}">
      ${questions}
      ${resultHtml}
      ${result?.passed
        ? ''
        : `<button class="btn btn--primary" data-action="submit-quiz" ${allAnswered ? '' : 'disabled'}>${result ? 'Retake' : 'Submit'}</button>`}
    </div>`;
}

async function submitQuiz(course, step) {
  const key = `${course.id}:${step.id}`;
  const answers = state.quizAnswers[key] || {};
  try {
    const result = await api.grade(course.id, step.id, answers);
    state.quizResults[key] = result;
    if (result.passed) {
      renderPlayer(); // completion is derived from quizResults, see isStepDone
    } else {
      renderPlayer();
    }
  } catch { /* toast already shown */ }
}

// ----------------------------------------------------------------------------
// events
// ----------------------------------------------------------------------------
function wireStepControls(course, step) {
  const body = $(`.step-body[data-step-id="${step.id}"]`);
  if (!body) return;

  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'complete-simple' || action === 'complete-video') {
      markNonQuizDone(course.id, step.id);
      state.playerIndex[course.id] = (state.playerIndex[course.id] ?? 0) + 1;
      renderPlayer();
    } else if (action === 'complete-task') {
      markNonQuizDone(course.id, step.id);
      state.playerIndex[course.id] = (state.playerIndex[course.id] ?? 0) + 1;
      renderPlayer();
    } else if (action === 'toggle-task-item') {
      const key = `${course.id}:${step.id}`;
      state.taskChecks[key] = state.taskChecks[key] || {};
      state.taskChecks[key][t.dataset.itemIndex] = t.checked;
      renderPlayer();
    } else if (action === 'select-option') {
      const key = `${course.id}:${step.id}`;
      state.quizAnswers[key] = state.quizAnswers[key] || {};
      state.quizAnswers[key][t.dataset.qid] = Number(t.dataset.optIndex);
      // clear a stale result once the learner starts changing answers on a retake
      if (state.quizResults[key] && !state.quizResults[key].passed) delete state.quizResults[key];
      renderPlayer();
    } else if (action === 'submit-quiz') {
      submitQuiz(course, step);
    }
  });

  body.addEventListener('change', (e) => {
    if (e.target.dataset.action === 'toggle-task-item') {
      const key = `${course.id}:${step.id}`;
      state.taskChecks[key] = state.taskChecks[key] || {};
      state.taskChecks[key][e.target.dataset.itemIndex] = e.target.checked;
      renderPlayer();
    }
  });
}

function updateStepField(module, step, field, value) {
  if (field === 'passMark') step.passMark = Number(value) || 0;
  else step[field] = value;
}

function wireBuilderEvents() {
  const builder = $('#builder');

  builder.addEventListener('click', (e) => {
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const course = findCourse(state.builderCourseId);
    if (!course) return;
    const action = t.dataset.action;

    if (action === 'back-to-list') {
      clearTimeout(saveTimer); // flush any pending autosave before navigating away
      api.saveState(state.courses).catch(() => {});
      renderTrainerHome();
      return;
    }

    if (action === 'save-draft') {
      clearTimeout(saveTimer);
      api.saveState(state.courses).then(() => toast('Saved')).catch(() => {});
      return;
    }

    if (action === 'publish') {
      course.status = 'published';
      course.publishedAt = new Date().toISOString();
      api.saveState(state.courses).then(() => toast('Published')).catch(() => {});
      renderBuilder();
      return;
    }

    if (action === 'add-module') {
      course.modules.push({ id: uid('mod'), title: 'New module', steps: [] });
      renderBuilder(); scheduleSave(); return;
    }
    if (action === 'delete-module') {
      course.modules = course.modules.filter((m) => m.id !== t.dataset.moduleId);
      renderBuilder(); scheduleSave(); return;
    }

    const module = findModule(course, t.dataset.moduleId);

    if (action === 'add-step') {
      const select = $(`.add-step-type[data-module-id="${module.id}"]`);
      const type = select.value;
      const base = { id: uid('step'), type, title: 'New step' };
      const extra = {
        text: { html: '' }, video: { url: '', note: '' }, image: { url: '', caption: '' },
        task: { instructions: '', items: [] }, quiz: { passMark: 70, questions: [] },
      }[type];
      module.steps.push({ ...base, ...extra });
      renderBuilder(); scheduleSave(); return;
    }
    if (action === 'delete-step') {
      module.steps = module.steps.filter((s) => s.id !== t.dataset.stepId);
      renderBuilder(); scheduleSave(); return;
    }
    if (action === 'move-step-up' || action === 'move-step-down') {
      const i = module.steps.findIndex((s) => s.id === t.dataset.stepId);
      const j = action === 'move-step-up' ? i - 1 : i + 1;
      if (j < 0 || j >= module.steps.length) return;
      [module.steps[i], module.steps[j]] = [module.steps[j], module.steps[i]];
      renderBuilder(); scheduleSave(); return;
    }

    const step = module ? findStep(module, t.dataset.stepId) : null;

    if (action === 'add-task-item') {
      step.items = step.items || [];
      step.items.push('');
      renderBuilder(); scheduleSave(); return;
    }
    if (action === 'delete-task-item') {
      step.items.splice(Number(t.dataset.itemIndex), 1);
      renderBuilder(); scheduleSave(); return;
    }
    if (action === 'add-question') {
      step.questions = step.questions || [];
      step.questions.push({ id: uid('q'), q: '', options: ['', '', '', ''], correct: 0 });
      renderBuilder(); scheduleSave(); return;
    }
    if (action === 'delete-question') {
      step.questions = step.questions.filter((q) => q.id !== t.dataset.qid);
      renderBuilder(); scheduleSave(); return;
    }
  });

  // Plain text/number edits mutate state without a full re-render, so the
  // input keeps focus and cursor position while the trainer is typing.
  builder.addEventListener('input', (e) => {
    const t = e.target;
    const course = findCourse(state.builderCourseId);
    if (!course) return;
    if (t.dataset.role === 'course-title') { course.title = t.value; scheduleSave(); return; }
    if (t.dataset.role === 'course-summary') { course.summary = t.value; scheduleSave(); return; }

    const module = t.dataset.moduleId ? findModule(course, t.dataset.moduleId) : null;
    if (t.dataset.role === 'module-title' && module) { module.title = t.value; scheduleSave(); return; }

    const step = module && t.dataset.stepId ? findStep(module, t.dataset.stepId) : null;
    if (!step) return;
    if (t.dataset.role === 'step-title') { step.title = t.value; scheduleSave(); return; }
    if (t.dataset.role === 'step-field') { updateStepField(module, step, t.dataset.field, t.value); scheduleSave(); return; }
    if (t.dataset.role === 'task-item') { step.items[Number(t.dataset.itemIndex)] = t.value; scheduleSave(); return; }
    if (t.dataset.role === 'quiz-q') {
      const q = step.questions.find((q) => q.id === t.dataset.qid);
      if (q) { q.q = t.value; scheduleSave(); }
      return;
    }
    if (t.dataset.role === 'quiz-opt') {
      const q = step.questions.find((q) => q.id === t.dataset.qid);
      if (q) { q.options[Number(t.dataset.optIndex)] = t.value; scheduleSave(); }
      return;
    }
  });

  builder.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.role === 'quiz-correct') {
      const course = findCourse(state.builderCourseId);
      const module = findModule(course, t.dataset.moduleId);
      const step = findStep(module, t.dataset.stepId);
      const q = step.questions.find((q) => q.id === t.dataset.qid);
      if (q) { q.correct = Number(t.value); scheduleSave(); }
    }
  });
}

function wireCourseListEvents() {
  const onClick = (e) => {
    const card = e.target.closest('[data-action="open-builder"], [data-action="open-player"]');
    if (!card) return;
    const id = card.dataset.courseId;
    if (card.dataset.action === 'open-builder') openBuilder(id);
    else openPlayer(id);
  };
  $('#course-list-trainer').addEventListener('click', onClick);
  $('#course-list-learner').addEventListener('click', onClick);
}

// AI drafting was the only path into the builder — a trainer without a
// Gemini call to spend (or Gemini down mid-demo) had no way to create a
// course at all, even though manual authoring is the primary flow the
// brief describes and AI drafting is explicitly "assisted", not required.
function wireNewCourse() {
  $('#new-course').addEventListener('click', () => {
    const course = {
      id: uid('c'),
      title: 'Untitled course',
      summary: '',
      level: '',
      duration: '',
      status: 'draft',
      createdBy: 'u-trainer-you',
      createdByName: 'You',
      publishedAt: null,
      modules: [{ id: uid('mod'), title: 'Module 1', steps: [] }],
    };
    state.courses.unshift(course);
    scheduleSave();
    openBuilder(course.id);
  });
}

function wireAiPanel() {
  $('#ai-go').addEventListener('click', async () => {
    const description = $('#ai-input').value.trim();
    if (!description) { toast('Describe the course first', true); return; }
    $('#ai-status').textContent = 'Drafting…';
    try {
      const { course } = await api.draft(description);
      state.courses.unshift(course);
      $('#ai-status').textContent = 'Drafted — now editable below';
      await api.saveState(state.courses); // persist immediately so the draft isn't lost
      openBuilder(course.id);
    } catch {
      $('#ai-status').textContent = 'Draft failed';
    }
  });
}

function getSelectedRoleFromEl() {
  const el = $('#role-switch');
  if (!el) return null;
  if ('value' in el && el.value) return el.value === 'therapist' ? 'therapist' : 'trainer';
  return null;
}

function wireRoleSwitch() {
  const el = $('#role-switch');
  if (!el) return;
  // Supports either a <select> (change) or a button group with data-role (click).
  el.addEventListener('change', async () => {
    const role = getSelectedRoleFromEl();
    if (role) await switchRole(role);
  });
  el.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-role]');
    if (!btn) return;
    // .is-active matches the class already hardcoded on the Trainer button in
    // index.html and the only class style.css actually styles for this control.
    $$('[data-role]', el).forEach((b) => {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
    });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected', 'true');
    await switchRole(btn.dataset.role === 'therapist' ? 'therapist' : 'trainer');
  });
}

async function switchRole(role) {
  if (role === state.role) return;
  state.role = role;
  await loadState();
  renderApp();
}

// Progress-nav pips have data-action="goto-step" in their markup but nothing
// was ever listening for it — clicking a completed step to review it did
// nothing. Only rendered pips have the attribute at all (locked ones don't),
// so this can never navigate past what's actually allowed.
function wireProgressNav() {
  $('#player-progress').addEventListener('click', (e) => {
    const t = e.target.closest('[data-action="goto-step"]');
    if (!t) return;
    const course = findCourse(state.playerCourseId);
    if (!course) return;
    state.playerIndex[course.id] = Number(t.dataset.stepIndex);
    renderPlayer();
  });
}

function wireEvents() {
  wireRoleSwitch();
  wireCourseListEvents();
  wireBuilderEvents();
  wireAiPanel();
  wireProgressNav();
  wireNewCourse();
}

// ----------------------------------------------------------------------------
// boot
// ----------------------------------------------------------------------------
function renderApp() {
  const isTrainer = state.role === 'trainer';
  $('#view-trainer').hidden = !isTrainer;
  $('#view-learner').hidden = isTrainer;
  $('#builder').hidden = true;
  $('#player').hidden = true;
  if (isTrainer) renderTrainerHome();
  else renderLearnerHome();
}

async function init() {
  wireEvents();
  state.role = getSelectedRoleFromEl() || 'trainer';
  await loadState();
  renderApp();
}

init();
