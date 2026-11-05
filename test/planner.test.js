// 진로 플래너의 계산을 검사합니다. 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, analyzePosting, buildRoadmap, buildWeek, completeTask, dayCapacity, deriveTasks, diagnose, embedJson,
  emptyState, ensureWeek, graduationSummary, moveTask, normalizeState, queueTasks, safeUrl, undoTask, weekStart,
  weekView, DAILY_LIMIT,
} from "../planner/src/engine.js";

const TODAY = "2026-11-05"; // 목요일
const POSTING = `
담당업무
- 서비스 지표 분석과 A/B 테스트 설계
자격요건
• SQL로 데이터를 추출할 수 있는 분
• 자바스크립트 경험 없어도 됩니다만 Python 필수
• 고객 불만을 스스로 끝까지 해결하는 분
우대사항
- Tableau 사용 경험
- 영어 문서 독해 가능자
복리후생
- 영어 회화반 지원, 통계 강의 제공
`;

function stateWith(text = POSTING) {
  const state = emptyState();
  state.profile.graduationYear = 2027;
  state.profile.graduationTerm = 2;
  state.postings = [{ id: "p1", company: "오리테크", title: "데이터 분석가", text }];
  return state;
}

const typeOf = (result, skillId) => result.hits.find((hit) => hit.skillId === skillId)?.type;

test("공고를 자격요건·우대·담당업무로 나누고 근거 문장을 남긴다", () => {
  const result = analyzePosting(POSTING);
  assert.equal(typeOf(result, "sql"), "required");
  assert.equal(typeOf(result, "python"), "required");
  assert.equal(typeOf(result, "tableau"), "preferred");
  assert.equal(typeOf(result, "english"), "preferred");
  assert.equal(typeOf(result, "abtest"), "duties");
  assert.match(result.hits.find((hit) => hit.skillId === "sql").evidence, /데이터를 추출/);
});

test("복리후생 안의 단어는 역량으로 세지 않는다", () => {
  assert.equal(typeOf(analyzePosting(POSTING), "stats"), undefined);
});

test("비슷한 글자를 다른 역량으로 착각하지 않는다", () => {
  const hit = (text, id) => typeOf(analyzePosting(`자격요건\n${text}`), id);
  assert.equal(hit("JavaScript 개발", "java"), undefined);
  assert.equal(hit("자바스크립트 개발", "java"), undefined);
  assert.equal(hit("자바 개발 경험", "java"), "required");
  assert.equal(hit("R&D 조직 경험", "r"), undefined);
  assert.equal(hit("R 또는 파이썬 사용", "r"), "required");
  assert.equal(hit("digital 감각", "git"), undefined);
});

test("읽지 못한 필수 요건은 숨기지 않고 돌려준다", () => {
  const { unread } = analyzePosting(POSTING);
  assert.deepEqual(unread, ["고객 불만을 스스로 끝까지 해결하는 분"]);
});

test("증거 없는 경험은 충족으로 세지 않는다", () => {
  const state = stateWith();
  state.experiences = [
    { id: "a", title: "SQL 스터디", situation: "", action: "", result: "", evidence: "", skills: ["sql"], fromTask: "" },
    { id: "b", title: "분석 리포트", situation: "", action: "", result: "", evidence: "report.pdf", skills: ["python"], fromTask: "" },
  ];
  const skills = new Map(diagnose(state).skills.map((skill) => [skill.id, skill]));
  assert.equal(skills.get("sql").status, "partial");
  assert.equal(skills.get("python").status, "proven");
  assert.equal(skills.get("tableau").status, "missing");
  assert.equal(diagnose(state).proven, 1);
});

test("필수 역량이 우대 역량보다 먼저 계획된다", () => {
  const queue = deriveTasks(stateWith());
  const lastEssential = queue.findLastIndex((entry) => entry.skill.essential);
  const firstPreferred = queue.findIndex((entry) => !entry.skill.essential);
  assert.ok(lastEssential < firstPreferred);
});

test("같은 필수 역량이면 직무 역량이 태도 역량보다 먼저다", () => {
  const queue = deriveTasks(stateWith("자격요건\n- 커뮤니케이션 능력\n- 협업 경험\n- Python 활용"));
  assert.equal(queue[0].skill.id, "python");
});

test("제외한 역량은 진단과 계획에서 빠진다", () => {
  const state = stateWith();
  state.ignoredSkills = ["sql"];
  assert.ok(!diagnose(state).skills.some((skill) => skill.id === "sql"));
  assert.ok(!queueTasks(deriveTasks(state)).some((task) => task.skillId === "sql"));
});

test("주간 계획은 하루 한도와 가용 시간을 넘지 않고 지난 날에 배정하지 않는다", () => {
  const state = stateWith();
  const week = buildWeek(state, TODAY);
  assert.ok(week.items.length > 0);
  assert.equal(week.start, weekStart(TODAY));
  const tasks = new Map(queueTasks(deriveTasks(state)).map((task) => [task.id, task]));
  const dates = new Set(week.items.map((item) => item.date));
  for (const date of dates) {
    const items = week.items.filter((item) => item.date === date);
    const minutes = items.reduce((sum, item) => sum + tasks.get(item.id).minutes, 0);
    assert.ok(date >= TODAY);
    assert.ok(items.length <= DAILY_LIMIT);
    assert.ok(minutes <= dayCapacity(state, date), `${date} ${minutes}`);
  }
});

test("같은 역량의 단계 순서가 뒤집히지 않는다", () => {
  const state = stateWith();
  state.profile.availability = [240, 240, 240, 240, 240, 240, 240];
  const week = buildWeek(state, "2026-11-02");
  const sql = week.items.filter((item) => item.id.startsWith("sql:"));
  assert.deepEqual(sql.map((item) => item.id), ["sql:learn", "sql:practice-1", "sql:practice-2", "sql:practice-3", "sql:practice-4", "sql:practice-5", "sql:prove"]);
  const dates = sql.map((item) => item.date);
  assert.deepEqual(dates, [...dates].sort());
});

test("시험 준비 시간을 뺀 만큼만 일정을 잡는다", () => {
  const state = stateWith();
  const before = dayCapacity(state, "2026-11-09");
  state.deadlines = [{ id: "d", title: "중간고사", date: "2026-11-10", kind: "시험", prepMinutes: 180 }];
  assert.equal(dayCapacity(state, "2026-11-09"), before - 60);
  assert.equal(dayCapacity(state, "2026-11-10"), before); // 당일은 준비 시간에 넣지 않는다.
});

test("시간을 0으로 두면 계획을 만들지 않고 멈춘다", () => {
  const state = stateWith();
  state.profile.availability = [0, 0, 0, 0, 0, 0, 0];
  assert.deepEqual(buildWeek(state, TODAY).items, []);
});

test("오늘 할 일은 밀린 일을 포함해 최대 3개다", () => {
  const state = stateWith();
  state.profile.availability = [240, 240, 240, 240, 240, 240, 240];
  state.week = buildWeek(state, "2026-11-02");
  const view = weekView(state, TODAY);
  assert.ok(view.overdue > 0);
  assert.equal(view.today.length, DAILY_LIMIT);
  assert.ok(view.waiting > 0);
  assert.ok(view.today[0].overdue);
});

test("증거 단계를 끝내면 경험이 쌓이고 갭이 줄며, 되돌리면 원래대로 돌아간다", () => {
  const state = stateWith();
  const task = queueTasks(deriveTasks(state)).find((item) => item.id === "sql:prove");
  assert.throws(() => completeTask(state, task, TODAY, { evidence: "  " }), /증거/);
  const before = diagnose(state).proven;
  completeTask(state, task, TODAY, { evidence: "https://example.com/report", result: "지표 리포트 완성" });
  assert.equal(diagnose(state).proven, before + 1);
  assert.ok(!queueTasks(deriveTasks(state)).some((item) => item.skillId === "sql"));
  undoTask(state, task.id);
  assert.equal(diagnose(state).proven, before);
  assert.equal(state.experiences.length, 0);
});

test("날짜를 옮긴 일은 다시 짜도 그대로 남는다", () => {
  const state = stateWith();
  ensureWeek(state, TODAY);
  const target = state.week.items.at(-1);
  moveTask(state, target.id, "2026-11-08");
  state.week = buildWeek(state, TODAY);
  assert.equal(state.week.items.find((item) => item.id === target.id).date, "2026-11-08");
});

test("새 주가 되면 끝내지 못한 일이 새 계획으로 넘어간다", () => {
  const state = stateWith();
  ensureWeek(state, TODAY);
  const first = state.week.items[0].id;
  ensureWeek(state, addDays(TODAY, 7));
  assert.equal(state.week.start, "2026-11-09");
  assert.equal(state.week.items[0].id, first);
});

test("끝낸 일은 계획을 다시 짜도 이번 주에 남는다", () => {
  const state = stateWith();
  ensureWeek(state, TODAY);
  const task = queueTasks(deriveTasks(state))[0];
  completeTask(state, task, TODAY);
  state.week = buildWeek(state, TODAY);
  assert.deepEqual(weekView(state, TODAY).doneToday.map((item) => item.id), [task.id]);
});

test("다양한 공고 머리글을 알아본다", () => {
  const result = analyzePosting(`[주요 업무]
영업일 기준 3일 안에 회신
■ 필수
1. SQL 활용 가능
이런 분을 찾고 있어요
3년 이상 Figma 경험
[혜택 및 복지]
Python 강의 지원`);
  assert.equal(typeOf(result, "sql"), "required");
  assert.equal(typeOf(result, "figma"), "required");
  assert.equal(result.hits.find((hit) => hit.skillId === "figma").evidence, "3년 이상 Figma 경험");
  assert.equal(typeOf(result, "sales"), undefined);
  assert.equal(typeOf(result, "python"), undefined);
});

test("빌드 결과는 파일 하나이고 외부 전송 경로가 없다", async () => {
  const { createHash } = await import("node:crypto");
  const { buildPlanner } = await import("../planner/build.js");
  const html = buildPlanner();
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(html.includes(`script-src 'sha256-${hash}'`), "스크립트 해시가 CSP와 같아야 저장본도 실행된다");
  assert.match(html, /default-src 'none'/);
  assert.doesNotMatch(html, /connect-src/);
  assert.doesNotMatch(script, /\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/);
  assert.doesNotMatch(script, /innerHTML|outerHTML =|eval\(/);
  assert.doesNotMatch(html, /<(link|script|img)[^>]+(href|src)="https?:/);
});

test("로드맵은 졸업 전 기간만 쓰고, 시간이 모자라면 못 다룬 역량을 알려 준다", () => {
  const state = stateWith();
  const { periods, unscheduled } = buildRoadmap(state, TODAY);
  assert.deepEqual(periods.map((period) => period.name), [
    "2026 2학기", "2027 겨울방학", "2027 1학기", "2027 여름방학", "2027 2학기",
  ]);
  assert.equal(periods.at(-1).end, "2027-12-31");
  assert.deepEqual(unscheduled, []);

  state.profile.availability = [5, 0, 0, 0, 0, 0, 0];
  state.profile.vacationWeeklyMinutes = 0;
  assert.ok(buildRoadmap(state, TODAY).unscheduled.length > 0);
});

test("졸업요건은 남은 학기로 나눠 학기당 학점을 계산한다", () => {
  const state = stateWith();
  state.graduation = { requiredCredits: 130, earnedCredits: 100, courses: [{ name: "캡스톤", done: false }] };
  const summary = graduationSummary(state, TODAY);
  assert.equal(summary.remaining, 30);
  assert.equal(summary.terms, 3); // 2026-2, 2027-1, 2027-2
  assert.equal(summary.perTerm, 10);
  assert.equal(summary.openCourses, 1);
});

test("저장 데이터 검사는 잘못된 값을 걸러 내고 다른 형식은 거부한다", () => {
  assert.throws(() => normalizeState({ version: 99 }), /버전/);
  assert.throws(() => normalizeState([]), /형식/);
  const clean = normalizeState({
    version: 1,
    postings: [{ text: 123 }, { id: "<x>", company: "A", title: "B", text: "본문" }],
    deadlines: [{ title: "날짜 없음", date: "2026-13-45" }],
    done: { "bad id!": { on: TODAY }, "sql:learn": { on: TODAY, title: "t", minutes: 60 } },
    profile: { availability: [-5, 99999, "x"] },
  });
  assert.equal(clean.postings.length, 1);
  assert.notEqual(clean.postings[0].id, "<x>");
  assert.equal(clean.deadlines.length, 0);
  assert.deepEqual(Object.keys(clean.done), ["sql:learn"]);
  assert.deepEqual(clean.profile.availability.slice(0, 3), [0, 1440, 90]);
});

test("저장 파일에 스크립트 종료 태그가 그대로 들어가지 않는다", () => {
  const json = embedJson({ text: "</script><script>alert(1)</script>" });
  assert.ok(!json.includes("<"));
  assert.equal(JSON.parse(json).text, "</script><script>alert(1)</script>");
});

test("증거 링크는 http(s)만 링크로 만든다", () => {
  assert.equal(safeUrl("javascript:alert(1)"), null);
  assert.equal(safeUrl("보고서.pdf"), null);
  assert.equal(safeUrl("https://example.com/a"), "https://example.com/a");
});
