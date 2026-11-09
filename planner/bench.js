// 라벨을 단 공고 세트로 공고 분석 정확도를 잽니다.
// 실행: npm run planner:bench [-- 파일 경로 -v]
// 라벨의 id가 null이면 사전에 없는 역량이라 정확도에서 빼고 사전 범위로만 셉니다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { analyzePosting } from "./src/engine.js";

const WEIGHT = { required: 3, duties: 2, preferred: 1 };

export function benchmark(postings) {
  const result = { tp: 0, fp: 0, fn: 0, typeOk: 0, labeled: 0, inDictionary: 0, errors: [] };
  for (const posting of postings) {
    const gold = new Map();
    for (const label of posting.labels) {
      result.labeled += 1;
      if (!label.id) continue;
      result.inDictionary += 1;
      const current = gold.get(label.id);
      if (!current || WEIGHT[label.type] > WEIGHT[current.type]) gold.set(label.id, label);
    }
    const predicted = new Map(analyzePosting(posting.text).hits.map((hit) => [hit.skillId, hit]));
    for (const [id, hit] of predicted) {
      if (!gold.has(id)) {
        result.fp += 1;
        result.errors.push(`오탐 ${posting.id} ${id} | ${hit.evidence}`);
        continue;
      }
      result.tp += 1;
      if (gold.get(id).type === hit.type) result.typeOk += 1;
      else result.errors.push(`구분 ${posting.id} ${id} 정답 ${gold.get(id).type} 예측 ${hit.type} | ${hit.evidence}`);
    }
    for (const [id, label] of gold) {
      if (!predicted.has(id)) {
        result.fn += 1;
        result.errors.push(`누락 ${posting.id} ${id} | ${label.evidence}`);
      }
    }
  }
  result.precision = result.tp / (result.tp + result.fp);
  result.recall = result.tp / (result.tp + result.fn);
  result.typeAccuracy = result.typeOk / result.tp;
  result.coverage = result.inDictionary / result.labeled;
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file = new URL("../test/fixtures/postings-dev.json", import.meta.url), flag] = process.argv.slice(2);
  const result = benchmark(JSON.parse(readFileSync(file, "utf8")));
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  console.log(`정밀도 ${pct(result.precision)}, 재현율 ${pct(result.recall)}, 구분 정확도 ${pct(result.typeAccuracy)}, 사전 범위 ${pct(result.coverage)}`);
  if (flag === "-v") console.log(result.errors.join("\n"));
}
