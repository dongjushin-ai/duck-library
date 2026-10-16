// 드라이런용 가짜 Notion. 실제 API처럼 응답하면서, 실제 API가 거절할 만한 실수를 미리 잡아냅니다.
// (없는 속성을 참조하는 수식·롤업·뷰, 없는 행을 가리키는 관계, 잘못된 parent 등)

import { randomUUID } from "node:crypto";

class FakeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.status = 400;
  }
}

const shortId = () => Math.random().toString(36).slice(2, 6);

export class FakeNotion {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.honorSyncedName] true면 역관계 이름(synced_property_name)을 그대로 받아 줘요.
   *   false(기본)면 실제 API가 무시하는 경우를 흉내 내서 'Related to …'로 이름을 붙여요.
   * @param {Array<{op: string, nth?: number, status: number, retryAfter?: number}>} [opts.failures]
   *   지정한 호출(op)의 nth번째(1부터)에서 한 번 오류를 던져요. 재시도 경로 검사용.
   */
  constructor({ honorSyncedName = false, failures = [] } = {}) {
    this.honorSyncedName = honorSyncedName;
    this.failures = failures.map((f) => ({ nth: 1, ...f, seen: 0, done: false }));
    // 내부 상태
    this._pages = new Map(); // id -> { parent, title, children: [] }
    this._blocks = new Map(); // blockId -> { parent, type }
    this._views = [];
    this.dbs = new Map(); // dbId -> { dsId, title, url }
    this.ds = new Map(); // dsId -> { dbId, title, props: Map(name -> {id, type, config}) }
    this.log = [];

    // SDK와 같은 모양의 메서드
    const api = (op, fn) => async (a) => {
      this.#maybeFail(op);
      return fn(a);
    };
    this.databases = { create: api("databases.create", (a) => this.#createDb(a)) };
    this.dataSources = {
      update: api("dataSources.update", (a) => this.#updateDs(a)),
      retrieve: api("dataSources.retrieve", (a) => this.#dsObject(a.data_source_id)),
    };
    this.pages = {
      create: api("pages.create", (a) => this.#createPage(a)),
      update: api("pages.update", (a) => this.#updatePage(a)),
      move: api("pages.move", (a) => this.#movePage(a)),
    };
    this.blocks = { children: { append: api("blocks.append", (a) => this.#append(a)) } };
    this.views = { create: api("views.create", (a) => this.#createView(a)) };
  }

  #maybeFail(op) {
    for (const f of this.failures) {
      if (f.op !== op || f.done) continue;
      f.seen++;
      if (f.seen === f.nth) {
        f.done = true;
        const e = new Error(`가짜 ${f.status} 오류 (${op})`);
        e.status = f.status;
        e.code = f.status === 429 ? "rate_limited" : f.status === 529 ? "service_overload" : "service_unavailable";
        e.headers = new Headers(f.retryAfter ? { "retry-after": String(f.retryAfter) } : {});
        throw e;
      }
    }
  }

  #record(op, detail) {
    this.log.push({ op, ...detail });
  }

  #requirePage(id, what) {
    if (!this._pages.has(id)) throw new FakeError("object_not_found", `${what}: 페이지 ${id} 없음`);
  }

  #createPage({ parent, properties, icon, children = [] }) {
    const id = randomUUID();
    if (parent.type === "page_id") {
      // 사용자 부모 페이지는 처음 보는 ID여도 허용
      if (!this._pages.has(parent.page_id)) this._pages.set(parent.page_id, { root: true, children: [] });
      const titleProp = properties?.title ?? properties?.Title;
      if (!titleProp) throw new FakeError("validation_error", "page_id 부모 페이지에는 title 속성이 필요해요");
      this._pages.get(parent.page_id).children.push({ type: "child_page", id });
      this._pages.set(id, { parent, title: plain(titleProp.title), children: [] });
    } else if (parent.type === "data_source_id") {
      const ds = this.ds.get(parent.data_source_id);
      if (!ds) throw new FakeError("object_not_found", `data source ${parent.data_source_id} 없음`);
      this.#checkRowProps(ds, properties);
      this._pages.set(id, { parent, title: rowTitle(ds, properties), children: [], row: true, dsId: parent.data_source_id });
    } else {
      throw new FakeError("validation_error", `알 수 없는 parent: ${JSON.stringify(parent)}`);
    }
    this.#appendTo(id, children);
    this.#record("pages.create", { id, parent: parent.type });
    return { object: "page", id, url: `https://www.notion.so/${id.replaceAll("-", "")}` };
  }

  #updatePage({ page_id, properties }) {
    const p = this._pages.get(page_id);
    if (!p?.row) throw new FakeError("object_not_found", `행 ${page_id} 없음`);
    this.#checkRowProps(this.ds.get(p.dsId), properties);
    this.#record("pages.update", { id: page_id });
    return { object: "page", id: page_id };
  }

  #movePage({ page_id, parent }) {
    this.#requirePage(page_id, "pages.move");
    this.#requirePage(parent.page_id, "pages.move 대상");
    for (const pg of this._pages.values()) {
      if (pg.children) pg.children = pg.children.filter((c) => c.id !== page_id);
    }
    this._pages.get(parent.page_id).children.push({ type: "child_page", id: page_id });
    this.#record("pages.move", { id: page_id });
    return { object: "page", id: page_id };
  }

  #checkRowProps(ds, properties = {}) {
    for (const [name, value] of Object.entries(properties)) {
      const prop = ds.props.get(name);
      if (!prop) throw new FakeError("validation_error", `${ds.title}: 속성 '${name}' 없음`);
      const key = Object.keys(value)[0];
      const expected = prop.type === "title" ? "title" : prop.type;
      if (key !== expected) throw new FakeError("validation_error", `${ds.title}.${name}: ${expected} 값이어야 하는데 ${key}`);
      if (["formula", "rollup", "last_edited_time"].includes(prop.type)) {
        throw new FakeError("validation_error", `${ds.title}.${name}: 읽기 전용 속성에 값을 넣으려 함`);
      }
      if (prop.type === "select" && value.select) {
        const ok = prop.config.options?.some((o) => o.name === value.select.name);
        if (!ok) throw new FakeError("validation_error", `${ds.title}.${name}: 없는 선택지 '${value.select.name}'`);
      }
      if (prop.type === "multi_select") {
        for (const v of value.multi_select) {
          if (!prop.config.options?.some((o) => o.name === v.name)) throw new FakeError("validation_error", `${ds.title}.${name}: 없는 선택지 '${v.name}'`);
        }
      }
      if (prop.type === "relation") {
        for (const r of value.relation) {
          const row = this._pages.get(r.id);
          if (!row?.row || row.dsId !== prop.config.data_source_id) {
            throw new FakeError("validation_error", `${ds.title}.${name}: 관계 대상 행 ${r.id}가 올바른 DB에 없음`);
          }
        }
      }
      if (prop.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value.date.start)) {
        throw new FakeError("validation_error", `${ds.title}.${name}: 날짜 형식 오류 ${value.date.start}`);
      }
    }
  }

  #createDb({ parent, title, initial_data_source, is_inline }) {
    if (parent?.type !== "page_id") throw new FakeError("validation_error", "DB parent는 page_id여야 해요");
    this.#requirePage(parent.page_id, "databases.create");
    const props = initial_data_source?.properties ?? {};
    const titles = Object.values(props).filter((p) => "title" in p);
    if (titles.length !== 1) throw new FakeError("validation_error", "title 속성은 정확히 하나여야 해요");
    const dbId = randomUUID();
    const dsId = randomUUID();
    const name = plain(title);
    const ds = { dbId, title: name, props: new Map() };
    this.ds.set(dsId, ds);
    for (const [k, v] of Object.entries(props)) this.#addProp(ds, dsId, k, v);
    const url = `https://www.notion.so/${dbId.replaceAll("-", "")}`;
    this.dbs.set(dbId, { dsId, title: name, url });
    this._pages.get(parent.page_id).children.push({ type: "child_database", id: dbId, inline: !!is_inline });
    this.#record("databases.create", { title: name });
    return { object: "database", id: dbId, url, data_sources: [{ id: dsId, name }] };
  }

  #addProp(ds, dsId, name, def) {
    const { description, ...rest } = def;
    const type = Object.keys(rest)[0];
    const config = rest[type];
    if (type === "formula") this.#checkFormula(ds, name, config.expression);
    if (type === "rollup") this.#checkRollup(ds, name, config);
    if (type === "relation") {
      const target = this.ds.get(config.data_source_id);
      if (!target) throw new FakeError("validation_error", `${name}: 관계 대상 data source 없음`);
    }
    const id = shortId();
    ds.props.set(name, { id, type, config });
    if (type === "relation" && config.type === "dual_property") {
      const target = this.ds.get(config.data_source_id);
      // 실제 API가 synced_property_name을 무시할 수도 있다는 가정으로, 일부러 기본 이름을 붙여 이름 바꾸기 경로를 검사합니다.
      const wanted = config.dual_property?.synced_property_name;
      const backName = this.honorSyncedName && wanted ? wanted : `Related to ${ds.title} (${name})`;
      const backId = shortId();
      target.props.set(backName, {
        id: backId,
        type: "relation",
        config: { data_source_id: dsId, type: "dual_property", dual_property: { synced_property_id: id, synced_property_name: name } },
      });
      ds.props.get(name).config = {
        ...config,
        dual_property: { synced_property_id: backId, synced_property_name: backName },
      };
    }
  }

  #checkFormula(ds, name, expr) {
    if (typeof expr !== "string" || !expr.trim()) throw new FakeError("validation_error", `${name}: 빈 수식`);
    const refs = [...expr.matchAll(/prop\("([^"]+)"\)/g)].map((m) => m[1]);
    for (const r of refs) {
      if (!ds.props.has(r)) throw new FakeError("validation_error", `${ds.title}.${name}: 수식이 없는 속성 '${r}'을 참조`);
    }
    let depth = 0;
    let inStr = false;
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '"' && expr[i - 1] !== "\\") inStr = !inStr;
      if (inStr) continue;
      if (c === "(") depth++;
      if (c === ")") depth--;
      if (depth < 0) break;
    }
    if (depth !== 0 || inStr) throw new FakeError("validation_error", `${ds.title}.${name}: 괄호나 따옴표 짝이 안 맞음`);
  }

  #checkRollup(ds, name, cfg) {
    const rel = ds.props.get(cfg.relation_property_name);
    if (!rel || rel.type !== "relation") throw new FakeError("validation_error", `${ds.title}.${name}: 롤업 관계 '${cfg.relation_property_name}' 없음`);
    const target = this.ds.get(rel.config.data_source_id);
    if (!target.props.has(cfg.rollup_property_name)) {
      throw new FakeError("validation_error", `${ds.title}.${name}: 롤업 대상 '${cfg.rollup_property_name}'이 ${target.title}에 없음`);
    }
    if (!cfg.function) throw new FakeError("validation_error", `${name}: 롤업 function 필요`);
  }

  #updateDs({ data_source_id, properties }) {
    const ds = this.ds.get(data_source_id);
    if (!ds) throw new FakeError("object_not_found", `data source ${data_source_id} 없음`);
    for (const [key, def] of Object.entries(properties)) {
      const existing = [...ds.props.entries()].find(([n, p]) => n === key || p.id === key);
      if (existing && def && Object.keys(def).length === 1 && "name" in def) {
        const [oldName, p] = existing;
        ds.props.delete(oldName);
        ds.props.set(def.name, p);
        // 짝이 되는 관계 쪽에도 새 이름을 알려줌
        if (p.type === "relation" && p.config.dual_property) {
          const other = this.ds.get(p.config.data_source_id);
          for (const op of other.props.values()) {
            if (op.config?.dual_property?.synced_property_id === p.id) op.config.dual_property.synced_property_name = def.name;
          }
        }
        continue;
      }
      if (existing) throw new FakeError("validation_error", `${ds.title}: 속성 '${key}'이 이미 있음`);
      this.#addProp(ds, data_source_id, key, def);
    }
    this.#record("dataSources.update", { title: ds.title, keys: Object.keys(properties) });
    return this.#dsObject(data_source_id);
  }

  #dsObject(id) {
    const ds = this.ds.get(id);
    if (!ds) throw new FakeError("object_not_found", `data source ${id} 없음`);
    const properties = {};
    for (const [name, p] of ds.props) properties[name] = { id: p.id, name, type: p.type, [p.type]: p.config };
    return { object: "data_source", id, properties };
  }

  #append({ block_id, children }) {
    if (!this._pages.has(block_id) && !this._blocks.has(block_id)) {
      throw new FakeError("object_not_found", `블록 ${block_id} 없음`);
    }
    if (children.length > 100) throw new FakeError("validation_error", "한 번에 100개 넘는 블록");
    const results = this.#appendTo(block_id, children);
    this.#record("blocks.append", { n: children.length });
    return { results };
  }

  #appendTo(parentId, children, depth = 1) {
    const results = [];
    for (const b of children) {
      if (!b.type || !(b.type in b)) throw new FakeError("validation_error", `블록 형식 오류: ${JSON.stringify(b).slice(0, 80)}`);
      if (b.type === "column_list") {
        const cols = b.column_list.children ?? [];
        if (cols.length < 2) throw new FakeError("validation_error", "column_list에는 column이 2개 이상 필요");
        for (const c of cols) if (!c.column?.children?.length) throw new FakeError("validation_error", "빈 column");
      }
      const rich = b[b.type]?.rich_text ?? [];
      for (const t of rich) if ((t.text?.content ?? "").length > 2000) throw new FakeError("validation_error", "텍스트 2000자 초과");
      const id = randomUUID();
      this._blocks.set(id, { parent: parentId, type: b.type });
      const kids = b[b.type]?.children;
      if (kids?.length) {
        if (depth >= 3) throw new FakeError("validation_error", "한 요청에서 블록 중첩은 2단계까지");
        this.#appendTo(id, kids, depth + 1);
      }
      results.push({ object: "block", id, type: b.type });
    }
    const page = this._pages.get(parentId);
    if (page?.children) page.children.push(...results.map((r) => ({ type: r.type, id: r.id })));
    return results;
  }

  #createView(a) {
    const ds = this.ds.get(a.data_source_id);
    if (!ds) throw new FakeError("validation_error", "views.create: data source 없음");
    const placements = ["database_id", "view_id", "create_database"].filter((k) => a[k]);
    if (placements.length !== 1) throw new FakeError("validation_error", "views.create: 위치는 database_id / view_id / create_database 중 정확히 하나");
    if (!a.name || !a.type) throw new FakeError("validation_error", "views.create: name, type 필요");
    const props = (f) => (f?.property ? [f.property] : []);
    for (const p of [...props(a.filter), ...(a.sorts ?? []).map((s) => s.property)]) {
      if (p && !ds.props.has(p)) throw new FakeError("validation_error", `views.create(${a.name}): 없는 속성 '${p}'`);
    }
    const ids = new Set([...ds.props.values()].map((p) => p.id));
    if (a.type === "calendar" && !ids.has(a.configuration?.date_property_id)) throw new FakeError("validation_error", "calendar: date_property_id가 없는 속성");
    if (a.type === "board" && !ids.has(a.configuration?.group_by?.property_id)) throw new FakeError("validation_error", "board: group_by 속성이 없음");
    if (a.configuration && a.configuration.type !== a.type) throw new FakeError("validation_error", "configuration.type과 view type이 달라요");
    if (a.create_database) {
      this.#requirePage(a.create_database.parent.page_id, "views.create 부모");
      this._pages.get(a.create_database.parent.page_id).children.push({ type: "linked_view", id: a.name });
    }
    this._views.push(a);
    this.#record("views.create", { name: a.name });
    return { object: "view", id: randomUUID() };
  }

  // 테스트용: 페이지 아래 블록 순서를 사람이 읽을 수 있게
  outline(pageId) {
    const p = this._pages.get(pageId);
    return (p?.children ?? []).map((c) => c.type);
  }
}

function plain(rich = []) {
  return rich.map((t) => t.text?.content ?? "").join("");
}

function rowTitle(ds, properties = {}) {
  for (const [name, v] of Object.entries(properties)) {
    if (ds.props.get(name)?.type === "title") return plain(v.title);
  }
  return "";
}
