// 화면과 무관한 순수 계산. 공고 분석, 갭 진단, 로드맵, 주간 계획을 맡는다.
import { SKILLS, SKILL_BY_ID, skillMatcher } from "./skills.js";

export const SCHEMA_VERSION = 1;
export const DAILY_LIMIT = 3;
const WEEKDAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];
const PLANNING_BUFFER = 0.7; // 계획 시간의 30%는 일정이 밀릴 때를 위해 비워 둔다.
const PREP_DAYS = 3;
const WEIGHT = { required: 3, duties: 2, preferred: 1 };

// ---------- 날짜: 시간대 밀림을 막으려고 항상 YYYY-MM-DD 문자열을 쓴다 ----------
const pad = (value) => String(value).padStart(2, "0");
export const toIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export function parseIso(text) {
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year, month - 1, day);
}
export function isIsoDate(text) {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  return toIso(parseIso(text)) === text;
}
export function addDays(text, days) {
  const date = parseIso(text);
  date.setDate(date.getDate() + days);
  return toIso(date);
}
export const diffDays = (from, to) => Math.round((parseIso(to) - parseIso(from)) / 86400000);
export const weekdayIndex = (text) => (parseIso(text).getDay() + 6) % 7;
export const weekdayName = (text) => WEEKDAY_NAMES[weekdayIndex(text)];
export const weekStart = (text) => addDays(text, -weekdayIndex(text));
export const weekDates = (text) => {
  const start = weekStart(text);
  return WEEKDAY_NAMES.map((_, index) => addDays(start, index));
};

export function formatMinutes(minutes) {
  const rounded = Math.round(minutes);
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours && rest) return `${hours}시간 ${rest}분`;
  return hours ? `${hours}시간` : `${rest}분`;
}

export function uid() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ---------- 상태 ----------
export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    ownerId: uid(),
    updatedAt: 0,
    isSample: false,
    profile: {
      name: "",
      role: "",
      graduationYear: new Date().getFullYear() + 1,
      graduationTerm: 2,
      availability: [90, 90, 90, 90, 90, 180, 120],
      vacationWeeklyMinutes: 900,
    },
    postings: [],
    ignoredSkills: [],
    customSkills: [],
    experiences: [],
    deadlines: [],
    customTasks: [],
    done: {},
    week: null,
    graduation: { requiredCredits: 0, earnedCredits: 0, courses: [] },
    activeDays: [],
    lastExportAt: 0,
  };
}

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
const number = (value, min, max, fallback) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const list = (value, max, parse) => (Array.isArray(value) ? value.slice(0, max).map(parse).filter(Boolean) : []);
const id = (value) => (typeof value === "string" && /^[\w:-]{1,80}$/.test(value) ? value : uid());

// 저장 파일은 손으로 고치거나 남에게 받을 수 있으므로 읽을 때마다 전부 검사한다.
export function normalizeState(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("플래너 데이터 형식이 아니에요.");
  if (raw.version !== SCHEMA_VERSION) throw new Error(`지원하지 않는 데이터 버전이에요: ${raw.version}`);
  const base = emptyState();
  const profile = raw.profile ?? {};
  const availability = Array.isArray(profile.availability) ? profile.availability : [];
  const stringList = (value) => list(value, 500, (item) => text(item, 120));
  const done = {};
  for (const [taskId, entry] of Object.entries(raw.done ?? {}).slice(0, 5000)) {
    if (/^[\w:-]{1,80}$/.test(taskId) && isIsoDate(entry?.on)) {
      done[taskId] = { on: entry.on, title: text(entry.title, 200), minutes: number(entry.minutes, 0, 1440, 0) };
    }
  }
  const validWeek = raw.week && isIsoDate(raw.week.start);
  return {
    ...base,
    ownerId: typeof raw.ownerId === "string" && /^[a-f0-9]{16}$/.test(raw.ownerId) ? raw.ownerId : base.ownerId,
    updatedAt: number(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    isSample: raw.isSample === true,
    profile: {
      name: text(profile.name, 40),
      role: text(profile.role, 60),
      graduationYear: Math.round(number(profile.graduationYear, 2000, 2100, base.profile.graduationYear)),
      graduationTerm: profile.graduationTerm === 1 ? 1 : 2,
      availability: base.profile.availability.map((fallback, index) => number(availability[index], 0, 1440, fallback)),
      vacationWeeklyMinutes: number(profile.vacationWeeklyMinutes, 0, 10080, base.profile.vacationWeeklyMinutes),
    },
    postings: list(raw.postings, 100, (item) =>
      item && typeof item.text === "string"
        ? { id: id(item.id), company: text(item.company, 80), title: text(item.title, 80), text: text(item.text, 20000) }
        : null,
    ),
    ignoredSkills: stringList(raw.ignoredSkills),
    customSkills: list(raw.customSkills, 100, (item) =>
      item && text(item.label, 40) ? { id: id(item.id), label: text(item.label, 40), evidence: text(item.evidence, 300) } : null,
    ),
    experiences: list(raw.experiences, 1000, (item) =>
      item && text(item.title, 120)
        ? {
            id: id(item.id),
            title: text(item.title, 120),
            situation: text(item.situation, 1000),
            action: text(item.action, 1000),
            result: text(item.result, 1000),
            evidence: text(item.evidence, 500),
            skills: stringList(item.skills),
            fromTask: typeof item.fromTask === "string" ? text(item.fromTask, 80) : "",
          }
        : null,
    ),
    deadlines: list(raw.deadlines, 500, (item) =>
      item && text(item.title, 120) && isIsoDate(item.date)
        ? {
            id: id(item.id),
            title: text(item.title, 120),
            date: item.date,
            kind: text(item.kind, 20) || "과제",
            prepMinutes: number(item.prepMinutes, 0, 6000, 0),
          }
        : null,
    ),
    customTasks: list(raw.customTasks, 2000, (item) =>
      item && text(item.title, 200) && isIsoDate(item.date)
        ? {
            id: id(item.id),
            title: text(item.title, 200),
            date: item.date,
            minutes: number(item.minutes, 5, 1440, 60),
            skillId: text(item.skillId, 80),
          }
        : null,
    ),
    done,
    week: validWeek
      ? {
          start: raw.week.start,
          items: list(raw.week.items, 200, (item) =>
            item && isIsoDate(item.date) ? { id: id(item.id), date: item.date, pinned: item.pinned === true } : null,
          ),
        }
      : null,
    graduation: {
      requiredCredits: number(raw.graduation?.requiredCredits, 0, 400, base.graduation.requiredCredits),
      earnedCredits: number(raw.graduation?.earnedCredits, 0, 400, 0),
      courses: list(raw.graduation?.courses, 100, (item) =>
        item && text(item.name, 80) ? { name: text(item.name, 80), done: item.done === true } : null,
      ),
    },
    activeDays: list(raw.activeDays, 400, (item) => (isIsoDate(item) ? item : null)),
    lastExportAt: number(raw.lastExportAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}

// 데이터 속 닫는 스크립트 태그가 저장한 HTML의 스크립트를 끊지 못하게 막는다.
export const embedJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

// http(s) 주소만 링크로 만든다. javascript: 같은 주소는 글자로만 보여 준다.
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// ---------- 공고 분석 ----------
const HEADERS = [
  ["required", /^(자격\s*요건|지원\s*자격|필수(\s*(요건|사항|조건|역량))?|요구\s*(사항|역량|조건)|이런\s*분을\s*(찾|모).*|requirements?|qualifications?)$/i],
  ["preferred", /^(우대\s*(사항|조건|요건|역량)?|이런\s*분이면\s*더.*|preferred(\s+qualifications?)?|nice\s+to\s+have)$/i],
  ["duties", /^(담당\s*업무|주요\s*(업무|역할)|수행\s*업무|업무\s*내용|직무\s*내용|하는\s*일|이런\s*(일|업무)을.*|(포지션|직무)\s*소개|responsibilities|what\s+you.?ll\s+do)$/i],
  ["ignore", /^(복리\s*후생|복지|혜택(\s*및\s*복지)?|근무\s*(조건|환경|지|시간|형태)|전형\s*(절차|과정)|채용\s*(절차|과정|전형)|(회사|기업|팀|서비스)\s*소개|접수\s*(기간|방법)|제출\s*서류|기타\s*(사항|안내)?|유의\s*사항|benefits|about\s+us)$/i],
];
const ADMIN_LINE = /(학력|전공\s*무관|경력\s*(무관|\d)|신입|병역|해외\s*여행|성별|연령|나이|졸업|마감|채용\s*시)/;
const matchers = SKILLS.map((skill) => [skill.id, skillMatcher(skill)]);

const cleanLine = (line) =>
  line
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/^[\s\-–—*•·▪■□●○◦▶▷►※#>\[\]【】<]+/, "")
    .replace(/[\s\]】>]+$/, "")
    .trim();

function headerType(line) {
  const plain = line.replace(/[\s:：]+$/, "");
  return HEADERS.find(([, pattern]) => pattern.test(plain))?.[0] ?? null;
}

export function analyzePosting(source) {
  const best = new Map();
  const unread = [];
  let section = null;
  const lines = source
    .replace(/\r\n?/g, "\n")
    .split(/\n|(?<=[.!?])\s+|\s*[•▪■●◦]\s*/);
  for (const rawLine of lines) {
    let line = cleanLine(rawLine);
    if (!line) continue;
    const header = headerType(line);
    if (header) {
      section = header;
      continue;
    }
    const inline = line.match(/^([^:：]{2,16})\s*[:：]\s*(.+)$/);
    const inlineHeader = inline && headerType(inline[1]);
    if (inlineHeader) {
      section = inlineHeader;
      line = cleanLine(inline[2]);
    }
    if (section === "ignore") continue;

    let type = section ?? "duties";
    if (/우대/.test(line)) type = "preferred";
    else if (/필수/.test(line)) type = "required";

    const found = matchers.filter(([, matches]) => matches(line)).map(([skillId]) => skillId);
    for (const skillId of found) {
      const current = best.get(skillId);
      if (!current || WEIGHT[type] > WEIGHT[current.type]) {
        best.set(skillId, { skillId, type, evidence: line.slice(0, 200) });
      }
    }
    if (!found.length && type === "required" && line.length >= 8 && !ADMIN_LINE.test(line)) unread.push(line.slice(0, 200));
  }
  return { hits: [...best.values()], unread: unread.slice(0, 20) };
}

// ---------- 갭 진단 ----------
export function skillLabel(state, skillId) {
  return (
    SKILL_BY_ID.get(skillId)?.label ??
    state.customSkills.find((skill) => skill.id === skillId)?.label ??
    skillId
  );
}

function skillStatus(state, skillId) {
  const linked = state.experiences.filter((experience) => experience.skills.includes(skillId));
  if (linked.some((experience) => experience.evidence.trim())) return "proven";
  return linked.length ? "partial" : "missing";
}

export function diagnose(state) {
  const skills = new Map();
  const add = (skillId, type, evidence) => {
    if (state.ignoredSkills.includes(skillId)) return;
    const entry = skills.get(skillId) ?? {
      id: skillId,
      label: skillLabel(state, skillId),
      required: 0,
      preferred: 0,
      duties: 0,
      evidence: [],
    };
    entry[type] += 1;
    entry.evidence.push(evidence);
    skills.set(skillId, entry);
  };
  for (const posting of state.postings) {
    for (const hit of analyzePosting(posting.text).hits) {
      add(hit.skillId, hit.type, { company: posting.company, type: hit.type, text: hit.evidence });
    }
  }
  for (const skill of state.customSkills) {
    add(skill.id, "required", { company: "직접 추가", type: "required", text: skill.evidence || skill.label });
  }
  const all = [...skills.values()].map((skill) => {
    const status = skillStatus(state, skill.id);
    const score = skill.required * WEIGHT.required + skill.duties * WEIGHT.duties + skill.preferred * WEIGHT.preferred;
    const mentions = skill.required + skill.duties + skill.preferred;
    return { ...skill, status, score, mentions, essential: skill.required > 0 };
  });
  all.sort(
    (a, b) => Number(b.essential) - Number(a.essential) || b.score - a.score || a.label.localeCompare(b.label, "ko"),
  );
  return {
    skills: all,
    essential: all.filter((skill) => skill.essential),
    preferred: all.filter((skill) => !skill.essential),
    proven: all.filter((skill) => skill.status === "proven").length,
    total: all.length,
  };
}

// ---------- 할 일 사다리 ----------
const PRACTICE_COUNT = { S: 3, M: 5, L: 8 };
const SESSION_MINUTES = 60; // 평일 저녁에도 들어가도록 한 번은 1시간으로 쪼갠다.

export function ladder(skillId, label) {
  const skill = SKILL_BY_ID.get(skillId);
  const group = skill?.group ?? "tech";
  const step = (key, title, minutes) => ({ step: key, title, minutes });
  if (group === "soft") {
    return [
      step("recall", `${label} 사례 3개 떠올려 적기`, 45),
      step("write", `가장 좋은 ${label} 사례를 S·T / A / R로 정리하기`, 60),
      step("prove", `${label} 사례의 증거 모으기 (회의록, 결과물, 피드백)`, 45),
    ];
  }
  if (group === "cert") {
    return [
      step("schedule", `${label} 시험 일정과 접수 기간 확인하기`, 30),
      step("exam", `${label} 기출 한 회차 풀기`, 120),
      step("review", `${label} 오답 정리하기`, 90),
      step("prove", `${label} 응시하고 성적표 남기기`, 60),
    ];
  }
  if (group === "lang") {
    return [
      step("level", `${label} 현재 실력 점검하기`, 60),
      step("practice-1", `${label} 업무 표현 연습하기 1/2`, 90),
      step("practice-2", `${label} 업무 표현 연습하기 2/2`, 90),
      step("prove", `${label} 실력을 보여 줄 성적표나 자료 남기기`, 60),
    ];
  }
  const count = PRACTICE_COUNT[skill?.size ?? "M"];
  const practice = Array.from({ length: count }, (_, index) =>
    step(`practice-${index + 1}`, `${label} 실습 ${index + 1}/${count}`, SESSION_MINUTES),
  );
  return [step("learn", `${label} 핵심 개념 정리하기`, SESSION_MINUTES), ...practice, step("prove", `${label} 결과물을 정리하고 증거 남기기`, SESSION_MINUTES)];
}

export function deriveTasks(state, diagnosis = diagnose(state)) {
  const queue = [];
  for (const skill of diagnosis.skills) {
    if (skill.status === "proven") continue;
    const steps =
      skill.status === "partial"
        ? [{ step: "prove", title: `${skill.label} 경험의 증거 찾아 붙이기`, minutes: 30 }]
        : ladder(skill.id, skill.label);
    const open = steps
      .map((step) => ({
        ...step,
        id: `${skill.id}:${step.step}`,
        skillId: skill.id,
        label: skill.label,
        requiresEvidence: step.step === "prove",
      }))
      .filter((task) => !state.done[task.id]);
    if (open.length) queue.push({ skill, open, minutes: open.reduce((sum, task) => sum + task.minutes, 0) });
  }
  // 필수, 직무 역량, 태도 역량 순으로 나누고 같은 등급에서는 가치 대비 노력이 큰 역량부터.
  const isSoft = (entry) => Number(SKILL_BY_ID.get(entry.skill.id)?.group === "soft");
  queue.sort(
    (a, b) =>
      Number(b.skill.essential) - Number(a.skill.essential) ||
      isSoft(a) - isSoft(b) ||
      b.skill.score / b.minutes - a.skill.score / a.minutes ||
      a.skill.label.localeCompare(b.skill.label, "ko"),
  );
  return queue;
}

export const queueTasks = (queue) => queue.flatMap((entry) => entry.open);

export function completeTask(state, task, today, details = {}) {
  if (task.requiresEvidence && !details.evidence?.trim()) throw new Error("증거 링크나 파일 이름을 적어 주세요.");
  state.done[task.id] = { on: today, title: task.title, minutes: task.minutes };
  if (task.requiresEvidence) {
    state.experiences.push({
      id: uid(),
      title: task.title,
      situation: "",
      action: "",
      result: details.result?.trim() ?? "",
      evidence: details.evidence.trim(),
      skills: [task.skillId],
      fromTask: task.id,
    });
  }
}

export function undoTask(state, taskId) {
  delete state.done[taskId];
  state.experiences = state.experiences.filter((experience) => experience.fromTask !== taskId);
}

// ---------- 시간 ----------
export const isVacation = (date) => {
  const month = parseIso(date).getMonth() + 1;
  return month <= 2 || month === 7 || month === 8;
};

export function dayCapacity(state, date) {
  const { availability, vacationWeeklyMinutes } = state.profile;
  const termWeekly = availability.reduce((sum, minutes) => sum + minutes, 0);
  let minutes = availability[weekdayIndex(date)];
  if (isVacation(date)) {
    minutes = termWeekly ? (minutes * vacationWeeklyMinutes) / termWeekly : vacationWeeklyMinutes / 7;
  }
  for (const deadline of state.deadlines) {
    const daysLeft = diffDays(date, deadline.date);
    if (daysLeft >= 1 && daysLeft <= PREP_DAYS) minutes -= deadline.prepMinutes / PREP_DAYS;
  }
  return Math.max(0, Math.round(minutes));
}

// ---------- 주간 계획 ----------
function resolveTasks(state, queue) {
  const map = new Map(queueTasks(queue).map((task) => [task.id, task]));
  for (const task of state.customTasks) {
    map.set(task.id, { ...task, label: skillLabel(state, task.skillId), custom: true, requiresEvidence: false });
  }
  return map;
}

export function buildWeek(state, today, queue = deriveTasks(state)) {
  const tasks = resolveTasks(state, queue);
  const start = weekStart(today);
  const end = addDays(start, 6);
  const dates = weekDates(today).filter((date) => date >= today);
  const used = new Map();
  const count = new Map();
  const occupy = (date, minutes) => {
    used.set(date, (used.get(date) ?? 0) + minutes);
    count.set(date, (count.get(date) ?? 0) + 1);
  };
  for (const entry of Object.values(state.done)) if (entry.on === today) occupy(today, entry.minutes);

  const items = [];
  const placed = new Set();
  const place = (id, date, pinned) => {
    items.push({ id, date, pinned });
    placed.add(id);
    occupy(date, tasks.get(id).minutes);
  };

  const previous = state.week?.start === start ? state.week.items : [];
  for (const item of previous) {
    if (state.done[item.id]) {
      items.push(item);
      placed.add(item.id);
    }
  }
  for (const item of previous) {
    if (item.pinned && tasks.has(item.id) && !state.done[item.id] && item.date >= today) place(item.id, item.date, true);
  }
  for (const task of state.customTasks) {
    if (!state.done[task.id] && !placed.has(task.id) && task.date <= end) place(task.id, task.date, true);
  }

  const maxCapacity = Math.max(0, ...dates.map((date) => dayCapacity(state, date)));
  let cursor = 0;
  for (const task of queueTasks(queue)) {
    if (placed.has(task.id)) continue;
    const need = Math.min(task.minutes, maxCapacity);
    if (need === 0) break;
    while (cursor < dates.length) {
      const date = dates[cursor];
      const free = dayCapacity(state, date) - (used.get(date) ?? 0);
      if (free >= need && (count.get(date) ?? 0) < DAILY_LIMIT) break;
      cursor += 1;
    }
    if (cursor === dates.length) break; // 뒤 단계가 앞 단계를 앞지르지 않도록 여기서 멈춘다.
    place(task.id, dates[cursor], false);
  }
  return { start, items };
}

export function ensureWeek(state, today, queue = deriveTasks(state)) {
  if (state.week?.start !== weekStart(today) || state.week.items.length === 0) {
    state.week = buildWeek(state, today, queue);
  }
}

export function weekView(state, today, queue = deriveTasks(state)) {
  const tasks = resolveTasks(state, queue);
  const items = (state.week?.items ?? [])
    .map((item, order) => {
      const entry = state.done[item.id];
      const task = tasks.get(item.id);
      if (!task && !entry) return null;
      return {
        ...(task ?? { id: item.id, title: entry.title, minutes: entry.minutes, label: "" }),
        date: item.date,
        order,
        done: Boolean(entry),
        overdue: !entry && item.date < today,
      };
    })
    .filter(Boolean);
  const days = weekDates(today).map((date) => ({
    date,
    capacity: dayCapacity(state, date),
    items: items.filter((item) => item.date === date),
  }));
  const open = items.filter((item) => !item.done);
  const due = open
    .filter((item) => item.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  return {
    days,
    today: due.slice(0, DAILY_LIMIT),
    waiting: due.length - Math.min(due.length, DAILY_LIMIT),
    overdue: open.filter((item) => item.overdue).length,
    upcoming: open.filter((item) => item.date > today),
    doneToday: items.filter((item) => item.done && state.done[item.id].on === today),
    plannedMinutes: items.reduce((sum, item) => sum + item.minutes, 0),
    capacityMinutes: days.reduce((sum, day) => sum + day.capacity, 0),
  };
}

export function moveTask(state, taskId, date) {
  const item = state.week.items.find((entry) => entry.id === taskId);
  if (item) Object.assign(item, { date, pinned: true });
  const custom = state.customTasks.find((task) => task.id === taskId);
  if (custom) custom.date = date;
}

export function upcomingDeadlines(state, today, days = 14) {
  return state.deadlines
    .map((deadline) => ({ ...deadline, daysLeft: diffDays(today, deadline.date) }))
    .filter((deadline) => deadline.daysLeft >= 0 && deadline.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ---------- 로드맵 ----------
function monthEnd(year, month) {
  return toIso(new Date(year, month, 0));
}

export const graduationEnd = (profile) =>
  profile.graduationTerm === 1 ? `${profile.graduationYear}-06-30` : `${profile.graduationYear}-12-31`;

export function academicPeriods(today, profile) {
  const end = graduationEnd(profile);
  const periods = [];
  for (let year = parseIso(today).getFullYear(); year <= profile.graduationYear; year += 1) {
    periods.push(
      { name: `${year} 겨울방학`, start: `${year}-01-01`, end: monthEnd(year, 2), vacation: true },
      { name: `${year} 1학기`, start: `${year}-03-01`, end: `${year}-06-30`, vacation: false },
      { name: `${year} 여름방학`, start: `${year}-07-01`, end: `${year}-08-31`, vacation: true },
      { name: `${year} 2학기`, start: `${year}-09-01`, end: `${year}-12-31`, vacation: false },
    );
  }
  return periods
    .filter((period) => period.end >= today && period.start <= end)
    .map((period) => {
      const start = period.start < today ? today : period.start;
      const stop = period.end > end ? end : period.end;
      return { ...period, start, end: stop, weeks: (diffDays(start, stop) + 1) / 7 };
    });
}

export function buildRoadmap(state, today, queue = deriveTasks(state)) {
  const termWeekly = state.profile.availability.reduce((sum, minutes) => sum + minutes, 0);
  const periods = academicPeriods(today, state.profile).map((period) => ({
    ...period,
    capacity: period.weeks * (period.vacation ? state.profile.vacationWeeklyMinutes : termWeekly) * PLANNING_BUFFER,
    skills: [],
  }));
  const unscheduled = [];
  let index = 0;
  let free = periods[0]?.capacity ?? 0;
  for (const { skill, minutes } of queue) {
    let left = minutes;
    while (left > 0 && index < periods.length) {
      if (free <= 0) {
        index += 1;
        free = periods[index]?.capacity ?? 0;
        continue;
      }
      const slice = Math.min(left, free);
      const skills = periods[index].skills;
      if (!skills.some((item) => item.id === skill.id)) skills.push({ id: skill.id, label: skill.label, status: skill.status });
      left -= slice;
      free -= slice;
    }
    if (left > 0) unscheduled.push({ id: skill.id, label: skill.label });
  }
  return { periods, unscheduled };
}

export function graduationSummary(state, today) {
  const { requiredCredits, earnedCredits, courses } = state.graduation;
  const remaining = Math.max(0, requiredCredits - earnedCredits);
  const terms = academicPeriods(today, state.profile).filter((period) => !period.vacation).length;
  return {
    requiredCredits,
    earnedCredits,
    remaining,
    terms,
    perTerm: terms ? Math.ceil(remaining / terms) : null,
    courses,
    openCourses: courses.filter((course) => !course.done).length,
  };
}

export function recordVisit(state, today) {
  if (!state.activeDays.includes(today)) state.activeDays = [...state.activeDays, today].slice(-400);
}

export const recentActiveDays = (state, today) =>
  state.activeDays.filter((day) => {
    const age = diffDays(day, today);
    return age >= 0 && age < 14;
  }).length;
