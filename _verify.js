// 컴파일된 index.html 을 진짜 React 로 렌더링해 확인한다.
// Supabase 는 가짜로 대체하므로 실제 DB 에 영향을 주지 않는다.
//
//   node verify.js index.html /
//   node verify.js index.html /timer
//   node verify.js index.html /records --login
//   node verify.js index.html /stats --login
//
// --login  로그인 상태로 (Supabase 키가 채워진 경우에만 뜻이 있다)
// --empty  기록이 하나도 없는 상태로

const fs = require("fs");
const { JSDOM } = require("jsdom");
const React = require("react");
const ReactDOM = require("react-dom/client");

const file = process.argv[2] || "index.html";
const path = process.argv[3] || "/";
const asMember = process.argv.includes("--login");
const empty = process.argv.includes("--empty");
const url = "https://example.com" + path;
const html = fs.readFileSync(file, "utf8");

/* ---------- 가짜 데이터 ---------- */
const UID = "test-user";
const RECORDS = empty ? [] : [
  { id: "r1", user_id: UID, exam_name: "3월 학력평가", exam_date: "2026-03-26", subject: "korean", detail: "화법과 작문",
    raw_score: 88, std_score: 129, percentile: 92, grade: 2, wrong_nos: [14, 20, 34], duration_sec: 4800, memo: "비문학에서 시간이 모자랐다", created_at: "2026-03-26T10:00:00Z" },
  { id: "r2", user_id: UID, exam_name: "6월 모의평가", exam_date: "2026-06-04", subject: "korean", detail: "화법과 작문",
    raw_score: 94, std_score: 134, percentile: 97, grade: 1, wrong_nos: [20, 41], duration_sec: 4700, memo: "", created_at: "2026-06-04T10:00:00Z" },
  { id: "r3", user_id: UID, exam_name: "6월 모의평가", exam_date: "2026-06-04", subject: "math", detail: "미적분",
    raw_score: 76, std_score: 128, percentile: 89, grade: 3, wrong_nos: [21, 22, 29, 30], duration_sec: 6000, memo: "", created_at: "2026-06-04T12:10:00Z" },
  // 점수를 안 적은 기록도 화면이 안 깨져야 한다
  { id: "r4", user_id: UID, exam_name: "사설 모의고사", exam_date: "2026-07-15", subject: "english", detail: "",
    raw_score: null, std_score: null, percentile: null, grade: null, wrong_nos: [], duration_sec: null, memo: "", created_at: "2026-07-15T09:00:00Z" },
];

/* ---------- 브라우저 환경 ---------- */
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url, pretendToBeVisual: true });
const { window } = dom;
function setGlobal(name, value) {
  try { global[name] = value; }
  catch (e) { Object.defineProperty(global, name, { value, configurable: true, writable: true }); }
}
setGlobal("window", window);
setGlobal("document", window.document);
setGlobal("navigator", window.navigator);
setGlobal("HTMLElement", window.HTMLElement);
setGlobal("Node", window.Node);
setGlobal("getComputedStyle", window.getComputedStyle);
setGlobal("React", React);
setGlobal("ReactDOM", ReactDOM);
setGlobal("requestAnimationFrame", (f) => setTimeout(f, 0));
setGlobal("cancelAnimationFrame", clearTimeout);
setGlobal("alert", () => {});
setGlobal("confirm", () => true);
window.React = React; window.ReactDOM = ReactDOM;
window.alert = global.alert; window.confirm = global.confirm;

const store = {};
const ls = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
Object.defineProperty(window, "localStorage", { value: ls, configurable: true });
global.localStorage = ls;
// 체험 모드(키 없음)일 때 읽어갈 기록
ls.setItem("sn-records", JSON.stringify(RECORDS));

/* ---------- 가짜 Supabase ---------- */
const DATA = { exam_records: RECORDS.slice() };
function chain(table, st) {
  const s = Object.assign({ single: false, filters: [] }, st);
  const settle = () =>
    Promise.resolve().then(() => {
      const list = (DATA[table] || []).filter((r) => s.filters.every(([c, v]) => r[c] === v));
      return { data: s.single ? list[0] || null : list, error: null };
    });
  return new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (...a) => settle().then(...a);
      if (prop === "catch") return (...a) => settle().catch(...a);
      if (prop === "finally") return (...a) => settle().finally(...a);
      if (prop === "single" || prop === "maybeSingle") return () => chain(table, { ...s, single: true });
      if (prop === "eq") return (c, v) => chain(table, { ...s, filters: [...s.filters, [c, v]] });
      if (prop === "insert") return (row) => {
        const r = Object.assign({ id: "n" + Date.now(), created_at: new Date().toISOString() }, row);
        DATA[table].push(r);
        return chain(table, { ...s, filters: [["id", r.id]] });
      };
      return () => chain(table, s);
    },
  });
}
const session = asMember ? { user: { id: UID, email: "tester@suneung.app", user_metadata: { username: "테스터" } } } : null;
window.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session } }),
      getUser: async () => ({ data: { user: session ? session.user : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
      signInWithPassword: async () => ({ data: null, error: { message: "x" } }),
      signUp: async () => ({ data: null, error: { message: "x" } }),
      updateUser: async () => ({ error: null }),
    },
    from: (t) => chain(t),
    rpc: () => chain("_none"),
  }),
};

/* ---------- 실행 ---------- */
const errors = [];
const log = console.log.bind(console);
console.error = (...a) => errors.push(a.join(" "));
window.addEventListener("error", (e) => errors.push("onerror: " + e.message));
process.on("unhandledRejection", (r) => errors.push("unhandledRejection: " + r));

const m = html.match(/<script>\n(\(function\(\)\{[\s\S]*?)\n<\/script>/);
if (!m) { log("컴파일된 스크립트를 찾지 못했습니다. build.js 로 만든 파일이 맞는지 확인하세요."); process.exit(1); }
try {
  new Function("window", "document", "React", "ReactDOM", "localStorage", "alert", "confirm", m[1])(
    window, window.document, React, ReactDOM, ls, global.alert, global.confirm
  );
} catch (e) {
  log("실행 중 예외:", e.message);
  process.exit(1);
}
window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

setTimeout(() => {
  const root = window.document.getElementById("root");
  const text = root.textContent || "";
  const inner = root.innerHTML || "";
  log("주소  :", path, asMember ? "(로그인 상태)" : "(비로그인)", empty ? "(기록 없음)" : "");
  log("  렌더링   :", inner.length > 800 ? "OK " + inner.length + "자" : "비어있음 X");
  log("  헤더     :", text.includes("수능 대비") ? "OK" : "안 보임 X");
  const scr = (text.match(/[^\s]{2,}(타이머|기록|흐름|계정|한 걸음)/) || [])[0];
  if (scr) log("  화면     :", scr);
  const dd = (text.match(/D-\d+/) || [])[0];
  if (dd) log("  수능까지 :", dd);
  const clock = (text.match(/\d{1,2}:\d{2}:\d{2}|\b\d{2}:\d{2}\b/) || [])[0];
  if (clock) log("  시계     :", clock);
  if (text.includes("로그인하기")) log("  안내     : 로그인 안내 표시");

  const real = errors.filter((e) => !/scrollTo|Not implemented|act\(|Warning:|wakeLock|AudioContext/i.test(e));
  log("  에러     :", real.length === 0 ? "없음 OK" : real.length + "건");
  real.slice(0, 3).forEach((e) => log("     - " + e.slice(0, 200)));
  process.exit(real.length ? 1 : 0);
}, 1200);
