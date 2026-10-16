#!/usr/bin/env node
// DUCK LIBRARY 설치 스크립트
// 사용법: NOTION_TOKEN=... node src/setup.js <부모 페이지 URL 또는 ID> [--no-samples] [--dry-run]

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createNotion } from "./notion.js";
import { rt, markdownToBlocks } from "./blocks.js";
import { homeIntro, sectionHeader, homeFooter, guideBlocks } from "./content.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const log = (...a) => console.log(...a);

// ---------- 입력 정리 ----------

export function parsePageId(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.replaceAll("-", "").match(/([0-9a-f]{32})(?:[?#].*)?$/i);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** 한국 대학 학기: 3~8월 = 1학기, 9~2월 = 2학기 */
export function semestersFor(date = new Date()) {
  const y = date.getFullYear();
  const mo = date.getMonth() + 1;
  const cur = mo >= 3 && mo <= 8 ? [y, 1] : mo >= 9 ? [y, 2] : [y - 1, 2];
  const prev = cur[1] === 1 ? [cur[0] - 1, 2] : [cur[0], 1];
  const next = cur[1] === 1 ? [cur[0], 2] : [cur[0] + 1, 1];
  const name = ([a, b]) => `${a}-${b}`;
  return {
    previous: name(prev),
    current: name(cur),
    options: [
      { name: name(prev), color: "gray" },
      { name: name(cur), color: "green" },
      { name: name(next), color: "blue" },
    ],
  };
}

export function isoDate(base, offsetDays) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---------- 속성 정의 → API 형태 ----------

function apiProp(def, sem) {
  const out = structuredClone(def);
  if (out.select?.options === "$semesters") out.select.options = sem.options;
  return out;
}

/** 예시 행의 값 → API 속성 값 */
export function rowProps(dbDef, schemaProps, row, ctx) {
  const props = { [dbDef.titleProp]: { title: rt(row.title) } };
  for (const [name, value] of Object.entries(row.props ?? {})) {
    if (value === null || value === undefined) continue;
    const def = schemaProps[name];
    if (!def) throw new Error(`예시 '${row.title}': 설계에 없는 속성 '${name}'`);
    const type = Object.keys(def).find((k) => k !== "description");
    if (type === "select") {
      const v = value === "$current" ? ctx.sem.current : value === "$previous" ? ctx.sem.previous : value;
      props[name] = { select: { name: v } };
    } else if (type === "multi_select") props[name] = { multi_select: value.map((v) => ({ name: v })) };
    else if (type === "number") props[name] = { number: value };
    else if (type === "url") props[name] = { url: value };
    else if (type === "rich_text") props[name] = { rich_text: rt(value) };
    else if (type === "date") {
      props[name] = {
        date: {
          start: isoDate(ctx.today, value.start),
          ...(value.end !== undefined ? { end: isoDate(ctx.today, value.end) } : {}),
        },
      };
    } else throw new Error(`예시 '${row.title}': ${type} 속성은 예시에서 지원하지 않아요`);
  }
  return props;
}

// ---------- 설치 ----------

export async function install({ token, parentId, samples = true, dryRun = false, today = new Date(), quiet = false }) {
  const say = quiet ? () => {} : log;
  const schema = JSON.parse(await readFile(path.join(ROOT, "schema/duck-library.json"), "utf8"));
  const sampleData = JSON.parse(await readFile(path.join(ROOT, "data/samples.json"), "utf8"));
  const sem = semestersFor(today);
  const n = createNotion({ token, dryRun, log: say });
  const warnings = [];
  const warn = (m) => {
    warnings.push(m);
    say(`  ⚠️  ${m}`);
  };

  // 1. 홈 페이지와 (잠시) 데이터 보관 페이지
  say("① 홈 페이지 만드는 중");
  const home = await n.call("홈 만들기", (c) =>
    c.pages.create({
      parent: { type: "page_id", page_id: parentId },
      icon: { type: "emoji", emoji: schema.home.icon },
      properties: { title: { title: rt(schema.home.title) } },
    })
  );
  // DB를 담을 페이지는 우선 부모 아래에 만들고, 홈 구성이 끝나면 홈 맨 아래로 옮겨요(원본과 같은 배치).
  const dataPage = await n.call("데이터 페이지 만들기", (c) =>
    c.pages.create({
      parent: { type: "page_id", page_id: parentId },
      icon: { type: "emoji", emoji: schema.home.dataPageIcon },
      properties: { title: { title: rt(schema.home.dataPageTitle) } },
    })
  );

  // 2. DB 6개 (단순 속성만)
  say("② 데이터베이스 6개 만드는 중");
  const dbs = {};
  for (const def of schema.databases) {
    const properties = { [def.titleProp]: { title: {} } };
    for (const [name, p] of Object.entries(def.properties)) properties[name] = apiProp(p, sem);
    let db = await n.call(`DB 만들기: ${def.title}`, (c) =>
      c.databases.create({
        parent: { type: "page_id", page_id: dataPage.id },
        title: rt(def.title),
        icon: { type: "emoji", emoji: def.icon },
        is_inline: false,
        initial_data_source: { properties },
      })
    );
    if (!db.data_sources?.length) db = await n.call(`DB 다시 읽기: ${def.title}`, (c) => c.databases.retrieve({ database_id: db.id }));
    dbs[def.key] = { id: db.id, url: db.url, dsId: db.data_sources[0].id, def };
    say(`   · ${def.icon} ${def.title}`);
  }
  const ds = (key) => dbs[key].dsId;

  // 3. 양방향 관계
  say("③ DB끼리 연결하는 중 (관계 9쌍)");
  for (const r of schema.relations) {
    const res = await n.call(`관계: ${r.from}.${r.name}`, (c) =>
      c.dataSources.update({
        data_source_id: ds(r.from),
        properties: {
          [r.name]: {
            relation: {
              data_source_id: ds(r.to),
              type: "dual_property",
              dual_property: { synced_property_name: r.backName },
            },
          },
        },
      })
    );
    // 반대쪽 이름이 원하는 대로 안 붙었으면 ID로 이름을 바꿔요.
    const made = res.properties?.[r.name]?.relation?.dual_property;
    if (made?.synced_property_id && made.synced_property_name !== r.backName) {
      await n.call(`관계 이름 맞추기: ${r.to}.${r.backName}`, (c) =>
        c.dataSources.update({
          data_source_id: ds(r.to),
          properties: { [made.synced_property_id]: { name: r.backName } },
        })
      );
    }
  }

  // 4. 수식(롤업이 참조하는 것) → 롤업 → 수식
  say("④ 자동 계산(수식·롤업) 넣는 중");
  const addFormula = (f) =>
    n.call(`수식: ${f.db}.${f.name}`, (c) =>
      c.dataSources.update({
        data_source_id: ds(f.db),
        properties: {
          [f.name]: { formula: { expression: f.expression }, ...(f.description ? { description: f.description } : {}) },
        },
      })
    );
  for (const f of schema.formulasBeforeRollups) await addFormula(f);
  for (const r of schema.rollups) {
    await n.call(`롤업: ${r.db}.${r.name}`, (c) =>
      c.dataSources.update({
        data_source_id: ds(r.db),
        properties: {
          [r.name]: { rollup: { relation_property_name: r.relation, rollup_property_name: r.target, function: r.function } },
        },
      })
    );
  }
  for (const f of schema.formulas) await addFormula(f);

  // 5. DB 안 추가 보기 (캘린더·보드). 실패해도 설치는 계속해요.
  say("⑤ 보기(캘린더·보드) 추가하는 중");
  for (const v of schema.dbViews) {
    try {
      const info = await n.call(`속성 ID 읽기: ${v.db}`, (c) => c.dataSources.retrieve({ data_source_id: ds(v.db) }));
      const pid = (name) => info.properties[name]?.id;
      const configuration =
        v.type === "calendar"
          ? { type: "calendar", date_property_id: pid(v.dateProp) }
          : { type: "board", group_by: { type: "select", property_id: pid(v.groupBy), sort: { type: "manual" } } };
      await n.call(`보기: ${v.name}`, (c) =>
        c.views.create({ database_id: dbs[v.db].id, data_source_id: ds(v.db), name: v.name, type: v.type, configuration })
      );
    } catch (e) {
      warn(`'${v.name}' 보기는 만들지 못했어요. Notion에서 직접 추가할 수 있어요. (${e.message.split("\n")[0]})`);
    }
  }

  // 6. 예시 데이터
  let rowCount = 0;
  if (samples) {
    say("⑥ 예시 데이터 넣는 중");
    const ctx = { sem, today };
    const ids = {};
    const order = ["classes", "activities", "tasks", "raw", "wiki", "output"];
    for (const key of order) {
      const def = dbs[key].def;
      for (const row of sampleData[key] ?? []) {
        const page = await n.call(`예시: ${row.title}`, (c) =>
          c.pages.create({
            parent: { type: "data_source_id", data_source_id: ds(key) },
            properties: rowProps(def, def.properties, row, ctx),
            ...(row.body ? { children: markdownToBlocks(row.body) } : {}),
          })
        );
        ids[row.key] = page.id;
        rowCount++;
      }
    }
    // 관계는 모든 행이 생긴 뒤 한 번에 연결
    for (const key of order) {
      for (const row of sampleData[key] ?? []) {
        if (!row.relations) continue;
        const properties = {};
        for (const [rel, keys] of Object.entries(row.relations)) {
          properties[rel] = { relation: keys.map((k) => ({ id: ids[k] ?? missing(k, row) })) };
        }
        await n.call(`예시 연결: ${row.title}`, (c) => c.pages.update({ page_id: ids[row.key], properties }));
      }
    }
  }

  // 7. 홈 화면
  say("⑦ 홈 화면 꾸미는 중");
  await n.call("홈 상단", (c) => c.blocks.children.append({ block_id: home.id, children: homeIntro(schema, dbs) }));
  for (const s of schema.homeSections) {
    await n.call(`홈 섹션: ${s.heading}`, (c) => c.blocks.children.append({ block_id: home.id, children: sectionHeader(s) }));
    try {
      await n.call(`홈 보기: ${s.viewName}`, (c) =>
        c.views.create({
          data_source_id: ds(s.db),
          name: s.viewName,
          type: "table",
          create_database: { parent: { type: "page_id", page_id: home.id } },
          ...(s.filter ? { filter: s.filter } : {}),
          ...(s.sorts ? { sorts: s.sorts } : {}),
        })
      );
    } catch (e) {
      warn(`'${s.viewName}' 보기 대신 DB 링크를 넣었어요. (${e.message.split("\n")[0]})`);
      await n.call(`홈 링크: ${s.viewName}`, (c) =>
        c.blocks.children.append({
          block_id: home.id,
          children: [{ type: "link_to_page", link_to_page: { type: "database_id", database_id: dbs[s.db].id } }],
        })
      );
    }
  }

  // 8. 시작 가이드, 데이터 페이지를 홈 아래로
  say("⑧ 시작 가이드 만드는 중");
  await n.call("시작 가이드", (c) =>
    c.pages.create({
      parent: { type: "page_id", page_id: home.id },
      icon: { type: "emoji", emoji: schema.home.guideIcon },
      properties: { title: { title: rt(schema.home.guideTitle) } },
      children: guideBlocks(),
    })
  );
  try {
    await n.call("데이터 페이지 옮기기", (c) =>
      c.pages.move({ page_id: dataPage.id, parent: { type: "page_id", page_id: home.id } })
    );
  } catch (e) {
    warn(`'${schema.home.dataPageTitle}' 페이지를 홈 안으로 옮기지 못했어요. 사이드바에서 홈 페이지로 끌어다 놓아 주세요. (${e.message.split("\n")[0]})`);
  }
  await n.call("홈 하단 안내", (c) => c.blocks.children.append({ block_id: home.id, children: homeFooter(sem.options) }));

  const result = {
    homeUrl: home.url,
    homeId: home.id,
    databases: Object.fromEntries(Object.entries(dbs).map(([k, v]) => [k, { id: v.id, url: v.url }])),
    sampleRows: rowCount,
    requests: n.requestCount,
    warnings,
    installedAt: new Date().toISOString(),
  };
  return { result, notion: n };
}

function missing(k, row) {
  throw new Error(`예시 '${row.title}'이 없는 예시 '${k}'를 가리켜요`);
}

// ---------- 명령줄 ----------

async function loadDotEnv() {
  try {
    const text = await readFile(path.join(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env가 없으면 환경 변수만 써요
  }
}

async function main() {
  await loadDotEnv();
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));
  if (flags.has("--help") || flags.has("-h")) {
    log("사용법: NOTION_TOKEN=ntn_... npm run setup -- <부모 페이지 URL> [--no-samples] [--dry-run]");
    return;
  }
  const dryRun = flags.has("--dry-run");
  const token = process.env.NOTION_TOKEN;
  const parentInput = positional[0] ?? process.env.NOTION_PARENT_PAGE;
  const parentId = parsePageId(parentInput) ?? (dryRun ? "00000000-0000-0000-0000-000000000000" : null);

  if (!dryRun && !token) {
    console.error("NOTION_TOKEN이 없어요. README의 '1. 통합 만들기'를 따라 토큰을 만든 뒤 .env에 넣어 주세요.");
    process.exit(1);
  }
  if (!parentId) {
    console.error("부모 페이지 URL(또는 ID)이 필요해요. 예: npm run setup -- https://www.notion.so/내페이지-1a2b3c...");
    process.exit(1);
  }

  log(`🦆 DUCK LIBRARY 설치 ${dryRun ? "(드라이런: Notion에 아무것도 보내지 않아요)" : "시작"}\n`);
  const started = Date.now();
  const { result } = await install({ token, parentId, samples: !flags.has("--no-samples"), dryRun });
  const sec = Math.round((Date.now() - started) / 1000);

  if (!dryRun) await writeFile(path.join(process.cwd(), "duck-library-output.json"), JSON.stringify(result, null, 2));
  log(`\n✅ 완료 (${result.requests}번 요청, ${sec}초)`);
  if (!dryRun) log(`   홈: ${result.homeUrl}\n   만든 항목 ID는 duck-library-output.json에 저장했어요.`);
  if (result.warnings.length) log(`   확인할 것 ${result.warnings.length}개는 위 ⚠️ 표시를 봐 주세요.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`\n❌ 설치가 멈췄어요.\n${e.message}`);
    console.error("이미 만들어진 페이지가 있다면 Notion에서 지우고 다시 실행해 주세요.");
    process.exit(1);
  });
}
