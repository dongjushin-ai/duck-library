// Notion API 호출을 한곳에서 처리합니다.
// - 요청 사이에 간격을 둬서 속도 제한(무료·Plus 플랜 약 3회/초)에 걸리지 않게 합니다.
// - 429(rate_limited)·529(service_overload)는 Retry-After만큼 기다렸다가 다시 보냅니다.
//   이 두 응답은 요청이 처리되지 않았다는 뜻이라 다시 보내도 중복 생성되지 않아요.
// - 드라이런 모드에서는 Notion에 아무것도 보내지 않고, 가짜 응답으로 전체 흐름을 검사합니다.

import { Client, APIResponseError } from "@notionhq/client";
import { FakeNotion } from "./fake-notion.js";

export const NOTION_VERSION = "2026-03-11";
const MIN_GAP_MS = 350;
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createNotion({ token, dryRun = false, log = () => {} }) {
  const raw = dryRun
    ? new FakeNotion()
    : new Client({ auth: token, notionVersion: NOTION_VERSION, maxRetries: 0 });

  let last = 0;
  let count = 0;

  async function call(label, fn) {
    for (let attempt = 0; ; attempt++) {
      const wait = last + MIN_GAP_MS - Date.now();
      if (wait > 0 && !dryRun) await sleep(wait);
      last = Date.now();
      count++;
      try {
        return await fn(raw);
      } catch (err) {
        const status = err?.status;
        const retryable = status === 429 || status === 529;
        if (retryable && attempt < MAX_RETRIES) {
          const header = Number(err?.headers?.get?.("retry-after") ?? err?.headers?.["retry-after"]);
          const delay = Number.isFinite(header) && header > 0 ? header * 1000 : 1000 * 2 ** attempt;
          log(`  … 잠시 대기 (${label}, ${Math.round(delay / 1000)}초)`);
          await sleep(delay);
          continue;
        }
        throw explain(err, label);
      }
    }
  }

  return { call, raw, get requestCount() { return count; } };
}

function explain(err, label) {
  if (err instanceof APIResponseError || err?.code) {
    const hints = {
      unauthorized: "토큰이 틀렸어요. NOTION_TOKEN 값을 다시 복사해 주세요.",
      restricted_resource: "통합에 권한이 없어요. 부모 페이지 ⋯ → 연결(Connections)에서 만든 통합을 추가해 주세요.",
      object_not_found: "부모 페이지를 찾을 수 없어요. 페이지 ID가 맞는지, 그 페이지에 통합을 연결했는지 확인해 주세요.",
      validation_error: "Notion이 요청 형식을 거절했어요. 아래 메시지를 이슈로 남겨 주시면 고칠게요.",
    };
    const hint = hints[err.code] ? `\n   → ${hints[err.code]}` : "";
    const e = new Error(`[${label}] ${err.code ?? ""} ${err.message}${hint}`);
    e.code = err.code;
    e.status = err.status;
    return e;
  }
  return err;
}
