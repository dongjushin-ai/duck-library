// Notion 블록을 짧게 만드는 도우미들과, 아주 단순한 마크다운 → 블록 변환기.

const MAX = 1900; // Notion 텍스트 한 조각 최대 2000자

/** "**굵게** 일반" 같은 문자열을 rich_text 배열로. opts.color, opts.link 지원 */
export function rt(input, opts = {}) {
  const parts = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(input))) {
    if (m.index > last) parts.push({ t: input.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ t: m[1], bold: true });
    else parts.push({ t: m[2], code: true });
    last = re.lastIndex;
  }
  if (last < input.length) parts.push({ t: input.slice(last) });
  return parts.flatMap(({ t, bold, code }) =>
    chunk(t).map((c) => ({
      type: "text",
      text: { content: c, ...(opts.link ? { link: { url: opts.link } } : {}) },
      annotations: { bold: !!bold || !!opts.bold, code: !!code, color: opts.color ?? "default" },
    }))
  );
}

function chunk(s) {
  const out = [];
  for (let i = 0; i < s.length; i += MAX) out.push(s.slice(i, i + MAX));
  return out.length ? out : [""];
}

export const para = (text, opts) => ({ type: "paragraph", paragraph: { rich_text: rt(text, opts) } });
export const richPara = (rich) => ({ type: "paragraph", paragraph: { rich_text: rich } });
export const h2 = (text, color = "default") => ({ type: "heading_2", heading_2: { rich_text: rt(text), color } });
export const h3 = (text) => ({ type: "heading_3", heading_3: { rich_text: rt(text) } });
export const bullet = (text) => ({ type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(text) } });
export const numbered = (text) => ({ type: "numbered_list_item", numbered_list_item: { rich_text: rt(text) } });
export const divider = () => ({ type: "divider", divider: {} });
export const callout = (rich, emoji, color = "gray_background") => ({
  type: "callout",
  callout: { rich_text: typeof rich === "string" ? rt(rich) : rich, icon: { type: "emoji", emoji }, color },
});
export const toggle = (text, children, color = "default") => ({
  type: "toggle",
  toggle: { rich_text: rt(text), color, children },
});
export const columns = (cols) => ({
  type: "column_list",
  column_list: { children: cols.map((children) => ({ type: "column", column: { children } })) },
});
export const linkToDb = (databaseId) => ({
  type: "link_to_page",
  link_to_page: { type: "database_id", database_id: databaseId },
});

/** 예시 본문용 간단 변환: ##, ###, -, 1., 일반 문단 */
export function markdownToBlocks(md = "") {
  const blocks = [];
  for (const line of md.split("\n")) {
    const s = line.trimEnd();
    if (!s.trim()) continue;
    let m;
    if ((m = s.match(/^###\s+(.*)/))) blocks.push(h3(m[1]));
    else if ((m = s.match(/^##\s+(.*)/))) blocks.push(h2(m[1]));
    else if ((m = s.match(/^\s*[-*]\s+(.*)/))) blocks.push(bullet(m[1]));
    else if ((m = s.match(/^\s*\d+\.\s+(.*)/))) blocks.push(numbered(m[1]));
    else blocks.push(para(s));
  }
  return blocks;
}
