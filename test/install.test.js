// 드라이런 설치 결과가 원본 DUCK LIBRARY(2026-10-14 판)와 같은 구조인지 검사합니다.
// 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { install, parsePageId, semestersFor, isoDate } from "../src/setup.js";

// 원본 템플릿에서 읽어 온 DB별 속성 이름과 종류
const ORIGINAL = {
  "수업 · 강의실": {
    과목: "title", "RAW 기록": "relation", "RAW 수": "rollup", "강의 자료 링크": "url", 과제: "relation",
    교수: "rich_text", 구분: "select", "남은 과제": "rollup", 메모: "rich_text", 상태: "select", 성적: "select",
    "시간·장소": "rich_text", 위키: "relation", "위키 수": "rollup", 학기: "select", 학점: "number",
  },
  "과제·할 일 · 퀘스트": {
    "할 일": "title", "D-day": "formula", "남은 일": "formula", 마감: "date", 메모: "rich_text", "비중(%)": "number",
    상태: "select", 수업: "relation", 점수: "rich_text", "제출 링크": "url", 종류: "select", 활동: "relation",
  },
  "활동 · 모험 기록": {
    활동: "title", "RAW 기록": "relation", "RAW 수": "rollup", 결과물: "relation", "결과물 수": "rollup",
    "관련 링크": "url", 기간: "date", "내 역할": "rich_text", 메모: "rich_text", 상태: "select",
    "성과 숫자": "rich_text", "소속·기관": "rich_text", 위키: "relation", "위키 수": "rollup", 종류: "select",
    "포트폴리오 준비도": "formula", "할 일": "relation",
  },
  "RAW · 줍줍 상자": {
    기록: "title", 날짜: "date", 수업: "relation", "정리 상태": "select", "정리 알림": "formula",
    "정리한 위키": "relation", 종류: "select", "출처 링크": "url", 파일: "files", 활동: "relation",
  },
  "WIKI · 오리 도서관": {
    주제: "title", 분야: "multi_select", 수업: "relation", "쓰인 결과물": "relation", 완성도: "select",
    "최근 수정": "last_edited_time", "출처 RAW": "relation", "한 줄 요약": "rich_text", 활동: "relation",
  },
  "OUTPUT · 포트폴리오 진열장": {
    결과물: "title", "결과 (R)": "rich_text", "내 행동 (A)": "rich_text", 링크: "url", 상태: "select",
    "상황 (S·T)": "rich_text", 제출처: "rich_text", 종류: "select", "참고 위키": "relation",
    "핵심 역량": "multi_select", 활동: "relation",
  },
};

const PARENT = "11111111-2222-3333-4444-555555555555";
const TODAY = new Date(2026, 9, 14); // 원본 템플릿을 만든 날

async function run(opts = {}) {
  return install({ parentId: PARENT, dryRun: true, today: TODAY, quiet: true, ...opts });
}

test("DB 6개의 속성 이름과 종류가 원본과 같다", async () => {
  const { notion } = await run();
  const fake = notion.raw;
  const actual = {};
  for (const ds of fake.ds.values()) {
    actual[ds.title] = Object.fromEntries([...ds.props].map(([name, p]) => [name, p.type]));
  }
  assert.deepEqual(actual, ORIGINAL);
});

test("양방향 관계 9쌍이 서로를 가리킨다", async () => {
  const { notion } = await run();
  const fake = notion.raw;
  let pairs = 0;
  for (const [dsId, ds] of fake.ds) {
    for (const [name, p] of ds.props) {
      if (p.type !== "relation") continue;
      const other = fake.ds.get(p.config.data_source_id);
      const back = [...other.props].find(([, op]) => op.id === p.config.dual_property.synced_property_id);
      assert.ok(back, `${ds.title}.${name}의 짝이 없음`);
      assert.equal(back[1].config.data_source_id, dsId, `${ds.title}.${name} 짝이 다른 DB를 가리킴`);
      pairs++;
    }
  }
  assert.equal(pairs, 18); // 9쌍 × 양쪽
});

test("예시 20행이 들어가고, 경고 없이 끝난다", async () => {
  const { result } = await run();
  assert.equal(result.sampleRows, 20);
  assert.deepEqual(result.warnings, []);
});

test("--no-samples면 예시를 넣지 않는다", async () => {
  const { result } = await run({ samples: false });
  assert.equal(result.sampleRows, 0);
});

test("홈 화면 순서: 안내 → 바로가기 → 보기 6개 → 가이드 → 원본 데이터 → 접기 안내", async () => {
  const { notion, result } = await run();
  const outline = notion.raw.outline(result.homeId);
  const views = outline.filter((t) => t === "linked_view").length;
  assert.equal(views, 6);
  assert.equal(outline[0], "callout");
  const tail = outline.slice(-3);
  assert.deepEqual(tail, ["child_page", "child_page", "toggle"]);
  // 데이터 페이지는 부모가 아니라 홈 안에 있어야 함
  const parentChildren = notion.raw.outline(PARENT);
  assert.deepEqual(parentChildren, ["child_page"]);
});

test("입력 도우미", () => {
  assert.equal(
    parsePageId("https://www.notion.so/My-Page-1a2b3c4d5e6f47a8b9c0d1e2f3a4b5c6?pvs=4"),
    "1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6"
  );
  assert.equal(parsePageId("1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6"), "1a2b3c4d-5e6f-47a8-b9c0-d1e2f3a4b5c6");
  assert.equal(parsePageId("없음"), null);
  assert.deepEqual(semestersFor(new Date(2026, 9, 14)).options.map((o) => o.name), ["2026-1", "2026-2", "2027-1"]);
  assert.deepEqual(semestersFor(new Date(2027, 0, 5)).options.map((o) => o.name), ["2026-1", "2026-2", "2027-1"]);
  assert.deepEqual(semestersFor(new Date(2027, 3, 1)).options.map((o) => o.name), ["2026-2", "2027-1", "2027-2"]);
  assert.equal(isoDate(new Date(2026, 9, 14), -14), "2026-09-30");
  assert.equal(isoDate(new Date(2026, 11, 30), 3), "2027-01-02");
});
