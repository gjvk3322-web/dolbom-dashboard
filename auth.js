/**
 * 돌봄매트 내부 페이지 공용 로그인 게이트 (v2.1 — 구글 로그인 + 승인제)
 *
 * v2.1 (2026-10-01) 깜빡임 개선
 *  - 로그인 확인이 끝나기 전엔 "확인 중…"만 표시 (로그인 버튼 헛클릭 방지)
 *  - 시작 시점을 load → DOMContentLoaded 로 당김 (이미지·CSV 다 받을 때까지 안 기다림)
 *  - 같은 탭에서 한 번 통과한 사람은 sessionStorage 표시로 즉시 화면 공개 후 뒤에서 재검증
 *    (강퇴되면 재검증 시점에 바로 잠김 — 탭 닫으면 표시도 사라짐)
 *
 * 작동 방식
 *  1. 페이지 로드 즉시 화면을 숨김
 *  2. 구글 로그인 → Firebase orgAuth/allow/{uid}에 승인 기록이 있으면 화면 표시
 *  3. 승인 기록이 없으면 orgAuth/pending/{uid}에 대기 등록 → 관리자가 조직운영(org.html) 🔑 접근 관리에서 승인
 *  4. 승인이 해제(강퇴)되면 열어 둔 화면도 그 자리에서 즉시 잠김 (실시간 구독)
 *
 *  - 승인 명단은 org.html과 같은 orgAuth 노드를 공유 → 한 번 승인되면 모든 내부 페이지 통과
 *  - 관리자(ADMIN_EMAILS)는 승인 없이 통과
 *  - 페이지가 이미 firebase(compat)를 쓰고 있어도 충돌하지 않도록 별도 앱 이름(dolbomGate)으로 초기화
 *  - 다른 스크립트에서 쓸 수 있게 window.dolbomAuth = { user, uid, email, name, isAdmin, ready } 제공
 */
(function () {
  'use strict';

  /* ===== 설정 ===== */
  var CFG = {
    apiKey: "AIzaSyA_IxxyRjr3ZJDT-OBtUsfKKWCJaTviRgk",
    authDomain: "dolbom-schedule.firebaseapp.com",
    projectId: "dolbom-schedule",
    databaseURL: "https://dolbom-schedule-default-rtdb.asia-southeast1.firebasedatabase.app"
  };
  var ADMIN_EMAILS = ["gjvk3322@gmail.com"];   // 관리자 이메일 — org.html의 ADMIN_EMAILS와 같게 유지
  var SDK_VER = "9.23.0";                        // 페이지에 firebase가 없을 때 불러올 버전
  var APP_NAME = "dolbomGate";
  var ORG_URL = "/org.html";
  var SESS_KEY = "dolbomGateOk";                // 같은 탭에서 통과한 uid 기억 (재검증 전 즉시 공개용)

  var isAdminEmail = function (e) { return ADMIN_EMAILS.indexOf(String(e || "").toLowerCase()) >= 0; };

  /* 옛 비밀번호 인증 기록 제거 */
  try { localStorage.removeItem("dolbom_auth"); } catch (e) {}

  /* 같은 탭에서 이미 통과한 적이 있으면 → 화면을 숨기지 않고 바로 보여준 뒤 뒤에서 재검증 */
  var sessUid = "";
  try { sessUid = sessionStorage.getItem(SESS_KEY) || ""; } catch (e) {}
  var optimistic = !!sessUid;

  /* ===== 1. 즉시 숨김 (낙관 공개 상태면 생략) ===== */
  var hideStyle = document.createElement("style");
  hideStyle.id = "dolbomGateHide";
  hideStyle.textContent = "html{visibility:hidden!important}#dolbomGate{visibility:visible!important}";
  if (!optimistic) (document.head || document.documentElement).appendChild(hideStyle);

  var state = { user: null, uid: "", email: "", name: "", isAdmin: false, allowed: false };
  var readyResolve;
  window.dolbomAuth = state;
  state.ready = new Promise(function (r) { readyResolve = r; });

  /* ===== 2. 게이트 화면 ===== */
  var UI = {};
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]; }); }

  function buildGate() {
    if (UI.root) return;
    var css = document.createElement("style");
    css.textContent =
      "#dolbomGate{position:fixed;inset:0;z-index:2147483000;background:#F7F9F8;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#212B36}" +
      "#dolbomGate .box{background:#fff;border:1px solid #E5E9EC;border-radius:18px;padding:36px 32px;max-width:380px;width:100%;text-align:center;box-shadow:0 8px 30px rgba(33,43,54,.08)}" +
      "#dolbomGate .ttl{font-size:22px;font-weight:800;margin-bottom:6px}" +
      "#dolbomGate .sub{font-size:13px;color:#637381;margin-bottom:22px;line-height:1.6;word-break:keep-all}" +
      "#dolbomGate button{width:100%;border:1px solid #E5E9EC;border-radius:10px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;background:#fff;color:#212B36;margin-top:8px}" +
      "#dolbomGate button.primary{background:#00B173;border-color:#00B173;color:#fff;margin-top:0}" +
      "#dolbomGate button:disabled{opacity:.5;cursor:default}" +
      "#dolbomGate .tip{font-size:12px;color:#637381;margin-top:14px;line-height:1.6;display:none;word-break:keep-all}" +
      "#dolbomGate .who{font-size:12px;color:#919EAB;margin-top:14px}" +
      "#dolbomGate .spin{width:22px;height:22px;border:3px solid #E5E9EC;border-top-color:#00B173;border-radius:50%;margin:4px auto 0;animation:dgSpin .8s linear infinite}" +
      "@keyframes dgSpin{to{transform:rotate(360deg)}}";
    document.head.appendChild(css);

    var root = document.createElement("div");
    root.id = "dolbomGate";
    if (optimistic) root.style.display = "none";   // 낙관 공개 중엔 게이트 자체를 안 띄움
    root.innerHTML =
      '<div class="box">' +
        '<div class="ttl">돌봄매트 직원 페이지</div>' +
        '<div class="sub" id="dgMsg">로그인 확인 중…</div>' +
        '<div class="spin" id="dgSpin"></div>' +
        '<button class="primary" id="dgLogin" style="display:none">Google로 로그인</button>' +
        '<button id="dgLogout" style="display:none">로그아웃</button>' +
        '<button id="dgRetry" style="display:none">다시 시도</button>' +
        '<div class="tip" id="dgTip"></div>' +
        '<div class="who" id="dgWho"></div>' +
      '</div>';
    document.body.appendChild(root);
    UI.root = root; UI.msg = root.querySelector("#dgMsg"); UI.login = root.querySelector("#dgLogin");
    UI.logout = root.querySelector("#dgLogout"); UI.retry = root.querySelector("#dgRetry");
    UI.tip = root.querySelector("#dgTip"); UI.who = root.querySelector("#dgWho");
    UI.spin = root.querySelector("#dgSpin");
    UI.retry.onclick = function () { location.reload(); };
  }
  function gateShow(msg, mode) { // mode: 'login' | 'wait' | 'error' | 'check'
    buildGate();
    UI.root.style.display = "flex";
    UI.msg.innerHTML = msg;
    UI.spin.style.display = mode === "check" ? "" : "none";
    UI.login.style.display = mode === "login" ? "" : "none";
    UI.logout.style.display = mode === "wait" ? "" : "none";
    UI.retry.style.display = mode === "error" ? "" : "none";
    UI.who.textContent = state.email ? state.email : "";
    if (!document.getElementById("dolbomGateHide")) document.head.appendChild(hideStyle);
    document.documentElement.classList.add("dolbom-locked");
  }
  function gateHide() {
    if (UI.root) UI.root.style.display = "none";
    var h = document.getElementById("dolbomGateHide");
    if (h) h.parentNode.removeChild(h);
    document.documentElement.classList.remove("dolbom-locked");
  }

  /* 인앱 브라우저(카톡 등) — 구글이 WebView 로그인을 막으므로 외부 브라우저로 유도 */
  function inAppBrowser() {
    var ua = navigator.userAgent || "";
    if (/KAKAOTALK/i.test(ua)) return "kakao";
    if (/NAVER\(inapp|whale.*inapp|LINE\/|Instagram|FBAN|FBAV|DaumApps|everytimeApp/i.test(ua)) return "etc";
    return null;
  }
  var inApp = inAppBrowser();

  /* ===== 3. Firebase SDK 준비 (페이지 것과 충돌 없이) ===== */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = res; s.onerror = function () { rej(new Error("load fail: " + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureSdk() {
    var fb = window.firebase;
    if (fb && fb.SDK_VERSION && typeof fb.initializeApp === "function") {
      // 페이지가 compat SDK를 이미 씀 → 같은 버전의 auth(+database)만 추가
      var v = fb.SDK_VERSION, major = parseInt(v, 10);
      var base = "https://www.gstatic.com/firebasejs/" + v + "/";
      var need = [];
      if (!fb.auth) need.push(base + (major >= 9 ? "firebase-auth-compat.js" : "firebase-auth.js"));
      if (!fb.database) need.push(base + (major >= 9 ? "firebase-database-compat.js" : "firebase-database.js"));
      return need.reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve());
    }
    // 페이지에 firebase가 없거나 modular(v10 import) 방식 → compat 세트를 새로 불러옴
    var b = "https://www.gstatic.com/firebasejs/" + SDK_VER + "/";
    return loadScript(b + "firebase-app-compat.js")
      .then(function () { return loadScript(b + "firebase-auth-compat.js"); })
      .then(function () { return loadScript(b + "firebase-database-compat.js"); });
  }

  /* ===== 4. 로그인 + 승인 확인 ===== */
  var app, auth, db, allowRef, allowCb;

  function start() {
    var fb = window.firebase;
    app = null;
    for (var i = 0; i < (fb.apps || []).length; i++) if (fb.apps[i].name === APP_NAME) app = fb.apps[i];
    if (!app) app = fb.initializeApp(CFG, APP_NAME);
    auth = fb.auth(app);
    db = fb.database(app);

    buildGate();
    if (inApp) {
      UI.tip.style.display = "";
      UI.tip.innerHTML = inApp === "kakao"
        ? "카카오톡 안에서는 구글 로그인이 차단돼요.<br>외부 브라우저로 자동 이동 중… 안 되면 우측 하단 ⋯ → <b>다른 브라우저로 열기</b>를 눌러 주세요."
        : "앱 안 브라우저에서는 구글 로그인이 차단돼요.<br>메뉴에서 <b>다른 브라우저(Safari/Chrome)로 열기</b>를 눌러 주세요.";
      if (inApp === "kakao") location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
    }

    UI.login.onclick = function () {
      if (inApp) {
        if (inApp === "kakao") location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
        UI.tip.style.display = "";
        return;
      }
      var provider = new fb.auth.GoogleAuthProvider();
      UI.login.disabled = true;
      auth.signInWithPopup(provider).catch(function (e1) {
        UI.login.disabled = false;
        if (e1 && (e1.code === "auth/cancelled-popup-request" || e1.code === "auth/popup-closed-by-user")) return;
        auth.signInWithRedirect(provider).catch(function (e2) {
          UI.tip.style.display = "";
          UI.msg.textContent = "로그인에 실패했어요: " + (e2.message || e2.code || "");
        });
      });
    };
    UI.logout.onclick = function () { auth.signOut().then(function () { location.reload(); }); };

    auth.onAuthStateChanged(function (user) {
      if (allowRef && allowCb) { allowRef.off("value", allowCb); allowRef = null; }
      state.user = user; state.uid = user ? user.uid : ""; state.email = user ? (user.email || "") : "";
      state.isAdmin = !!(user && isAdminEmail(user.email)); state.allowed = false; state.name = "";
      if (!user) { sessForget(); gateShow("승인된 직원만 접근할 수 있습니다.", "login"); return; }
      // 로그인은 돼 있는데 다른 계정이면 낙관 공개 취소
      if (optimistic && sessUid !== user.uid) { sessForget(); gateShow("로그인 확인 중…", "check"); }

      allowRef = db.ref("orgAuth/allow/" + user.uid);
      allowCb = function (snap) {
        var ok = snap.exists() || state.isAdmin;
        var info = snap.val() || {};
        state.name = info.name || (state.isAdmin ? (localStorage.getItem("orgUser") || "") : "") || user.displayName || "";
        if (ok) {
          if (!state.allowed) { state.allowed = true; readyResolve(state); }
          if (info.name) { try { localStorage.setItem("orgUser", info.name); } catch (e) {} }
          try { sessionStorage.setItem(SESS_KEY, user.uid); } catch (e) {}
          gateHide();
          document.dispatchEvent(new CustomEvent("dolbom-auth", { detail: state }));
        } else {
          var wasAllowed = state.allowed || (optimistic && sessUid === user.uid);
          state.allowed = false;
          sessForget();
          db.ref("orgAuth/pending/" + user.uid).update({ email: user.email || "", name: user.displayName || "", at: Date.now() }).catch(function () {});
          gateShow(
            wasAllowed
              ? "<b>" + esc(user.email) + "</b><br>접근 권한이 해제되었습니다.<br>관리자에게 문의해 주세요."
              : "<b>" + esc(user.email) + "</b><br>승인 대기 중입니다.<br>관리자 승인 후 자동으로 열립니다.",
            "wait"
          );
        }
      };
      allowRef.on("value", allowCb, function () {
        sessForget();
        gateShow("접근 확인에 실패했어요 — 관리자에게 문의해 주세요.", "error");
      });
    });
  }

  function sessForget() {
    optimistic = false; sessUid = "";
    try { sessionStorage.removeItem(SESS_KEY); } catch (e) {}
  }

  function boot() {
    if (!optimistic) gateShow("로그인 확인 중…", "check");
    ensureSdk().then(start).catch(function (e) {
      console.error("[dolbom auth]", e);
      sessForget();
      gateShow("로그인 모듈을 불러오지 못했어요.<br>인터넷 연결을 확인하고 다시 시도해 주세요.", "error");
    });
  }
  // 페이지의 다른 스크립트(firebase 포함)가 모두 실행된 뒤에 시작 → SDK 버전 충돌 방지
  // v2.1: load(이미지·CSV까지 전부) 대신 DOMContentLoaded(스크립트 실행 완료 시점)에 시작
  if (document.readyState !== "loading") boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
