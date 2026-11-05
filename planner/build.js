// 소스를 파일 하나로 합칩니다. 외부 요청 없이 그대로 열 수 있고, 저장하면 자기 복사본을 만듭니다.
// 실행: npm run planner:build  →  dist/index.html
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, "src", name), "utf8").replace(/\r\n/g, "\n");
const sha256 = (content) => `'sha256-${createHash("sha256").update(content).digest("base64")}'`;

function bundleScript() {
  const modules = ["skills.js", "engine.js", "sample.js", "app.js"].map((name) =>
    read(name)
      .replace(/^import [\s\S]*?;\n/gm, "")
      .replace(/^export /gm, ""),
  );
  return `(() => {\n"use strict";\n${modules.join("\n")}\n})();`;
}

export function buildPlanner() {
  const css = read("styles.css");
  const js = bundleScript();
  if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error("인라인 코드 안에 닫는 태그가 있어요.");
  // 입력한 내용이 밖으로 나갈 길을 브라우저 수준에서 막는다.
  const csp = [
    "default-src 'none'",
    `script-src ${sha256(js)}`,
    `style-src ${sha256(css)}`,
    "img-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const fill = { __CSP__: csp, __CSS__: css, __JS__: js };
  return read("template.html").replace(/__(CSP|CSS|JS)__/g, (token) => fill[token]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(here, "..", "dist");
  mkdirSync(out, { recursive: true });
  const html = buildPlanner();
  writeFileSync(join(out, "index.html"), html);
  console.log(`dist/index.html (${Math.round(html.length / 1024)}KB)`);
}
