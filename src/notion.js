// Notion API 호출을 한곳에서 처리합니다.
// - 요청 사이에 간격을 둬서 속도 제한(무료·Plus 플랜 약 3회/초)에 걸리지 않게 합니다.
// - 429(rate_limited)·529(service_overload)는 Retry-After만큼 기다렸다가 다시 보냅니다.
//   이 두 응답은 요청이 처리되지 않았다는 뜻이라 다시 보내도 중복 생성되지 않아요.
// - 읽기 요청은 502·503·504·타임아웃에서도 다시 보냅니다. 쓰기 요청은 이미 저장됐을 수 있어서
//   이 경우 다시 보내지 않고 멈춥니다(중복 생성 방지).
// - SDK 자체 재시도는 끕니다. 재시도가 두 겹으로 겹치지 않게 여기서만 처리해요.
// - 드라이런 모드에서는 Notion에 아무것도 보내지 않고, 가짜 응답으로 전체 흐름을 검사합니다.

import { Client, APIResponseError, LogLevel } from "@notionhq/client";
import { FakeNotion } from "./fake-notion.js";

export const NOTION_VERSION = "2026-03-11";
const MIN_GAP_MS = 350;
const MAX_RETRIES = 6;
const MAX_WAIT_MS = 5 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createNotion({ token, dryRun = false, fake, log = () => {}, gapMs = MIN_GAP_MS, backoffMs = 1000 }) {
  const raw = dryRun
    ? fake ?? new FakeNotion()
    : new Client({ auth: token, notionVersion: NOTION_VERSION, retry: false, logLevel: LogLevel.ERROR });

  let last = 0;
  let count = 0;

  /**
   * @param {string} label 사람이 읽는 작업 이름 (오류 메시지에 쓰임)
   * @param {(client) => Promise<any>} fn
   * @param {{ read?: boolean }} opts read: 다시 보내도 안전한 읽기 요청
   */
  async function call(label, fn, { read = false } = {}) {
    for (let attempt = 0; ; attempt++) {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
      count++;
      try {
        return await fn(raw);
      } catch (err) {
        const status = err?.status;
        const timeout = err?.code === "notionhq_client_request_timeout";
        const retryable = status === 429 || status === 529 || (read && ([502, 503, 504].includes(status) || timeout));
        if (retryable && attempt < MAX_RETRIES) {
          const header = Number(err?.headers?.get?.("retry-after"));
          const delay = Math.min(Number.isFinite(header) && header > 0 ? header * 1000 : backoffMs * 2 ** attempt, MAX_WAIT_MS);
          log(`  … Notion이 잠시 기다려 달래요 (${label}, ${Math.max(1, Math.round(delay / 1000))}초)`);
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
      notionhq_client_request_timeout: "Notion 응답이 너무 늦어요. 인터넷 연결을 확인하고 잠시 뒤 다시 실행해 주세요.",
      rate_limited: "요청이 너무 많다고 해요. 몇 분 뒤 다시 실행해 주세요.",
      internal_server_error: "Notion 서버 쪽 일시적인 문제예요. 잠시 뒤 다시 실행해 주세요.",
      service_unavailable: "Notion 서버 쪽 일시적인 문제예요. 잠시 뒤 다시 실행해 주세요.",
    };
    const hint = hints[err.code] ? `\n   → ${hints[err.code]}` : "";
    const e = new Error(`[${label}] ${err.code ?? ""} ${err.message}${hint}`);
    e.code = err.code;
    e.status = err.status;
    return e;
  }
  return err;
}
