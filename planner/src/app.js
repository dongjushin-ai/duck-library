// 화면. 모든 글자는 textContent로만 넣어서 공고에 섞인 HTML이 실행되지 않게 한다.
import { SKILL_BY_ID } from "./skills.js";
import {
  addDays, analyzePosting, buildRoadmap, buildWeek, completeTask, diagnose, deriveTasks, diffDays, embedJson,
  emptyState, ensureWeek, formatMinutes, graduationEnd, graduationSummary, moveTask, normalizeState, parseIso,
  recentActiveDays, recordVisit, safeUrl, toIso, uid, undoTask, upcomingDeadlines, weekDates, weekdayName, weekView,
} from "./engine.js";
import { sampleState } from "./sample.js";

const STORE_PREFIX = "duck-planner:v1:";
const LAST_OWNER = `${STORE_PREFIX}last`;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const BACKUP_REMINDER_MS = 14 * 86400000;
const ROLES = ["데이터 분석가", "백엔드 개발자", "프론트엔드 개발자", "AI 엔지니어", "서비스 기획자", "마케터", "UX/UI 디자이너", "영업·사업개발", "재무·회계", "인사"];
const DEADLINE_KINDS = ["과제", "시험", "팀플", "발표", "지원서", "기타"];
const TYPE_LABEL = { required: "필수", duties: "담당업무", preferred: "우대" };
const STATUS_LABEL = { proven: "증거 있음", partial: "증거 필요", missing: "아직 없음" };

const root = document.getElementById("app");
let state = null;
let view = "dashboard";
let selectedSkill = null;
let editingExperience = null;
let storageOk = true;
let loadProblem = "";
let toastTimer = 0;

const today = () => toIso(new Date());

// ---------- 저장 ----------
function readStore(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    storageOk = false;
    return null;
  }
}

function persist() {
  if (!state) return;
  state.updatedAt = Date.now();
  if (state.isSample) return;
  try {
    localStorage.setItem(STORE_PREFIX + state.ownerId, JSON.stringify(state));
    localStorage.setItem(LAST_OWNER, state.ownerId);
    storageOk = true;
  } catch {
    storageOk = false;
  }
}

function parseStored(raw) {
  try {
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// 저장한 HTML을 열면 그 안의 데이터를 쓰되, 같은 사람의 더 새로운 자동 저장이 있으면 그쪽을 쓴다.
function loadInitialState() {
  let embedded = null;
  try {
    const raw = JSON.parse(document.getElementById("duck-data").textContent);
    embedded = raw ? normalizeState(raw) : null;
  } catch (error) {
    loadProblem = `저장된 데이터를 읽지 못했어요: ${error.message}`;
  }
  const owner = embedded?.ownerId ?? readStore(LAST_OWNER);
  const stored = owner ? parseStored(readStore(STORE_PREFIX + owner)) : null;
  if (embedded && stored) return stored.updatedAt > embedded.updatedAt ? stored : embedded;
  return stored ?? embedded;
}

function clearStore(ownerId) {
  try {
    localStorage.removeItem(STORE_PREFIX + ownerId);
    if (localStorage.getItem(LAST_OWNER) === ownerId) localStorage.removeItem(LAST_OWNER);
  } catch {
    storageOk = false;
  }
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = h("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function saveHtml() {
  state.lastExportAt = Date.now();
  persist();
  const copy = document.documentElement.cloneNode(true);
  copy.querySelector("#app").replaceChildren();
  copy.querySelector("#toast").textContent = "";
  copy.querySelector("#duck-data").textContent = embedJson(state);
  copy.querySelector("title").textContent = `${state.profile.name ? `${state.profile.name}의 ` : ""}덕스텝`;
  download(`duck-planner-${today()}.html`, `<!doctype html>\n${copy.outerHTML}`, "text/html;charset=utf-8");
  toast("내 HTML을 저장했어요. 다음에는 이 파일을 열면 이어서 쓸 수 있어요.");
  render();
}

function exportJson() {
  state.lastExportAt = Date.now();
  persist();
  download(`duck-planner-${today()}.json`, JSON.stringify(state, null, 2), "application/json");
  toast("백업 파일을 저장했어요.");
  render();
}

async function importFile(file) {
  if (file.size > MAX_IMPORT_BYTES) throw new Error("파일이 5MB보다 커요.");
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error("JSON 백업 파일이 아니에요.");
  }
  const next = normalizeState(raw);
  next.isSample = false;
  state = next;
  persist();
  view = "dashboard";
  toast("백업 파일을 불러왔어요.");
  render();
}

// ---------- DOM 도우미 ----------
function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) element.addEventListener(key.slice(2), value);
    else if (key === "class") element.className = value;
    else if (key === "value") element.value = value;
    else if (key === "checked" || key === "required" || key === "selected") element[key] = Boolean(value);
    else if (key === "cssVars") for (const [name, css] of Object.entries(value)) element.style.setProperty(name, css);
    else element.setAttribute(key, value === true ? "" : value);
  }
  element.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return element;
}

const button = (label, onclick, className = "button", props = {}) =>
  h("button", { type: "button", class: className, onclick, ...props }, label);

const field = (label, control, hint) =>
  h("label", { class: "field" }, h("span", {}, label), control, hint ? h("small", { class: "hint" }, hint) : null);

function toast(message) {
  const element = document.getElementById("toast");
  if (!element) return;
  element.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.textContent = "";
  }, 3500);
}

function mutate(change, message) {
  change(state);
  persist();
  render();
  if (message) toast(message);
}

function values(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function handleSubmit(handler) {
  return (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = form.querySelector(".error");
    if (error) error.textContent = "";
    try {
      handler(values(form), form);
    } catch (problem) {
      if (error) error.textContent = problem.message;
      else toast(problem.message);
    }
  };
}

const errorSlot = () => h("p", { class: "error", role: "alert" });

function openDialog(title, ...content) {
  const dialog = h("dialog", { "aria-label": title }, h("h2", {}, title), ...content);
  dialog.addEventListener("close", () => dialog.remove());
  root.append(dialog);
  dialog.showModal();
  return dialog;
}

function confirmAction(title, body, label, action) {
  const dialog = openDialog(
    title,
    h("p", {}, body),
    h(
      "div",
      { class: "actions no-print" },
      button(label, () => {
        dialog.close();
        action();
      }, "button danger"),
      button("취소", () => dialog.close(), "button quiet"),
    ),
  );
}

const shortDate = (date) => {
  const parsed = parseIso(date);
  return `${parsed.getMonth() + 1}월 ${parsed.getDate()}일`;
};

const dayLabel = (daysLeft) => (daysLeft === 0 ? "오늘" : `D-${daysLeft}`);

function evidenceNode(evidence) {
  if (!evidence) return h("span", { class: "muted" }, "증거 없음");
  const url = safeUrl(evidence);
  return url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, evidence) : h("span", {}, evidence);
}

// ---------- 프로필 ----------
function profileFields(profile) {
  const year = parseIso(today()).getFullYear();
  const dayNames = ["월", "화", "수", "목", "금", "토", "일"];
  return [
    h(
      "div",
      { class: "form-grid" },
      field("이름 또는 별명 (선택)", h("input", { name: "name", maxlength: 40, autocomplete: "off", value: profile.name })),
      field(
        "목표 직무",
        h("input", { name: "role", required: true, maxlength: 60, list: "role-options", autocomplete: "off", value: profile.role }),
      ),
      h("datalist", { id: "role-options" }, ROLES.map((role) => h("option", { value: role }))),
      field("졸업 연도", h("input", { name: "graduationYear", type: "number", required: true, min: year, max: year + 10, value: profile.graduationYear })),
      field(
        "졸업 학기",
        h(
          "select",
          { name: "graduationTerm" },
          h("option", { value: "1", selected: profile.graduationTerm === 1 }, "1학기까지"),
          h("option", { value: "2", selected: profile.graduationTerm === 2 }, "2학기까지"),
        ),
      ),
    ),
    h(
      "fieldset",
      {},
      h("legend", { class: "legend-title" }, "학기 중 진로 준비에 쓸 수 있는 시간 (요일별 시간)"),
      h(
        "div",
        { class: "hours" },
        dayNames.map((name, index) =>
          h(
            "label",
            {},
            name,
            h("input", {
              name: `day${index}`,
              type: "number",
              min: 0,
              max: 24,
              step: 0.5,
              required: true,
              inputmode: "decimal",
              value: profile.availability[index] / 60,
              "aria-label": `${name}요일 시간`,
            }),
          ),
        ),
      ),
      h("small", { class: "hint" }, "수업과 근무, 고정 일정을 뺀 시간만 적어 주세요."),
    ),
    field(
      "방학 중 일주일에 쓸 수 있는 시간",
      h("input", { name: "vacationHours", type: "number", min: 0, max: 168, step: 0.5, required: true, value: profile.vacationWeeklyMinutes / 60 }),
    ),
  ];
}

function readProfile(input, current) {
  const availability = current.availability.map((_, index) => Math.round(Number(input[`day${index}`]) * 60));
  const profile = {
    name: input.name.trim(),
    role: input.role.trim(),
    graduationYear: Number(input.graduationYear),
    graduationTerm: Number(input.graduationTerm) === 1 ? 1 : 2,
    availability,
    vacationWeeklyMinutes: Math.round(Number(input.vacationHours) * 60),
  };
  if (!profile.role) throw new Error("목표 직무를 적어 주세요.");
  if (graduationEnd(profile) < today()) throw new Error("졸업 학기가 이미 지났어요. 앞으로의 학기를 골라 주세요.");
  return profile;
}

// ---------- 첫 화면 ----------
function viewIntro() {
  const draft = emptyState();
  const form = h(
    "form",
    {
      class: "form",
      onsubmit: handleSubmit((input) => {
        const next = emptyState();
        next.profile = readProfile(input, next.profile);
        const posting = input.posting.trim();
        if (posting) next.postings.push({ id: uid(), company: input.company.trim(), title: next.profile.role, text: posting });
        state = next;
        recordVisit(state, today());
        persist();
        render();
      }),
    },
    ...profileFields(draft.profile),
    field("회사 이름 (선택)", h("input", { name: "company", maxlength: 80, autocomplete: "off" })),
    field(
      "채용공고 본문",
      h("textarea", { name: "posting", maxlength: 20000, placeholder: "자격요건과 우대사항이 보이도록 공고를 그대로 붙여넣어 주세요." }),
      "공고는 3개 이상 넣을수록 정확해요. 나중에 더 넣을 수 있어요.",
    ),
    errorSlot(),
    h("button", { type: "submit", class: "button primary" }, "내 대시보드 만들기"),
  );
  const importInput = h("input", {
    type: "file",
    accept: ".json,application/json",
    hidden: true,
    "aria-label": "백업 파일 선택",
    onchange: async (event) => {
      const [file] = event.target.files;
      event.target.value = "";
      if (file) await importFile(file).catch((problem) => toast(problem.message));
    },
  });
  return h(
    "main",
    { class: "shell intro" },
    h(
      "div",
      {},
      h("h1", { class: "intro-title" }, "공고를 넣으면 오늘 할 일이 나와요"),
      h(
        "ol",
        { class: "intro-steps" },
        h("li", {}, h("span", {}, "공고에서 요구 역량을 찾고 근거 문장을 보여 줘요.")),
        h("li", {}, h("span", {}, "내 경험과 비교해서 증거가 없는 역량을 골라요.")),
        h("li", {}, h("span", {}, "졸업까지 로드맵, 이번 주 계획, 오늘 할 일 3개를 만들어요.")),
        h("li", {}, h("span", {}, "끝낸 일은 증거와 함께 경험으로 쌓여요.")),
      ),
      h(
        "div",
        { class: "intro-aside" },
        h("p", { class: "muted" }, "입력한 내용은 이 브라우저에만 저장되고 밖으로 나가지 않아요."),
        button("예시 데이터로 둘러보기", () => {
          state = sampleState(today());
          render();
        }, "button quiet"),
        button("백업 파일 불러오기", () => importInput.click(), "link-button"),
        importInput,
      ),
    ),
    form,
  );
}

// ---------- 공통 틀 ----------
function topbar() {
  const items = [
    ["dashboard", "대시보드"],
    ["postings", "공고"],
    ["experiences", "경험 은행"],
    ["schedule", "일정"],
    ["settings", "설정"],
  ];
  return h(
    "header",
    { class: "topbar" },
    h("div", { class: "wordmark" }, "덕스텝", h("span", { class: "wordmark-sub" }, " DuckStep")),
    h(
      "nav",
      { class: "nav", "aria-label": "화면" },
      items.map(([key, label]) =>
        button(label, () => {
          view = key;
          editingExperience = null;
          render();
          window.scrollTo(0, 0);
        }, "", { "aria-current": view === key ? "page" : undefined, "data-key": `nav-${key}` }),
      ),
    ),
    state.isSample ? null : button("내 HTML 저장", saveHtml, "button primary", { "data-key": "save-html" }),
  );
}

function notices() {
  if (state.isSample) {
    return h(
      "div",
      { class: "notice", role: "region", "aria-label": "안내" },
      h("span", {}, "예시 데이터를 보고 있어요. 고친 내용은 저장되지 않아요."),
      button("내 정보로 시작하기", () => {
        state = null;
        selectedSkill = null;
        view = "dashboard";
        render();
      }, "button quiet"),
    );
  }
  if (!storageOk) {
    return h(
      "div",
      { class: "notice alert", role: "alert" },
      h("span", {}, "이 브라우저는 자동 저장을 막고 있어요. 창을 닫기 전에 내 HTML을 저장해 주세요."),
    );
  }
  if (Date.now() - state.lastExportAt > BACKUP_REMINDER_MS) {
    return h(
      "div",
      { class: "notice", role: "region", "aria-label": "안내" },
      h("span", {}, "방문 기록을 지우면 자동 저장도 사라져요. 내 HTML을 저장해 두면 안전해요."),
    );
  }
  return null;
}

// ---------- 대시보드 ----------
function replanned(draft) {
  draft.week = buildWeek(draft, today());
}

function completeRequest(task) {
  if (task.requiresEvidence) openTask(task);
  else {
    mutate((draft) => completeTask(draft, task, today()), "끝낸 일로 표시했어요.");
  }
}

function taskRow(task) {
  const checkbox = h("input", {
    type: "checkbox",
    checked: task.done,
    "aria-label": `${task.title} 완료`,
    "data-key": `check-${task.id}`,
    onchange: (event) => {
      if (task.done) mutate((draft) => undoTask(draft, task.id), "완료를 취소했어요.");
      else {
        event.target.checked = false;
        completeRequest(task);
      }
    },
  });
  return h(
    "li",
    { class: `task-row${task.done ? " done" : ""}` },
    checkbox,
    h(
      "div",
      {},
      button(task.title, () => openTask(task), "task-open", { "data-key": `open-${task.id}` }),
      h(
        "div",
        { class: "task-meta" },
        task.overdue ? h("span", { class: "tag-late" }, "밀림 ") : null,
        [task.label, formatMinutes(task.minutes)].filter(Boolean).join(", "),
      ),
    ),
  );
}

function openTask(task) {
  const now = today();
  const dates = weekDates(now).filter((date) => date >= now);
  const skill = task.skillId ? diagnosis().skills.find((item) => item.id === task.skillId) : null;
  const dialog = openDialog(
    task.title,
    h("p", { class: "muted" }, [task.label, formatMinutes(task.minutes)].filter(Boolean).join(", ")),
    skill ? h("p", { class: "small" }, `공고 ${state.postings.length}개 중 ${skill.mentions}개에 나온 역량이에요.`) : null,
    task.done
      ? h(
          "div",
          { class: "actions" },
          button("완료 취소", () => {
            dialog.close();
            mutate((draft) => undoTask(draft, task.id));
          }, "button quiet"),
          button("닫기", () => dialog.close(), "button quiet"),
        )
      : h(
          "form",
          {
            class: "form",
            onsubmit: handleSubmit((input) => {
              const details = { evidence: input.evidence ?? "", result: input.result ?? "" };
              if (task.requiresEvidence && !details.evidence.trim()) throw new Error("증거 링크나 파일 이름을 적어 주세요.");
              dialog.close();
              mutate((draft) => completeTask(draft, task, now, details), task.requiresEvidence ? "경험 은행에 넣었어요." : "끝낸 일로 표시했어요.");
            }),
          },
          task.requiresEvidence
            ? [
                field("결과 한 줄", h("input", { name: "result", maxlength: 500, placeholder: "무엇을 만들었고 어떤 결과가 나왔나요?" })),
                field("증거", h("input", { name: "evidence", required: true, maxlength: 500, placeholder: "링크 또는 파일 이름" }), "증거가 있어야 역량을 채운 것으로 세요."),
              ]
            : null,
          field(
            "날짜",
            h(
              "select",
              { name: "date" },
              !dates.includes(task.date) ? h("option", { value: task.date, selected: true }, `${shortDate(task.date)} (지난 날)`) : null,
              dates.map((date) =>
                h("option", { value: date, selected: date === task.date }, `${shortDate(date)} ${weekdayName(date)}요일`),
              ),
            ),
          ),
          errorSlot(),
          h(
            "div",
            { class: "actions" },
            h("button", { type: "submit", class: "button primary" }, "완료하기"),
            button("이 날짜로 옮기기", (event) => {
              const date = event.currentTarget.form.elements.date.value;
              dialog.close();
              mutate((draft) => moveTask(draft, task.id, date), `${shortDate(date)}로 옮겼어요.`);
            }, "button quiet"),
            task.custom
              ? button("삭제", () => {
                  dialog.close();
                  mutate((draft) => {
                    draft.customTasks = draft.customTasks.filter((item) => item.id !== task.id);
                    draft.week.items = draft.week.items.filter((item) => item.id !== task.id);
                  }, "할 일을 삭제했어요.");
                }, "button danger")
              : null,
            button("닫기", () => dialog.close(), "button quiet"),
          ),
        ),
  );
}

let cachedDiagnosis = null;
function diagnosis() {
  cachedDiagnosis ??= diagnose(state);
  return cachedDiagnosis;
}

function sectionToday(week) {
  const now = today();
  const hasPostings = state.postings.length > 0;
  const minutes = week.today.reduce((sum, task) => sum + task.minutes, 0);
  let body;
  if (!hasPostings) {
    body = h(
      "div",
      { class: "empty" },
      h("p", {}, "공고를 넣으면 오늘 할 일이 나와요."),
      button("공고 넣기", () => {
        view = "postings";
        render();
      }, "button primary"),
    );
  } else if (week.today.length || week.doneToday.length) {
    body = h("ul", { class: "today-list" }, week.today.map(taskRow), week.doneToday.map(taskRow));
  } else {
    body = h("div", { class: "empty" }, h("p", {}, "오늘 잡힌 일이 없어요."));
  }
  const canPull = hasPostings && !week.today.length && week.upcoming.length > 0;
  const summary = week.today.length
    ? `${week.today.length}개 남았어요. ${formatMinutes(minutes)}이면 끝나요.`
    : week.doneToday.length
      ? "오늘 할 일을 끝냈어요."
      : `${state.profile.role} 준비`;
  return h(
    "section",
    { "aria-labelledby": "today-title" },
    h("h1", { class: "page-title", id: "today-title" }, `${shortDate(now)} ${weekdayName(now)}요일`),
    h("p", { class: "lede" }, summary),
    body,
    week.waiting ? h("p", { class: "small muted" }, `오늘 3개를 넘긴 일 ${week.waiting}개는 대기 중이에요.`) : null,
    canPull
      ? h(
          "div",
          { class: "actions no-print" },
          button("다음 할 일 당겨오기", () => mutate((draft) => moveTask(draft, week.upcoming[0].id, now)), "button quiet", { "data-key": "pull" }),
        )
      : null,
  );
}

function sectionDeadlines() {
  const items = upcomingDeadlines(state, today());
  return h(
    "aside",
    { "aria-label": "임박한 마감" },
    h("h2", { class: "due-title" }, "임박한 마감"),
    items.length
      ? h(
          "ul",
          {},
          items.map((item) =>
            h(
              "li",
              { class: "due-row" },
              h("span", { class: `due-day${item.daysLeft <= 3 ? " soon" : ""}` }, dayLabel(item.daysLeft)),
              h("span", {}, item.title, h("span", { class: "task-meta" }, ` ${item.kind}, ${shortDate(item.date)}`)),
            ),
          ),
        )
      : h("p", { class: "muted small" }, "2주 안에 잡힌 마감이 없어요."),
    h(
      "div",
      { class: "no-print" },
      button("마감 추가", () => {
        view = "schedule";
        render();
      }, "link-button"),
    ),
  );
}

function spine(skill, maxMentions) {
  // 긴 이름은 잘리지 않을 만큼 높이를 보장한다.
  const height = Math.max(104 + (56 * skill.mentions) / maxMentions, Math.min(164, skill.label.length * 16 + 20));
  const pressed = selectedSkill === skill.id;
  return button(skill.label, () => {
    selectedSkill = pressed ? null : skill.id;
    render();
  }, `spine ${skill.status}`, {
    "aria-pressed": String(pressed),
    "aria-label": `${skill.label}, ${STATUS_LABEL[skill.status]}, 공고 ${skill.mentions}개에 나옴`,
    title: skill.label,
    "data-key": `spine-${skill.id}`,
    cssVars: { "--h": `${Math.round(height)}px` },
  });
}

function skillDetail(skill) {
  const linked = state.experiences.filter((experience) => experience.skills.includes(skill.id));
  return h(
    "div",
    { class: "skill-detail" },
    h("h3", {}, `${skill.label}: ${STATUS_LABEL[skill.status]}`),
    h("p", { class: "small muted" }, `필수 ${skill.required}, 담당업무 ${skill.duties}, 우대 ${skill.preferred}`),
    skill.evidence.slice(0, 4).map((item) =>
      h(
        "blockquote",
        { class: "quote" },
        h("p", {}, item.text),
        h("span", { class: "task-meta" }, `${item.company || "회사 미입력"}, ${TYPE_LABEL[item.type]}`),
      ),
    ),
    linked.length ? h("p", { class: "small" }, `연결된 경험: ${linked.map((experience) => experience.title).join(", ")}`) : null,
    h(
      "div",
      { class: "actions no-print" },
      button("경험 추가", () => {
        view = "experiences";
        editingExperience = { skills: [skill.id] };
        render();
      }, "button quiet"),
      button("내 역량이 아니에요", () => {
        selectedSkill = null;
        mutate((draft) => {
          if (skill.id.length && draft.customSkills.some((item) => item.id === skill.id)) {
            draft.customSkills = draft.customSkills.filter((item) => item.id !== skill.id);
          } else {
            draft.ignoredSkills.push(skill.id);
          }
          replanned(draft);
        }, `목록에서 뺐어요: ${skill.label}`);
      }, "button quiet"),
    ),
  );
}

function sectionShelf() {
  const result = diagnosis();
  if (!result.total) return null;
  const maxMentions = Math.max(...result.skills.map((skill) => skill.mentions));
  const group = (label, skills) =>
    skills.length
      ? h(
          "div",
          { class: "shelf-group" },
          h("p", { class: "shelf-label" }, label),
          h("div", { class: "shelf" }, skills.map((skill) => spine(skill, maxMentions))),
        )
      : null;
  const selected = result.skills.find((skill) => skill.id === selectedSkill);
  return h(
    "section",
    { class: "section shelf-section", "aria-labelledby": "shelf-title" },
    h(
      "div",
      { class: "section-head" },
      h("h2", { id: "shelf-title" }, "역량 서가"),
      h("span", { class: "section-note" }, `요구 역량 ${result.total}개 중 증거가 있는 역량 ${result.proven}개`),
    ),
    group("필수 역량", result.essential),
    group("담당업무·우대 역량", result.preferred),
    h(
      "div",
      { class: "legend" },
      h("span", {}, h("i", { class: "swatch proven" }), "증거 있음"),
      h("span", {}, h("i", { class: "swatch partial" }), "경험은 있지만 증거 필요"),
      h("span", {}, h("i", { class: "swatch missing" }), "아직 없음"),
      h("span", {}, "책이 높을수록 많은 공고에 나왔어요"),
    ),
    selected ? skillDetail(selected) : null,
    h(
      "details",
      { class: "small" },
      h("summary", {}, "표로 보기"),
      h(
        "table",
        { class: "skill-table" },
        h("thead", {}, h("tr", {}, ["역량", "상태", "필수", "담당업무", "우대"].map((name) => h("th", { scope: "col" }, name)))),
        h(
          "tbody",
          {},
          result.skills.map((skill) =>
            h(
              "tr",
              {},
              h("th", { scope: "row" }, skill.label),
              h("td", {}, STATUS_LABEL[skill.status]),
              h("td", {}, String(skill.required)),
              h("td", {}, String(skill.duties)),
              h("td", {}, String(skill.preferred)),
            ),
          ),
        ),
      ),
    ),
  );
}

function sectionWeek(week) {
  const now = today();
  const queue = deriveTasks(state, diagnosis());
  return h(
    "section",
    { class: "section", "aria-labelledby": "week-title" },
    h(
      "div",
      { class: "section-head" },
      h("h2", { id: "week-title" }, "이번 주 계획표"),
      h("span", { class: "section-note" }, `계획 ${formatMinutes(week.plannedMinutes)}, 쓸 수 있는 시간 ${formatMinutes(week.capacityMinutes)}`),
    ),
    week.overdue
      ? h("p", { class: "tag-late small" }, `밀린 일 ${week.overdue}개가 있어요. 남은 요일로 다시 짤 수 있어요.`)
      : null,
    h(
      "div",
      { class: "week" },
      week.days.map((day) =>
        h(
          "div",
          { class: `day${day.date === now ? " is-today" : ""}${day.date < now ? " is-past" : ""}`, "aria-current": day.date === now ? "date" : undefined },
          h(
            "div",
            { class: "day-head" },
            h("span", {}, weekdayName(day.date)),
            h("span", {}, String(parseIso(day.date).getDate())),
          ),
          h("div", { class: "day-free" }, day.capacity ? formatMinutes(day.capacity) : "쉬는 날"),
          day.items.map((task) =>
            button(task.title, () => openTask(task), `chip${task.done ? " done" : ""}${task.overdue ? " overdue" : ""}`, {
              "data-key": `chip-${task.id}`,
            }),
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "actions week-actions no-print" },
      h("span", { class: "section-note" }, "할 일을 누르면 날짜를 옮길 수 있어요."),
      button("남은 요일로 다시 짜기", () => {
        mutate((draft) => {
          draft.week = buildWeek(draft, now, queue);
        }, "이번 주 계획을 다시 짰어요.");
      }, "button quiet", { "data-key": "rebuild" }),
      button("인쇄", () => window.print(), "button quiet"),
    ),
  );
}

function sectionRoadmap() {
  const queue = deriveTasks(state, diagnosis());
  const { periods, unscheduled } = buildRoadmap(state, today(), queue);
  return h(
    "section",
    { "aria-labelledby": "roadmap-title" },
    h("div", { class: "section-head" }, h("h2", { id: "roadmap-title" }, "졸업까지 로드맵")),
    periods.length
      ? h(
          "ol",
          { class: "roadmap" },
          periods.map((period) =>
            h(
              "li",
              { class: "period" },
              h(
                "div",
                {},
                h("div", { class: "period-name" }, period.name),
                h("div", { class: "task-meta" }, `약 ${Math.round(period.capacity / 60)}시간`),
              ),
              period.skills.length
                ? h("div", { class: "tags" }, period.skills.map((skill) => h("span", { class: "tag" }, skill.label)))
                : h("span", { class: "muted small" }, "여유 시간"),
            ),
          ),
        )
      : h("p", { class: "muted" }, "설정에서 앞으로의 졸업 학기를 골라 주세요."),
    unscheduled.length
      ? h("p", { class: "tag-late small" }, `시간이 모자라 못 넣은 역량: ${unscheduled.map((skill) => skill.label).join(", ")}`)
      : null,
    h("p", { class: "small muted" }, "역량마다 첫 증거를 남길 때까지의 시간이에요. 주당 가능 시간의 70%만 잡아서 일정이 밀려도 버틸 수 있어요."),
  );
}

function sectionGraduation() {
  const summary = graduationSummary(state, today());
  return h(
    "section",
    { "aria-labelledby": "grad-title" },
    h("div", { class: "section-head" }, h("h2", { id: "grad-title" }, "졸업요건")),
    !summary.requiredCredits ? h("p", { class: "muted small" }, "학교 졸업 학점과 필수 과목을 넣으면 남은 학점을 계산해요.") : null,
    h(
      "div",
      { class: "stats", hidden: !summary.requiredCredits },
      h("div", { class: "stat" }, h("span", {}, "남은 학점"), h("strong", {}, String(summary.remaining))),
      summary.perTerm !== null
        ? h("div", { class: "stat" }, h("span", {}, `남은 ${summary.terms}학기 평균`), h("strong", {}, `${summary.perTerm}학점`))
        : null,
      h("div", { class: "stat" }, h("span", {}, "남은 필수 과목"), h("strong", {}, String(summary.openCourses))),
    ),
    summary.courses.map((course, index) =>
      h(
        "label",
        { class: "course" },
        h("input", {
          type: "checkbox",
          checked: course.done,
          "data-key": `course-${index}`,
          onchange: (event) => mutate((draft) => {
            draft.graduation.courses[index].done = event.target.checked;
          }),
        }),
        course.name,
      ),
    ),
    h(
      "div",
      { class: "no-print" },
      button("졸업요건 입력", () => {
        view = "settings";
        render();
      }, "link-button"),
    ),
  );
}

function viewDashboard() {
  const week = weekView(state, today(), deriveTasks(state, diagnosis()));
  return h(
    "main",
    {},
    h("div", { class: "opening" }, sectionToday(week), sectionDeadlines()),
    sectionShelf(),
    sectionWeek(week),
    h("div", { class: "section closing" }, sectionRoadmap(), sectionGraduation()),
  );
}

// ---------- 공고 ----------
function postingRow(posting) {
  const { hits, unread } = analyzePosting(posting.text);
  const known = new Set(state.customSkills.map((skill) => skill.evidence));
  const left = unread.filter((line) => !known.has(line));
  const counted = hits.filter((hit) => !state.ignoredSkills.includes(hit.skillId));
  return h(
    "li",
    { class: "row" },
    h(
      "div",
      { class: "row-head" },
      h("span", { class: "row-title" }, [posting.company, posting.title].filter(Boolean).join(" ") || "이름 없는 공고"),
      button("삭제", () => mutate((draft) => {
        draft.postings = draft.postings.filter((item) => item.id !== posting.id);
        replanned(draft);
      }, "공고를 삭제했어요."), "link-button", { "aria-label": `${posting.company} 공고 삭제` }),
    ),
    h("div", { class: "tags" }, counted.map((hit) =>
      h("span", { class: "tag", title: hit.evidence }, `${SKILL_BY_ID.get(hit.skillId).label} ${TYPE_LABEL[hit.type]}`),
    )),
    !counted.length ? h("p", { class: "muted small" }, "찾은 역량이 없어요. 아래 요건을 직접 추가해 주세요.") : null,
    left.length
      ? h(
          "details",
          { open: true },
          h("summary", { class: "small" }, `사전에 없어 못 읽은 요건 ${left.length}개`),
          h(
            "ul",
            { class: "unread" },
            left.map((line) =>
              h(
                "li",
                { class: "small" },
                h("div", {}, line),
                button("역량으로 추가", () => addCustomSkill(line), "link-button"),
              ),
            ),
          ),
        )
      : null,
  );
}

function addCustomSkill(line) {
  const dialog = openDialog(
    "역량으로 추가",
    h("p", { class: "small muted" }, line),
    h(
      "form",
      {
        class: "form",
        onsubmit: handleSubmit((input) => {
          const label = input.label.trim();
          if (!label) throw new Error("역량 이름을 적어 주세요.");
          dialog.close();
          mutate((draft) => {
            draft.customSkills.push({ id: `custom:${uid()}`, label, evidence: line });
            replanned(draft);
          }, `역량을 추가했어요: ${label}`);
        }),
      },
      field("역량 이름", h("input", { name: "label", required: true, maxlength: 20, autocomplete: "off" }), "서가의 책 등에 들어가니 짧게 적어 주세요."),
      errorSlot(),
      h(
        "div",
        { class: "actions" },
        h("button", { type: "submit", class: "button primary" }, "추가하기"),
        button("닫기", () => dialog.close(), "button quiet"),
      ),
    ),
  );
}

function viewPostings() {
  const form = h(
    "form",
    {
      class: "form",
      onsubmit: handleSubmit((input) => {
        const body = input.posting.trim();
        if (body.length < 20) throw new Error("공고 본문을 조금 더 붙여넣어 주세요.");
        const { hits } = analyzePosting(body);
        mutate((draft) => {
          draft.postings.push({ id: uid(), company: input.company.trim(), title: input.title.trim(), text: body });
          replanned(draft);
        }, `공고를 넣었어요. 역량 ${hits.length}개를 찾았어요.`);
      }),
    },
    h(
      "div",
      { class: "form-grid" },
      field("회사 이름 (선택)", h("input", { name: "company", maxlength: 80, autocomplete: "off" })),
      field("공고 제목 (선택)", h("input", { name: "title", maxlength: 80, autocomplete: "off" })),
    ),
    field("채용공고 본문", h("textarea", { name: "posting", required: true, maxlength: 20000 }), "자격요건, 우대사항 같은 제목까지 함께 붙여넣으면 구분이 정확해져요."),
    errorSlot(),
    h("button", { type: "submit", class: "button primary" }, "공고 넣기"),
  );
  return h(
    "main",
    {},
    h(
      "div",
      { class: "columns" },
      h("section", {}, h("h1", { class: "panel-title" }, "공고 추가"), form),
      h(
        "section",
        {},
        h("h2", {}, `넣은 공고 ${state.postings.length}개`),
        state.postings.length
          ? h("ul", { class: "rows" }, state.postings.map(postingRow))
          : h("p", { class: "muted" }, "관심 있는 공고를 3개 이상 넣어 보세요."),
        state.ignoredSkills.length
          ? h(
              "div",
              { class: "section" },
              h("h2", { class: "panel-title" }, "뺀 역량"),
              h(
                "div",
                { class: "tags" },
                state.ignoredSkills.map((skillId) =>
                  button(`${SKILL_BY_ID.get(skillId)?.label ?? skillId} 되돌리기`, () =>
                    mutate((draft) => {
                      draft.ignoredSkills = draft.ignoredSkills.filter((item) => item !== skillId);
                      replanned(draft);
                    }), "button quiet"),
                ),
              ),
            )
          : null,
      ),
    ),
  );
}

// ---------- 경험 은행 ----------
function viewExperiences() {
  const draft = editingExperience ?? {};
  const skills = diagnosis().skills;
  const form = h(
    "form",
    {
      class: "form",
      onsubmit: handleSubmit((input, element) => {
        const title = input.title.trim();
        if (!title) throw new Error("경험 이름을 적어 주세요.");
        const chosen = [...element.querySelectorAll("input[name=skill]:checked")].map((box) => box.value);
        const entry = {
          id: draft.id ?? uid(),
          title,
          situation: input.situation.trim(),
          action: input.action.trim(),
          result: input.result.trim(),
          evidence: input.evidence.trim(),
          skills: chosen,
          fromTask: draft.fromTask ?? "",
        };
        editingExperience = null;
        mutate((data) => {
          const index = data.experiences.findIndex((item) => item.id === entry.id);
          if (index >= 0) data.experiences[index] = entry;
          else data.experiences.push(entry);
          replanned(data);
        }, entry.evidence ? "경험을 저장했어요." : "저장했어요. 증거를 붙이면 역량이 채워져요.");
      }),
    },
    field("경험 이름", h("input", { name: "title", required: true, maxlength: 120, autocomplete: "off", value: draft.title ?? "" })),
    field("상황과 과제 (S·T)", h("textarea", { class: "short", name: "situation", maxlength: 1000 }, draft.situation ?? "")),
    field("내 행동 (A)", h("textarea", { class: "short", name: "action", maxlength: 1000 }, draft.action ?? "")),
    field("결과 (R)", h("textarea", { class: "short", name: "result", maxlength: 1000 }, draft.result ?? ""), "가능하면 숫자로 적어 주세요."),
    field("증거", h("input", { name: "evidence", maxlength: 500, autocomplete: "off", value: draft.evidence ?? "" }), "링크나 파일 이름. 없으면 역량을 채운 것으로 세지 않아요."),
    h(
      "fieldset",
      {},
      h("legend", { class: "legend-title" }, "이 경험이 보여 주는 역량"),
      skills.length
        ? h(
            "div",
            { class: "check-grid" },
            skills.map((skill) =>
              h("label", {}, h("input", { type: "checkbox", name: "skill", value: skill.id, checked: draft.skills?.includes(skill.id) }), skill.label),
            ),
          )
        : h("p", { class: "hint" }, "공고를 넣으면 고를 역량이 나와요."),
    ),
    errorSlot(),
    h(
      "div",
      { class: "actions" },
      h("button", { type: "submit", class: "button primary" }, draft.id ? "경험 수정" : "경험 저장"),
      draft.id
        ? button("취소", () => {
            editingExperience = null;
            render();
          }, "button quiet")
        : null,
    ),
  );
  return h(
    "main",
    {},
    h(
      "div",
      { class: "columns" },
      h("section", {}, h("h1", { class: "panel-title" }, draft.id ? "경험 수정" : "경험 추가"), form),
      h(
        "section",
        {},
        h("h2", {}, `쌓인 경험 ${state.experiences.length}개`),
        state.experiences.length
          ? h(
              "ul",
              { class: "rows" },
              state.experiences.map((experience) =>
                h(
                  "li",
                  { class: "row" },
                  h("div", { class: "row-head" }, h("span", { class: "row-title" }, experience.title)),
                  experience.result ? h("p", { class: "small" }, experience.result) : null,
                  h("p", { class: "small" }, "증거: ", evidenceNode(experience.evidence)),
                  h("div", { class: "tags" }, experience.skills.map((skillId) => {
                    const label = SKILL_BY_ID.get(skillId)?.label ?? state.customSkills.find((skill) => skill.id === skillId)?.label;
                    return label ? h("span", { class: "tag" }, label) : null;
                  })),
                  h(
                    "div",
                    { class: "actions" },
                    button("수정", () => {
                      editingExperience = experience;
                      render();
                      window.scrollTo(0, 0);
                    }, "link-button", { "aria-label": `${experience.title} 수정` }),
                    button("삭제", () => confirmAction("경험을 삭제할까요?", experience.title, "삭제", () =>
                      mutate((data) => {
                        data.experiences = data.experiences.filter((item) => item.id !== experience.id);
                        if (experience.fromTask) delete data.done[experience.fromTask];
                        replanned(data);
                      }, "경험을 삭제했어요.")), "link-button", { "aria-label": `${experience.title} 삭제` }),
                  ),
                ),
              ),
            )
          : h("p", { class: "muted" }, "수업 과제, 동아리, 인턴 경험을 하나 적어 보세요."),
      ),
    ),
  );
}

// ---------- 일정 ----------
function viewSchedule() {
  const now = today();
  const skills = diagnosis().skills;
  const deadlineForm = h(
    "form",
    {
      class: "form",
      onsubmit: handleSubmit((input) => {
        const date = input.date;
        if (date < now) throw new Error("오늘 이후 날짜를 골라 주세요.");
        mutate((draft) => {
          draft.deadlines.push({
            id: uid(),
            title: input.title.trim(),
            date,
            kind: input.kind,
            prepMinutes: Math.round(Number(input.prepHours) * 60),
          });
          replanned(draft);
        }, "마감을 넣었어요. 준비 시간을 빼고 계획을 다시 짰어요.");
      }),
    },
    field("이름", h("input", { name: "title", required: true, maxlength: 120, autocomplete: "off" })),
    h(
      "div",
      { class: "form-grid" },
      field("날짜", h("input", { name: "date", type: "date", required: true, min: now })),
      field("종류", h("select", { name: "kind" }, DEADLINE_KINDS.map((kind) => h("option", { value: kind }, kind)))),
    ),
    field("준비 시간", h("input", { name: "prepHours", type: "number", min: 0, max: 100, step: 0.5, required: true, value: 3 }), "마감 전 3일에 나눠서 진로 준비 시간에서 빼요."),
    errorSlot(),
    h("button", { type: "submit", class: "button primary" }, "마감 추가"),
  );
  const taskForm = h(
    "form",
    {
      class: "form",
      onsubmit: handleSubmit((input) => {
        if (input.date < now) throw new Error("오늘 이후 날짜를 골라 주세요.");
        mutate((draft) => {
          draft.customTasks.push({
            id: `task-${uid()}`,
            title: input.title.trim(),
            date: input.date,
            minutes: Math.round(Number(input.minutes)),
            skillId: input.skillId,
          });
          replanned(draft);
        }, "할 일을 넣었어요.");
      }),
    },
    field("할 일", h("input", { name: "title", required: true, maxlength: 200, autocomplete: "off" })),
    h(
      "div",
      { class: "form-grid" },
      field("날짜", h("input", { name: "date", type: "date", required: true, min: now, value: now })),
      field("걸리는 시간 (분)", h("input", { name: "minutes", type: "number", min: 5, max: 600, step: 5, required: true, value: 60 })),
    ),
    field(
      "연결할 역량 (선택)",
      h("select", { name: "skillId" }, h("option", { value: "" }, "없음"), skills.map((skill) => h("option", { value: skill.id }, skill.label))),
    ),
    errorSlot(),
    h("button", { type: "submit", class: "button primary" }, "할 일 추가"),
  );
  const deadlines = [...state.deadlines].sort((a, b) => a.date.localeCompare(b.date));
  return h(
    "main",
    {},
    h(
      "div",
      { class: "columns" },
      h(
        "section",
        {},
        h("h1", { class: "panel-title" }, "시험·과제 마감"),
        deadlineForm,
        h(
          "ul",
          { class: "rows section" },
          deadlines.map((item) =>
            h(
              "li",
              { class: "row row-head" },
              h("span", {}, `${shortDate(item.date)} ${item.title}`, h("span", { class: "task-meta" }, ` ${item.kind}, 준비 ${formatMinutes(item.prepMinutes)}`)),
              button("삭제", () => mutate((draft) => {
                draft.deadlines = draft.deadlines.filter((entry) => entry.id !== item.id);
                replanned(draft);
              }, "마감을 삭제했어요."), "link-button", { "aria-label": `${item.title} 삭제` }),
            ),
          ),
        ),
      ),
      h("section", {}, h("h2", {}, "내가 직접 넣는 할 일"), taskForm),
    ),
  );
}

// ---------- 설정 ----------
function viewSettings() {
  const profileForm = h(
    "form",
    {
      class: "form",
      onsubmit: handleSubmit((input) => {
        const profile = readProfile(input, state.profile);
        mutate((draft) => {
          draft.profile = profile;
          replanned(draft);
        }, "설정을 저장했어요. 계획을 다시 짰어요.");
      }),
    },
    ...profileFields(state.profile),
    errorSlot(),
    h("button", { type: "submit", class: "button primary" }, "설정 저장"),
  );
  const { requiredCredits, earnedCredits, courses } = state.graduation;
  const graduationForm = h(
    "form",
    {
      class: "form",
      onsubmit: handleSubmit((input) => {
        const done = new Map(courses.map((course) => [course.name, course.done]));
        const names = [...new Set(input.courses.split("\n").map((line) => line.trim()).filter(Boolean))];
        mutate((draft) => {
          draft.graduation = {
            requiredCredits: Number(input.requiredCredits),
            earnedCredits: Number(input.earnedCredits),
            courses: names.slice(0, 100).map((name) => ({ name: name.slice(0, 80), done: done.get(name) === true })),
          };
        }, "졸업요건을 저장했어요.");
      }),
    },
    h(
      "div",
      { class: "form-grid" },
      field("졸업 학점", h("input", { name: "requiredCredits", type: "number", min: 0, max: 400, step: 0.5, required: true, value: requiredCredits })),
      field("지금까지 딴 학점", h("input", { name: "earnedCredits", type: "number", min: 0, max: 400, step: 0.5, required: true, value: earnedCredits })),
    ),
    field("필수 과목", h("textarea", { class: "short", name: "courses" }, courses.map((course) => course.name).join("\n")), "한 줄에 한 과목씩 적어 주세요."),
    errorSlot(),
    h("button", { type: "submit", class: "button primary" }, "졸업요건 저장"),
  );
  const importInput = h("input", {
    type: "file",
    accept: ".json,application/json",
    hidden: true,
    "aria-label": "백업 파일 선택",
    onchange: async (event) => {
      const [file] = event.target.files;
      event.target.value = "";
      if (file) await importFile(file).catch((problem) => toast(problem.message));
    },
  });
  return h(
    "main",
    {},
    h(
      "div",
      { class: "columns" },
      h("section", {}, h("h1", { class: "panel-title" }, "내 정보"), profileForm),
      h(
        "section",
        {},
        h("h2", {}, "졸업요건"),
        graduationForm,
        h(
          "div",
          { class: "section" },
          h("h2", { class: "panel-title" }, "내 데이터"),
          h("p", { class: "small muted" }, `최근 14일 중 ${recentActiveDays(state, today())}일 사용했어요.`),
          h(
            "div",
            { class: "actions" },
            state.isSample ? null : button("JSON 백업", exportJson, "button quiet"),
            button("백업 불러오기", () => confirmAction("지금 데이터를 바꿀까요?", "불러온 파일의 내용으로 대시보드 전체가 바뀌어요. 지금 내용이 필요하면 먼저 저장해 주세요.", "파일 고르기", () => importInput.click()), "button quiet"),
            importInput,
            button("처음부터 다시 만들기", () => confirmAction(
              "모든 데이터를 지울까요?",
              "이 브라우저의 자동 저장을 지워요. 저장해 둔 HTML이나 백업 파일이 없으면 되돌릴 수 없어요.",
              "전부 지우기",
              () => {
                clearStore(state.ownerId);
                state = null;
                view = "dashboard";
                render();
              },
            ), "button danger"),
          ),
        ),
      ),
    ),
  );
}

// ---------- 렌더 ----------
const VIEWS = { dashboard: viewDashboard, postings: viewPostings, experiences: viewExperiences, schedule: viewSchedule, settings: viewSettings };

const VIEW_TITLE = { dashboard: "대시보드", postings: "공고", experiences: "경험 은행", schedule: "일정", settings: "설정" };
const APP_TITLE = "덕스텝";

// 다시 그린 뒤에도 포커스를 잃지 않게 한다. 같은 키의 요소가 없으면 화면 제목으로 보낸다.
function restoreFocus(focusKey, hadFocus) {
  const target = focusKey && root.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
  if (target) return target.focus();
  if (!hadFocus) return;
  const heading = root.querySelector("main h1");
  heading?.setAttribute("tabindex", "-1");
  heading?.focus();
}

function render() {
  const active = document.activeElement;
  const focusKey = active?.dataset?.key;
  const hadFocus = Boolean(active && active !== document.body && root.contains(active));
  cachedDiagnosis = null;
  if (!state) {
    document.title = APP_TITLE;
    root.replaceChildren(
      h("div", { class: "shell" }, loadProblem ? h("div", { class: "notice alert", role: "alert" }, loadProblem) : null),
      viewIntro(),
    );
    restoreFocus(focusKey, hadFocus);
    return;
  }
  const now = today();
  ensureWeek(state, now, deriveTasks(state, diagnosis()));
  document.title = `${VIEW_TITLE[view]} · ${APP_TITLE}`;
  root.replaceChildren(h("div", { class: "shell" }, topbar(), notices(), VIEWS[view]()));
  restoreFocus(focusKey, hadFocus);
}

state = loadInitialState();
if (state) {
  recordVisit(state, today());
  persist();
}
render();
// 자정을 넘겨 켜 둔 탭도 날짜가 바뀌도록 다시 그린다.
let renderedDay = today();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && renderedDay !== today()) {
    renderedDay = today();
    if (state) recordVisit(state, renderedDay);
    if (!root.querySelector("dialog[open]")) render();
  }
});
