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

const file = process.argv[2] || "index.html";
const path = process.argv[3] || "/";
const asMember = process.argv.includes("--login");
const empty = process.argv.includes("--empty");
const url = "https://example.com" + path;
const html = fs.readFileSync(file, "utf8");

/* ---------- 브라우저 환경 ----------
   react-dom 을 부르기 전에 window 와 document 를 먼저 깔아야 한다.
   react-dom 은 로드하는 순간 "여기 DOM 이 있나" 를 한 번 정해두는데,
   그때 window 가 없으면 IE 시절 경로로 굳어서 글자 입력에 onChange 가 오지 않는다.
   순서가 바뀌면 조용히 그렇게 되니 아래 require 를 위로 올리지 말 것. */
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

const React = require("react");
const ReactDOM = require("react-dom/client");

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

// 내가 만든 시험 카테고리. subject 가 null 이면 전 과목에서 보인다
const CATEGORIES = [
  { id: "k1", user_id: UID, name: "이감", subject: "korean", created_at: "2026-03-01T00:00:00Z" },
  { id: "k2", user_id: UID, name: "킬링캠프", subject: "math", created_at: "2026-03-02T00:00:00Z" },
  { id: "k3", user_id: UID, name: "더프리미엄", subject: null, created_at: "2026-03-03T00:00:00Z" },
];

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
ls.setItem("sn-categories", JSON.stringify(CATEGORIES));

/* ---------- 가짜 Supabase ---------- */
const DATA = { exam_records: RECORDS.slice(), exam_categories: CATEGORIES.slice() };
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
// 컴파일본은 문서가 이미 준비됐으면 그 자리에서 바로 앱을 띄운다.
// 그때 또 DOMContentLoaded 를 쏘면 앱이 두 번 떠서 (createRoot 중복)
// 입력 이벤트가 옛 화면으로 가버린다. 아직 안 떴을 때만 쏜다.
if (!window.document.getElementById("root").hasChildNodes()) {
  window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
}

// 화면에 보이는 글자로 버튼을 찾아 누른다. 기록 입력창은 눌러야 열린다.
// 입력창이 열려 있으면 그 안에서만 찾는다. 뒤에 깔린 목록에도 같은 글자의
// 버튼이 있어서(과목 필터) 그냥 찾으면 엉뚱한 걸 누른다.
// 창이 겹쳐 뜰 수 있다 (기록 입력창 위에 시험 고르는 창). 맨 위 것에서 찾는다
const topSheet = () => {
  const all = window.document.querySelectorAll(".sheet");
  return all.length ? all[all.length - 1] : null;
};
const btns = () => Array.from((topSheet() || window.document).querySelectorAll("button"));
const clickByText = (needle) => {
  const b = btns().find((x) => (x.textContent || "").trim() === needle);
  if (!b) return false;
  b.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  return true;
};
/* 입력칸에 글자를 넣는다.
   React 는 칸마다 마지막으로 넣은 값을 따로 들고 있어서(_valueTracker)
   값만 바꿔치기하면 바뀐 걸 모른다. 그 기억을 먼저 비워야 onChange 가 온다.
   (파일 위쪽 require 순서가 어긋나면 이게 통째로 안 먹으니 그쪽도 같이 볼 것) */
const inputValues = () => Array.from(window.document.querySelectorAll("input")).map((i) => i.value);
const typeInto = (el, value) => {
  if (!el) return false;
  try { if (el._valueTracker) el._valueTracker.setValue(""); } catch (e) {}
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, String(value));
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
  return true;
};
const inputByPlaceholder = (frag) =>
  Array.from((topSheet() || window.document).querySelectorAll("input"))
    .find((i) => (i.placeholder || "").includes(frag));
const selects = () => {
  const sheet = window.document.querySelector(".sheet");
  return Array.from((sheet || window.document).querySelectorAll("select"));
};
const chooseIn = (sel, value) => {
  if (!sel) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(sel, String(value));
  sel.dispatchEvent(new window.Event("change", { bubbles: true }));
  return true;
};
const withForm = process.argv.includes("--form");

// 시험 고르는 창에 지금 뜨는 것들
const pickerChips = () =>
  btns().map((b) => (b.textContent || "").trim())
    .filter((t) => t && t !== "닫기" && t.indexOf("+ 새 카테고리") !== 0);
// 고른 시험 이름. 화살표는 빼고 읽는다
const examField = () => (topSheet() || window.document).querySelector("button.exname");
const shownName = () => {
  const el = window.document.querySelector("button.exname");
  return el ? (el.textContent || "").replace("▾", "").trim() : "";
};
const openPicker = () => {
  const b = examField();
  if (!b) return false;
  b.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  return true;
};

const step = (fn, ms) => setTimeout(fn, ms || 140);

setTimeout(() => {
  if (!withForm) return report();
  if (!clickByText("+ 기록")) { log("  입력창   : 기록 버튼 없음 X"); process.exit(1); }
  step(() => {
    const opened = (window.document.body.textContent || "").includes("어떤 시험이었나요");
    log("  입력창   :", opened ? "열림 OK" : "안 열림 X");
    if (!opened) process.exit(1);

    // 이 과목으로 최근에 본 시험이 한 번에 눌리게 앞에 깔려야 한다
    log("  최근시험 :", pickerChips().filter((t) => /학력평가|모의평가|회$/.test(t)).join(" ") || "없음");

    // 최근 것은 한 번 누르면 바로 정해져야 한다
    clickByText("3월 학력평가");
    step(() => {
      log("  한번탭   :", shownName() ? shownName() + " OK" : "안 정해짐 X");
      afterRecent();
    });
  }, 300);
}, 1200);

function afterRecent() {
  {
    // 칸을 누르면 고르는 창이 올라온다
    if (!openPicker()) { log("  고르는칸 : 없음 X"); return report(); }
    step(() => {
      const opened = (window.document.body.textContent || "").includes("시험 고르기");
      log("  고르는창 :", opened ? "열림 OK" : "안 열림 X");
      if (!opened) return report();
      const chips = pickerChips();
      log("  국어목록 :", ["6월 모의평가", "수능", "이감", "더프리미엄"].filter((n) => chips.indexOf(n) !== -1).join(" ") || "없음 X");
      log("  다른과목 :", chips.indexOf("킬링캠프") === -1 ? "킬링캠프 안 보임 OK" : "킬링캠프 보임 X");

      // 평가원·교육청은 몇 년도 시험인지 묻는다 (푼 날짜가 아니다)
      clickByText("6월 모의평가");
      step(() => {
        const askYear = (window.document.body.textContent || "").includes("몇 년도 시험인가요");
        log("  연도물음 :", askYear ? "물어봄 OK" : "안 물어봄 X");
        if (!askYear) return report();
        clickByText("2024");
        step(() => {
          log("  연도붙음 :", shownName() === "2024 6월 모의평가" ? "2024 6월 모의평가 OK" : (shownName() || "") + " X");

          // 사설은 회차를 적는다. 칸에 다음 회차가 미리 들어가 있어야 한다
          openPicker();
          step(() => {
            clickByText("이감");
            step(() => {
              const askRound = (window.document.body.textContent || "").includes("몇 회차인가요");
              log("  회차물음 :", askRound ? "물어봄 OK" : "안 물어봄 X");
              if (!askRound) return report();
              const box = inputByPlaceholder("회차");
              log("  회차칸   :", box ? (box.value === "" ? "비어있음 (지난 기록 없어 정상)" : "미리 " + box.value) : "없음 X");
              // 회차가 50 을 넘어도 적을 수 있어야 한다
              typeInto(box, 47);
              step(() => {
                clickByText("확인");
                step(() => {
                  log("  회차적음 :", shownName() === "이감 47회" ? "이감 47회 OK" : (shownName() || "") + " X");
                  report();
                });
              });
            });
          });
        });
      });
    });
  }
}

function report() {
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
}
