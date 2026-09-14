/* iolog.js — 돌봄매트 스케줄러 📦 입·출고 탭 (부산·경기 공용)
   차에 실은(출고) / 창고로 내린(입고) 자재를 시각 스탬프 사진과 함께 기록
   저장: Apps Script(입출고기록 시트 + 드라이브 '입출고사진' 폴더) ← 원본, Firebase io_logs/{bs|gg} ← 앱 실시간 목록
   로드: scheduler.html / scheduler-gg.html 맨 아래 guide.js 다음 <script src="./iolog.js?v=..."> (코드 수정 시 v 값도 변경) */
(function(){
'use strict';
const IO_VER='2026.09.14b';
const RK=/scheduler-gg/i.test(location.pathname)?'gg':'bs';
const RN=RK==='gg'?'경기':'부산';
const NODE='io_logs/'+RK;
const OWN_MIN=30;         // 본인 기록 취소 가능 시간(분) — 지나면 당번 모드에서만
const DAYS=7;             // 목록 표시 기간(일)
const MAX_PX=1280;        // 업로드 사진 긴 변(px)
const JPG_Q=0.76;
const LATE_MIN=30;        // 사진 시각과 제출 시각 차이 경고(분)

// 재고표 순서. per=박스당 장수, per10=10T 박스당 장수
const PRODUCTS=[
  {k:'500 모던',    g:'500매트', c:'모던',   per:12, per10:24, cls:'modern'},
  {k:'500 마블',    g:'500매트', c:'마블',   per:12, per10:24, cls:'marble'},
  {k:'500 코튼',    g:'500매트', c:'코튼',   per:12, per10:24, cls:'cotton'},
  {k:'1M 22T 모던', g:'1M 매트', c:'22T 모던',   per:4,  per10:8,  cls:'modern'},
  {k:'1M 22T 베이지',g:'1M 매트',c:'22T 베이지', per:4,  per10:8,  cls:'beige'},
  {k:'1M 17T 모던', g:'1M 매트', c:'17T 모던',   per:6,  per10:8,  cls:'modern'},
  {k:'1M 17T 베이지',g:'1M 매트',c:'17T 베이지', per:6,  per10:8,  cls:'beige'}
];
const PART=[{k:'c',n:'센터'},{k:'s',n:'사이드'},{k:'k',n:'코너'},{k:'t',n:'10T'}];
const TYPE={out:{n:'출고',sub:'창고 → 차량',ico:'🚚'},in:{n:'입고',sub:'차량 → 창고',ico:'↩️'}};

/* ---------- 유틸 ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const num=v=>{const x=parseInt(String(v||'').replace(/[^0-9]/g,''),10);return isNaN(x)?0:Math.min(x,9999)};
const DOWK=['일','월','화','수','목','금','토'];
function kst(d){const t=d instanceof Date?d:new Date(d);return new Date(t.getTime()+(9*60+t.getTimezoneOffset())*60000)}
function pad(n){return String(n).padStart(2,'0')}
function kstDate(offDays,base){const k=kst(base||new Date());if(offDays)k.setDate(k.getDate()+offDays);return k.getFullYear()+'-'+pad(k.getMonth()+1)+'-'+pad(k.getDate())}
function kstDT(base){const k=kst(base||new Date());return kstDate(0,base)+' '+pad(k.getHours())+':'+pad(k.getMinutes())+':'+pad(k.getSeconds())}
function dowOf(ds){const p=ds.split('-');return DOWK[new Date(+p[0],+p[1]-1,+p[2]).getDay()]}
function fmtD(ds){const p=ds.split('-');return (+p[1])+'/'+(+p[2])+' ('+dowOf(ds)+')'}
function hm(dt){return String(dt||'').slice(11,16)}
function prod(k){return PRODUCTS.find(p=>p.k===k)}
function ioToast(msg,err){
  const t=$('toast');if(!t){alert(msg);return}
  t.textContent=msg;t.className='toast toast-ok';t.style.display='block';
  t.style.background=err?'rgba(255,69,58,.92)':'';t.style.color=err?'#fff':'';
  clearTimeout(ioToast._t);ioToast._t=setTimeout(()=>{t.style.display='none';t.style.background='';t.style.color=''},2600);
}
function devId(){let d=localStorage.getItem('io_dev');if(!d){d=Math.random().toString(36).slice(2,10);localStorage.setItem('io_dev',d)}return d}
function vehicles(){try{return (typeof VEHICLES==='object'&&VEHICLES)?VEHICLES:{}}catch(e){return {}}}
function employees(){try{return Array.isArray(E)?E.filter(Boolean):[]}catch(e){return []}}
function admin(){try{return !!isAdmin}catch(e){return false}}
function apiUrl(){try{return SHEET_REPORT_URL}catch(e){return ''}}

/* ---------- CSS ---------- */
const CSS=`
.nav a{white-space:nowrap;padding-left:2px;padding-right:2px;letter-spacing:-.2px;overflow:hidden}
#p-io{padding-bottom:40px}
.io-hd{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;padding:8px 0 4px}
.io-hd h2{font-size:18px;font-weight:900;letter-spacing:-.3px}
.io-hd p{font-size:12px;color:var(--dim);margin-top:4px;line-height:1.5}
.io-start{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0 6px}
.io-start button{padding:16px 12px;border-radius:16px;border:none;font-family:var(--font);cursor:pointer;text-align:left;-webkit-tap-highlight-color:transparent;transition:transform .1s}
.io-start button:active{transform:scale(.97)}
.io-start .out{background:var(--green);color:#03170a}
.io-start .in{background:var(--card2);color:var(--text);border:1px solid rgba(255,255,255,.08)}
.io-start b{display:block;font-size:17px;font-weight:900;letter-spacing:-.3px}
.io-start small{display:block;font-size:12px;opacity:.75;margin-top:3px;font-weight:600}
.io-status{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:700;margin:8px 0}
.io-status.wait{background:rgba(255,214,10,.1);color:var(--yellow)}
.io-status.err{background:rgba(255,69,58,.12);color:var(--red)}
.io-status button{padding:7px 12px;border-radius:9px;border:none;background:rgba(255,255,255,.12);color:inherit;font-family:var(--font);font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
.io-day{margin-top:18px}
.io-day-hd{display:flex;align-items:baseline;justify-content:space-between;padding:0 2px 8px}
.io-day-hd b{font-size:15px;font-weight:900}
.io-day-hd span{font-size:11px;color:var(--dim);font-weight:700}
.io-sum{background:var(--card);border-radius:12px;padding:10px 14px;margin-bottom:8px;font-size:12px;line-height:1.7;color:var(--sub)}
.io-sum b{color:var(--text);font-weight:800}
.io-sum .t{display:inline-block;min-width:40px;font-weight:800}
.io-sum .t.out{color:var(--green)}.io-sum .t.in{color:var(--cyan)}
.io-card{display:flex;gap:12px;background:var(--card);border-radius:14px;padding:12px;margin-bottom:8px}
.io-card.void{opacity:.45}
.io-th{width:78px;height:78px;border-radius:10px;background:var(--card2);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--dim);text-align:center;line-height:1.4;cursor:pointer;-webkit-tap-highlight-color:transparent}
.io-th img{width:100%;height:100%;object-fit:cover;display:block}
.io-body{flex:1;min-width:0}
.io-l1{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px}
.io-tag{display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800}
.io-tag.out{background:rgba(48,209,88,.15);color:var(--green)}
.io-tag.in{background:rgba(100,210,255,.15);color:var(--cyan)}
.io-tag.wait{background:rgba(255,214,10,.15);color:var(--yellow)}
.io-tag.late{background:rgba(255,159,10,.15);color:var(--orange)}
.io-tag.void{background:rgba(255,69,58,.15);color:var(--red)}
.io-l1 .tm{font-size:13px;font-weight:800}
.io-l1 .who{font-size:12px;color:var(--sub);font-weight:600}
.io-item{font-size:13px;line-height:1.55;color:var(--text)}
.io-item b{font-weight:800;white-space:nowrap}
.io-item .q{color:var(--sub)}
.io-note{font-size:11px;color:var(--dim);margin-top:4px}
.io-x{align-self:flex-start;background:none;border:1px solid var(--border);color:var(--dim);border-radius:8px;padding:5px 8px;font-size:11px;font-family:var(--font);cursor:pointer;flex-shrink:0}
.io-empty{text-align:center;color:var(--dim);font-size:13px;padding:36px 0;line-height:1.7}
/* 작성 화면 */
.io-ov{display:none;position:fixed;inset:0;background:var(--bg);z-index:990;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.io-ov.show{display:block}
.io-ov-in{max-width:520px;margin:0 auto;padding:0 16px 120px}
.io-ov-hd{position:sticky;top:0;z-index:5;background:var(--bg);display:flex;align-items:center;justify-content:space-between;padding:14px 0 10px;padding-top:max(14px,env(safe-area-inset-top))}
.io-ov-hd b{font-size:17px;font-weight:900}
.io-ov-hd button{background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:7px 12px;color:var(--text);font-size:13px;font-family:var(--font);cursor:pointer}
.io-seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:var(--card);border-radius:14px;padding:4px;margin-bottom:14px}
.io-seg button{padding:11px 8px;border-radius:11px;border:none;background:transparent;color:var(--dim);font-family:var(--font);font-size:14px;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent}
.io-seg button small{display:block;font-size:11px;font-weight:600;opacity:.8;margin-top:2px}
.io-seg button.on.out{background:var(--green);color:#03170a}
.io-seg button.on.in{background:var(--cyan);color:#001b24}
.io-sec{margin:0 0 14px}
.io-lb{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:800;color:var(--sub);margin-bottom:8px;letter-spacing:-.2px}
.io-lb small{font-weight:500;color:var(--dim);font-size:11px}
.io-lb .lnk{font-size:12px;font-weight:700;color:var(--blue);cursor:pointer;padding:4px 6px}
.io-photo{position:relative;border-radius:16px;overflow:hidden;background:var(--card);border:2px dashed rgba(255,255,255,.14);min-height:170px;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.io-photo.has{border-style:solid;border-color:rgba(48,209,88,.4)}
.io-photo .ph{text-align:center;color:var(--sub);padding:26px 16px}
.io-photo .ph .i{font-size:42px;line-height:1;margin-bottom:10px}
.io-photo .ph b{display:block;font-size:16px;font-weight:900;color:var(--text);margin-bottom:6px}
.io-photo .ph small{font-size:12px;color:var(--dim);line-height:1.5}
.io-photo img{width:100%;display:block}
.io-photo .re{position:absolute;top:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:9px;padding:7px 11px;font-size:12px;font-weight:800;font-family:var(--font);cursor:pointer;backdrop-filter:blur(6px)}
.io-photo .busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);color:#fff;font-weight:800;font-size:14px}
.io-date{display:flex;align-items:center;justify-content:space-between;background:var(--card);border-radius:14px;padding:14px 16px}
.io-date b{font-size:18px;font-weight:900;letter-spacing:-.3px}
.io-date b small{font-size:13px;color:var(--dim);font-weight:600;margin-left:6px}
.io-date input{background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:9px;padding:8px 10px;font-size:16px;font-family:var(--font);color-scheme:dark}
.io-chips{display:flex;flex-wrap:wrap;gap:8px}
.io-chip{padding:11px 14px;border-radius:12px;background:var(--card);border:1.5px solid transparent;font-size:15px;font-weight:800;color:var(--text);cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;line-height:1.2}
.io-chip small{display:block;font-size:11px;font-weight:600;color:var(--dim);margin-top:2px}
.io-chip.on{border-color:var(--green);background:rgba(48,209,88,.12)}
.io-chip.on small{color:var(--green)}
.io-chip.dim{color:var(--dim);font-weight:600}
.io-sel{width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:13px 14px;font-size:16px;font-family:var(--font);appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%238e8e93' stroke-width='2'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.io-inp{width:100%;background:var(--card);border:1px solid var(--border);color:var(--text);border-radius:12px;padding:13px 14px;font-size:16px;font-family:var(--font);outline:none}
.io-inp:focus,.io-sel:focus{border-color:rgba(90,200,250,.5)}
.io-pc{background:var(--card);border-radius:16px;padding:14px;margin-bottom:10px}
.io-pc-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.io-pc-hd b{font-size:14px;font-weight:900}
.io-pc-hd button{background:none;border:none;color:var(--dim);font-size:12px;font-family:var(--font);cursor:pointer;padding:4px 6px;font-weight:700}
.io-pg{font-size:11px;font-weight:700;color:var(--dim);margin:8px 0 6px}
.io-pg:first-of-type{margin-top:0}
.io-pchips{display:flex;flex-wrap:wrap;gap:6px}
.io-pchip{padding:9px 12px;border-radius:10px;font-size:14px;font-weight:800;border:1.5px solid transparent;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;background:var(--card2);color:var(--sub)}
.io-pchip.modern{color:#ff8a80}.io-pchip.beige{color:var(--yellow)}.io-pchip.marble{color:var(--blue)}.io-pchip.cotton{color:var(--green)}
.io-pchip.on{border-color:currentColor;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px currentColor}
.io-grid{margin-top:12px;border-top:1px solid var(--border)}
.io-row{display:grid;grid-template-columns:52px 1fr 1fr 60px;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)}
.io-row .n{font-size:14px;font-weight:800}
.io-row .u{position:relative}
.io-row input{width:100%;background:var(--card2);border:1px solid transparent;color:var(--text);border-radius:10px;padding:11px 34px 11px 10px;font-size:18px;font-weight:800;font-family:var(--font);text-align:right;outline:none;-moz-appearance:textfield}
.io-row input::-webkit-outer-spin-button,.io-row input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.io-row input:focus{border-color:rgba(90,200,250,.6);background:var(--bg)}
.io-row input.z{color:var(--dim);font-weight:600}
.io-row .u i{position:absolute;right:10px;top:50%;transform:translateY(-50%);font-style:normal;font-size:11px;color:var(--dim);font-weight:700;pointer-events:none}
.io-row .q{text-align:right;font-size:14px;font-weight:900;color:var(--green);white-space:nowrap}
.io-row .q.z{color:var(--dim);font-weight:600}
.io-row .q.t{color:var(--purple)}
.io-ghd{display:grid;grid-template-columns:52px 1fr 1fr 60px;gap:8px;padding:8px 0 4px;font-size:11px;color:var(--dim);font-weight:700}
.io-ghd span:nth-child(n+2){text-align:right;padding-right:10px}
.io-pc-ft{display:flex;justify-content:space-between;align-items:baseline;padding-top:10px;font-size:13px;color:var(--sub)}
.io-pc-ft b{font-size:16px;font-weight:900;color:var(--text)}
.io-add{width:100%;padding:14px;border-radius:14px;border:1.5px dashed rgba(255,255,255,.18);background:transparent;color:var(--text);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer}
.io-add small{display:block;font-size:11px;color:var(--dim);font-weight:600;margin-top:3px}
.io-foot{position:fixed;left:0;right:0;bottom:0;background:linear-gradient(to top,var(--bg) 70%,rgba(25,26,32,0));padding:14px 16px;padding-bottom:max(16px,env(safe-area-inset-bottom));z-index:6}
.io-foot-in{max-width:520px;margin:0 auto}
.io-submit{width:100%;padding:17px;border-radius:16px;border:none;font-size:17px;font-weight:900;font-family:var(--font);cursor:pointer;background:var(--green);color:#03170a;letter-spacing:-.2px}
.io-submit.in{background:var(--cyan);color:#001b24}
.io-submit:disabled{opacity:.5}
.io-submit small{display:block;font-size:12px;font-weight:700;opacity:.8;margin-top:2px}
.io-view{display:none;position:fixed;inset:0;background:rgba(0,0,0,.94);z-index:995;align-items:center;justify-content:center;padding:10px}
.io-view.show{display:flex}
.io-view img{max-width:100%;max-height:100%;border-radius:8px}
.io-view button{position:absolute;top:max(14px,env(safe-area-inset-top));right:14px;background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:50%;width:40px;height:40px;font-size:18px;cursor:pointer}
.io-view a{position:absolute;bottom:max(20px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);color:#fff;background:rgba(255,255,255,.15);padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none}
.io-day-hd .io-shb{margin-left:auto;background:rgba(90,200,250,.12);color:var(--blue);border:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:800;font-family:var(--font);cursor:pointer;white-space:nowrap}
.io-day-hd span.cnt{font-size:11px;color:var(--dim);font-weight:700}
.io-acts{display:flex;flex-direction:column;gap:6px;align-self:flex-start;flex-shrink:0}
/* 공유 화면 (스크린샷·텍스트 복사용) */
.io-sh{display:none;position:fixed;inset:0;background:var(--bg);z-index:992;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
.io-sh.show{display:block}
.io-sh-in{max-width:520px;margin:0 auto;padding:0 14px 110px}
.io-sh-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px 0 12px;padding-top:max(16px,env(safe-area-inset-top))}
.io-sh-t{font-size:19px;font-weight:900;letter-spacing:-.4px}
.io-sh-s{font-size:13px;color:var(--sub);font-weight:600;margin-top:3px}
.io-sh-hd button{background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:7px 12px;color:var(--text);font-size:13px;font-family:var(--font);cursor:pointer;flex-shrink:0}
.io-sh-hint{display:flex;align-items:center;justify-content:space-between;background:rgba(255,214,10,.1);color:var(--yellow);border-radius:10px;padding:9px 12px;font-size:12px;font-weight:700;margin-bottom:10px}
.io-sh-hint span{cursor:pointer;text-decoration:underline}
.io-sh-rec{background:var(--card);border-radius:14px;padding:12px 14px;margin-bottom:10px;border-left:4px solid var(--green)}
.io-sh-rec.in{border-left-color:var(--cyan)}
.io-sh-body{min-width:0}
.io-sh-l1{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.io-sh-l1 b{font-size:14px;font-weight:900}
.io-sh-l1 .v{font-size:13px;font-weight:700;color:var(--text)}
.io-sh-l1 .hide{margin-left:auto;background:none;border:none;color:var(--dim);font-size:11px;font-family:var(--font);cursor:pointer;padding:2px 4px}
.io-sh-line{font-size:13px;line-height:1.45;padding:5px 0;border-top:1px solid var(--border)}
.io-sh-line .io-sh-pr{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.io-sh-line b{font-weight:900}
.io-sh-line span{color:var(--sub);display:block;font-size:12px;margin-top:1px}
.io-sh-line em{font-style:normal;font-weight:900;color:var(--green);white-space:nowrap;font-size:14px}
.io-sh-line em small{font-weight:800;color:var(--purple);font-size:11px;margin-left:4px}
.io-sh-memo{font-size:12px;color:var(--dim);margin-top:4px}
.io-sh-th{width:100%;height:150px;margin-top:10px;border-radius:10px;background:var(--card2);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--dim);text-align:center;line-height:1.4;cursor:pointer}
.io-sh-th img{width:100%;height:100%;object-fit:cover;object-position:center bottom;display:block}
.io-sh-tot{background:var(--card2);border-radius:12px;padding:10px 14px;font-size:12px;line-height:1.7;color:var(--sub);margin-top:4px}
.io-sh-tot b{color:var(--text);font-weight:800}
.io-sh-tot .t{font-weight:800;margin-right:4px}
.io-sh-tot .t.out{color:var(--green)}.io-sh-tot .t.in{color:var(--cyan)}
.io-sh-note{font-size:11px;color:var(--dim);text-align:center;margin-top:14px;line-height:1.6}
.io-sh-ft{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;padding-bottom:max(14px,env(safe-area-inset-bottom));z-index:6;pointer-events:none}
.io-sh-ft-in{max-width:520px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:10px}
.io-sh-btn{pointer-events:auto;padding:11px 26px;border-radius:22px;border:1px solid rgba(255,255,255,.12);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer;background:rgba(40,42,54,.92);color:var(--text);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.io-sh-btn.lnk{background:transparent;border-color:transparent;color:var(--dim);font-size:12px;font-weight:700;padding:11px 8px}
`;

/* ---------- 상태 ---------- */
let LOGS={};         // Firebase 최근 기록 {id:rec}
let F=null;          // 작성 중 폼
let P=null;          // 촬영 사진 {img, at(Date), taken(ms), name}
let busy=false;      // 제출 진행 중
let pingOk=+(localStorage.getItem('io_ping_ok')||0);
let lastErr='';
let flushing=false;
let SH={open:false,date:'',ids:null,hidden:{}}; // 공유 화면 상태

/* ---------- 껍데기 ---------- */
function ensureShell(){
  if($('p-io'))return;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  const pane=document.createElement('div');pane.className='pane';pane.id='p-io';pane.innerHTML='<div id="ioView"></div>';
  const panes=document.querySelectorAll('.pane');const last=panes[panes.length-1];
  if(last&&last.parentNode)last.parentNode.insertBefore(pane,last.nextSibling);else document.body.appendChild(pane);
  const nav=document.querySelector('.nav');
  if(nav){const a=document.createElement('a');a.href='#';a.id='ioNavBtn';a.setAttribute('onclick','ioShow();return false');a.innerHTML='<span>📦</span>입출고';nav.appendChild(a)}
  const ov=document.createElement('div');ov.className='io-ov';ov.id='ioOv';
  ov.innerHTML=`<div class="io-ov-in">
    <div class="io-ov-hd"><b id="ioOvTitle">출고 기록</b><button type="button" onclick="ioClose()">✕ 닫기</button></div>
    <div id="ioForm"></div>
  </div>
  <div class="io-foot"><div class="io-foot-in"><button type="button" class="io-submit" id="ioSubmitBtn" onclick="ioSubmit()">출고 기록 제출</button></div></div>
  <input type="file" id="ioFile" accept="image/*" capture="environment" style="display:none" onchange="ioPhotoChange(this)">`;
  document.body.appendChild(ov);
  const sh=document.createElement('div');sh.className='io-sh';sh.id='ioShare';
  sh.innerHTML='<div class="io-sh-in" id="ioShareIn"></div><div class="io-sh-ft"><div class="io-sh-ft-in"><button type="button" class="io-sh-btn" onclick="ioShareClose()">✕ 닫기</button><button type="button" class="io-sh-btn lnk" id="ioShareCopyBtn" onclick="ioShareCopy()">텍스트로 복사</button></div></div>';
  document.body.appendChild(sh);
  const vw=document.createElement('div');vw.className='io-view';vw.id='ioViewer';vw.setAttribute('onclick','if(event.target===this)ioViewClose()');
  vw.innerHTML='<button type="button" onclick="ioViewClose()">✕</button><img id="ioViewImg" alt=""><a id="ioViewLink" href="#" target="_blank" rel="noopener" style="display:none">드라이브에서 열기</a>';
  document.body.appendChild(vw);
}

function ioShow(){
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('on'));
  $('ioNavBtn').classList.add('on');$('p-io').classList.add('on');
  try{currentTab='io'}catch(e){}
  window.scrollTo(0,0);renderList();
  if(obGet().length)ioFlush(false);
}

/* ---------- 목록 ---------- */
function itemQty(it,k){ // 장수
  const p=prod(it.product);if(!p)return 0;
  const a=it[k]||[0,0];return num(a[0])*(k==='t'?p.per10:p.per)+num(a[1]);
}
function itemTotal(it){return itemQty(it,'c')+itemQty(it,'s')+itemQty(it,'k')}
function fmtBoxEa(a){const b=num((a||[])[0]),e=num((a||[])[1]);if(!b&&!e)return '';return (b?b+'박스':'')+(b&&e?'+':'')+(e?e+'장':'')}
function itemLine(it){ // 저장된 기록(items 평탄화)용
  const parts=[];
  [['센터',it.cBox,it.cEa,it.cQty],['사이드',it.sBox,it.sEa,it.sQty],['코너',it.kBox,it.kEa,it.kQty]].forEach(x=>{const s=fmtBoxEa([x[1],x[2]]);if(s)parts.push(x[0]+' '+s)});
  let s='<b>'+esc(it.product)+'</b> <span class="q">'+esc(parts.join(' · '))+'</span>'+(it.total?' = <b>'+it.total+'장</b>':'');
  const t=fmtBoxEa([it.tBox,it.tEa]);if(t)s+='<span class="q"> · 10T '+esc(t)+' = '+(it.tQty||0)+'장</span>';
  return s;
}
function thumbUrl(id,w){return 'https://drive.google.com/thumbnail?id='+id+'&sz=w'+(w||400)}
function viewUrl(id){return 'https://drive.google.com/file/d/'+id+'/view'}
function canVoid(r){if(admin())return true;return r.dev===devId()&&(Date.now()-(r.ts||0))<OWN_MIN*60000}

function allRecords(){ // Firebase 기록 + 이 폰의 전송 대기 기록 합치기
  const ob=obGet();const local={};ob.forEach(e=>{if(e.kind==='log'&&e.rec)local[e.rec.id]={photo:e.payload&&e.payload.photo,rec:e.rec,tries:e.tries||0}});
  const all={...LOGS};Object.keys(local).forEach(id=>{if(!all[id])all[id]=local[id].rec});
  return {all,local,ob};
}
function renderList(){
  const v=$('ioView');if(!v)return;
  const {all,local,ob}=allRecords();
  const list=Object.values(all).filter(r=>r&&r.date).sort((a,b)=>(b.ts||0)-(a.ts||0));
  if(SH.open)renderShare();
  let h=`<div class="io-hd"><div><h2>📦 입·출고 기록</h2><p>차에 싣거나 창고로 내린 자재를 사진과 함께 남겨요.<br>촬영 시각이 사진에 찍히고, 시트에 자동 기록돼요.</p></div></div>
  <div class="io-start">
    <button type="button" class="out" onclick="ioOpen('out')"><b>${TYPE.out.ico} 출고</b><small>${TYPE.out.sub} · 실은 만큼</small></button>
    <button type="button" class="in" onclick="ioOpen('in')"><b>${TYPE.in.ico} 입고</b><small>${TYPE.in.sub} · 내린 만큼</small></button>
  </div>`;
  if(ob.length){
    const stuck=ob.some(e=>(e.tries||0)>=8);
    h+=`<div class="io-status ${stuck||lastErr?'err':'wait'}"><span>📤 전송 대기 ${ob.length}건${lastErr?' · '+esc(lastErr):''}</span><button type="button" onclick="ioFlush(true)">${flushing?'전송 중…':'지금 보내기'}</button></div>`;
  }
  if(!list.length){h+=`<div class="io-empty">아직 기록이 없어요.<br>위 버튼으로 첫 기록을 남겨보세요.</div>`;v.innerHTML=h;return}
  // 날짜별 그룹
  const days={};list.forEach(r=>{(days[r.date]=days[r.date]||[]).push(r)});
  const today=kstDate(0),yest=kstDate(-1);
  Object.keys(days).sort().reverse().forEach(d=>{
    const rs=days[d];const live=rs.filter(r=>r.status!=='void');
    const cnt={out:0,in:0};live.forEach(r=>cnt[r.type==='in'?'in':'out']++);
    const label=d===today?'오늘 '+fmtD(d):d===yest?'어제 '+fmtD(d):fmtD(d);
    h+=`<div class="io-day"><div class="io-day-hd"><b>${label}</b><span class="cnt">출고 ${cnt.out} · 입고 ${cnt.in}</span>${live.length?`<button type="button" class="io-shb" onclick="ioShare('${d}')">📤 공유</button>`:''}</div>`;
    // 합계
    const sum={out:{},in:{}};live.forEach(r=>{(r.items||[]).forEach(it=>{const s=sum[r.type==='in'?'in':'out'];s[it.product]=s[it.product]||{q:0,t:0};s[it.product].q+=num(it.total);s[it.product].t+=num(it.tQty)})});
    const sumLine=k=>{const keys=PRODUCTS.map(p=>p.k).filter(pk=>sum[k][pk]&&(sum[k][pk].q||sum[k][pk].t));if(!keys.length)return '';return `<div><span class="t ${k}">${TYPE[k].n} 합계</span> ${keys.map(pk=>'<b>'+esc(pk)+'</b> '+sum[k][pk].q+'장'+(sum[k][pk].t?' (10T '+sum[k][pk].t+')':'')).join(' · ')}</div>`};
    const sl=sumLine('out')+sumLine('in');if(sl)h+=`<div class="io-sum">${sl}</div>`;
    rs.forEach(r=>{
      const lp=local[r.id];const pending=!!lp||r.status==='pending';
      const isVoid=r.status==='void';
      let th;
      if(lp&&lp.photo)th=`<div class="io-th" onclick="ioViewLocal('${esc(r.id)}')"><img src="${lp.photo}" alt=""></div>`;
      else if(r.photoId)th=`<div class="io-th" onclick="ioView('${esc(r.photoId)}')"><img src="${thumbUrl(r.photoId,300)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='사진<br>불러오기 실패'"></div>`;
      else th=`<div class="io-th">사진<br>전송 중</div>`;
      const late=r.late?'<span class="io-tag late">지연 입력</span>':'';
      const gap=r.photoGap>=LATE_MIN?`<span class="io-tag late" title="사진 시각과 제출 시각 차이">사진 ${r.photoGap}분 전</span>`:'';
      h+=`<div class="io-card${isVoid?' void':''}">${th}<div class="io-body">
        <div class="io-l1"><span class="io-tag ${r.type==='in'?'in':'out'}">${TYPE[r.type==='in'?'in':'out'].n}</span><span class="tm">${esc(hm(r.at))}</span><span class="who">${esc(r.vehicle||'')}${r.worker?' · '+esc(r.worker):''}</span>${pending?'<span class="io-tag wait">전송 대기</span>':''}${late}${gap}${isVoid?'<span class="io-tag void">취소됨</span>':''}</div>
        ${(r.items||[]).map(it=>`<div class="io-item">${itemLine(it)}</div>`).join('')}
        ${r.note?`<div class="io-note">${esc(r.note)}</div>`:''}${isVoid&&r.voidReason?`<div class="io-note">취소 사유: ${esc(r.voidReason)}</div>`:''}
      </div>${isVoid?'':`<div class="io-acts"><button type="button" class="io-x" onclick="ioShare('${esc(r.date)}',['${esc(r.id)}'])">공유</button>${canVoid(r)?`<button type="button" class="io-x" onclick="ioVoid('${esc(r.id)}')">취소</button>`:''}</div>`}</div>`;
    });
    h+=`</div>`;
  });
  v.innerHTML=h;
}
function ioView(id){const im=$('ioViewImg');im.src=thumbUrl(id,1600);const a=$('ioViewLink');a.href=viewUrl(id);a.style.display='block';$('ioViewer').classList.add('show')}
function ioViewLocal(id){const e=obGet().find(x=>x.rec&&x.rec.id===id);if(!e||!e.payload||!e.payload.photo)return;$('ioViewImg').src=e.payload.photo;$('ioViewLink').style.display='none';$('ioViewer').classList.add('show')}
function ioViewClose(){$('ioViewer').classList.remove('show');$('ioViewImg').src=''}

/* ---------- 공유 화면 (스크린샷 · 카톡용 텍스트) ---------- */
function shareRecords(){
  const {all,local}=allRecords();
  let recs=Object.values(all).filter(r=>r&&r.date===SH.date&&r.status!=='void');
  if(SH.ids)recs=recs.filter(r=>SH.ids.includes(r.id));
  recs.sort((a,b)=>(a.ts||0)-(b.ts||0));
  return {recs,local};
}
function ioShare(date,ids){
  SH={open:true,date,ids:ids||null,hidden:{}};
  renderShare();$('ioShare').classList.add('show');$('ioShare').scrollTop=0;
}
function ioShareClose(){SH.open=false;$('ioShare').classList.remove('show')}
function ioShareHide(id){SH.hidden[id]=true;renderShare()}
function ioShareShowAll(){SH.hidden={};renderShare()}
function partsText(it){ // "센터 40 · 사이드 16 · 코너 2 · 10T 2"
  return [['센터',it.cQty],['사이드',it.sQty],['코너',it.kQty],['10T',it.tQty]].filter(x=>num(x[1])>0).map(x=>x[0]+' '+num(x[1])).join(' · ');
}
function sumByProduct(recs){ // {out:{product:{q,t}}, in:{...}}
  const sum={out:{},in:{}};
  recs.forEach(r=>{(r.items||[]).forEach(it=>{const s=sum[r.type==='in'?'in':'out'];s[it.product]=s[it.product]||{q:0,t:0};s[it.product].q+=num(it.total);s[it.product].t+=num(it.tQty)})});
  return sum;
}
function sumLineText(sum,k){
  const keys=PRODUCTS.map(p=>p.k).filter(pk=>sum[k][pk]&&(sum[k][pk].q||sum[k][pk].t));
  if(!keys.length)return '';
  return TYPE[k].n+' 합계 · '+keys.map(pk=>pk+' '+sum[k][pk].q+'장'+(sum[k][pk].t?'(10T '+sum[k][pk].t+')':'')).join(' · ');
}
function recText(r){
  const T=TYPE[r.type==='in'?'in':'out'];
  const lines=['['+T.n+'] '+fmtD(r.date)+' '+hm(r.at)+' · '+RN,'차량 '+(r.vehicle||'-')+(r.worker?' · '+r.worker:''),''];
  (r.items||[]).forEach((it,i)=>{
    lines.push((i+1)+'. '+it.product);
    [['센터',it.cQty],['사이드',it.sQty],['코너',it.kQty],['10T',it.tQty]].forEach(x=>{if(num(x[1])>0)lines.push(x[0]+' '+num(x[1])+'장')});
    lines.push('합계 '+num(it.total)+'장'+(num(it.tQty)?' · 10T '+num(it.tQty)+'장':''));
    lines.push('');
  });
  if(r.note)lines.push('메모: '+r.note);
  if(r.late)lines.push('※ 지연 입력');
  lines.push('사진 '+(r.photoId?viewUrl(r.photoId):'전송 중 (앱에서 확인)'));
  return lines.join('\n');
}
function shareText(){
  const {recs}=shareRecords();const shown=recs.filter(r=>!SH.hidden[r.id]);
  if(!shown.length)return '';
  let t=shown.map(recText).join('\n\n──────────\n\n');
  if(shown.length>1){const sum=sumByProduct(shown);const sl=[sumLineText(sum,'out'),sumLineText(sum,'in')].filter(Boolean);if(sl.length)t+='\n\n══════════\n'+fmtD(SH.date)+' '+sl.join('\n')}
  return t;
}
function renderShare(){
  const box=$('ioShareIn');if(!box||!SH.open)return;
  const {recs,local}=shareRecords();
  const shown=recs.filter(r=>!SH.hidden[r.id]);const hiddenN=recs.length-shown.length;
  let h=`<div class="io-sh-hd"><div><div class="io-sh-t">📦 입·출고 기록</div><div class="io-sh-s">돌봄매트 ${RN} · ${fmtD(SH.date)}</div></div></div>`;
  const ph=shown.length<=1?300:shown.length===2?170:120; // 기록 수에 따라 사진 높이 — 한 화면에 들어가게
  if(hiddenN)h+=`<div class="io-sh-hint"><span style="text-decoration:none;cursor:default">${hiddenN}건 숨김</span><span onclick="ioShareShowAll()">전체 보기</span></div>`;
  if(!shown.length){h+=`<div class="io-empty">공유할 기록이 없어요.</div>`;box.innerHTML=h;return}
  shown.forEach(r=>{
    const k=r.type==='in'?'in':'out';const lp=local[r.id];const pending=!!lp||r.status==='pending';
    let th;const st=`style="height:${ph}px"`;
    if(lp&&lp.photo)th=`<div class="io-sh-th" ${st} onclick="ioViewLocal('${esc(r.id)}')"><img src="${lp.photo}" alt=""></div>`;
    else if(r.photoId)th=`<div class="io-sh-th" ${st} onclick="ioView('${esc(r.photoId)}')"><img src="${thumbUrl(r.photoId,800)}" alt="" onerror="this.parentNode.innerHTML='사진<br>불러오기 실패'"></div>`;
    else th=`<div class="io-sh-th" ${st}>사진<br>전송 중</div>`;
    h+=`<div class="io-sh-rec ${k}"><div class="io-sh-body">
      <div class="io-sh-l1"><span class="io-tag ${k}">${TYPE[k].n}</span><b>${esc(hm(r.at))}</b><span class="v">${esc(r.vehicle||'')}${r.worker?' · '+esc(r.worker):''}</span>${pending?'<span class="io-tag wait">사진 전송 중</span>':''}${r.late?'<span class="io-tag late">지연 입력</span>':''}${recs.length>1?`<button type="button" class="hide" onclick="ioShareHide('${esc(r.id)}')">숨기기</button>`:''}</div>
      ${(r.items||[]).map(it=>`<div class="io-sh-line"><div class="io-sh-pr"><b>${esc(it.product)}</b><em>${num(it.total)}장${num(it.tQty)?`<small>+10T ${num(it.tQty)}</small>`:''}</em></div><span>${esc(partsText(it))}</span></div>`).join('')}
      ${r.note?`<div class="io-sh-memo">메모: ${esc(r.note)}</div>`:''}
    </div>${th}</div>`;
  });
  if(shown.length>1){const sum=sumByProduct(shown);const parts=['out','in'].map(k=>{const keys=PRODUCTS.map(p=>p.k).filter(pk=>sum[k][pk]&&(sum[k][pk].q||sum[k][pk].t));if(!keys.length)return '';return `<div><span class="t ${k}">${TYPE[k].n} 합계</span>${keys.map(pk=>'<b>'+esc(pk)+'</b> '+sum[k][pk].q+'장'+(sum[k][pk].t?' (10T '+sum[k][pk].t+')':'')).join(' · ')}</div>`}).filter(Boolean);if(parts.length)h+=`<div class="io-sh-tot">${parts.join('')}</div>`}
  h+=`<div class="io-sh-note">이 화면을 그대로 스크린샷해서 단톡방에 올려주세요.${recs.length>1?'<br>내 기록만 올리려면 다른 기록은 숨기기.':''}</div>`;
  box.innerHTML=h;
  const cb=$('ioShareCopyBtn');if(cb)cb.disabled=!shown.length;
}
function copyText(text,onOk){
  const fallback=()=>{const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0;font-size:16px';document.body.appendChild(ta);ta.focus();ta.select();try{ta.setSelectionRange(0,999999)}catch(e){}let ok=false;try{ok=document.execCommand('copy')}catch(e){}document.body.removeChild(ta);if(ok)onOk();else ioToast('복사가 안 돼요 · 스크린샷으로 올려주세요',true)};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(onOk).catch(fallback);else fallback();
}
function ioShareCopy(){
  const t=shareText();if(!t){ioToast('복사할 기록이 없어요',true);return}
  const {recs}=shareRecords();const anyPending=recs.some(r=>!SH.hidden[r.id]&&!r.photoId&&r.status!=='void');
  copyText(t,()=>ioToast(anyPending?'📋 복사됨 · 사진 링크는 전송 뒤 다시 복사하면 들어가요':'📋 복사됨 · 카톡에 붙여넣기'));
}

/* ---------- 작성 ---------- */
function newItem(){return {product:'',c:[0,0],s:[0,0],k:[0,0],t:[0,0]}}
function ioOpen(type){
  const vs=Object.keys(vehicles());
  const lastV=localStorage.getItem('io_last_vehicle')||'';
  const vehicle=vs.includes(lastV)?lastV:(vs.length===1?vs[0]:'');
  F={type:type==='in'?'in':'out',date:kstDate(0),dateEdit:false,vehicle,custom:false,worker:vehicle?(vehicles()[vehicle]||''):'',items:[newItem()],note:''};
  P=null;busy=false;
  renderForm();
  $('ioOv').classList.add('show');$('ioOv').scrollTop=0;
}
function ioClose(){
  if(busy)return;
  if(F&&(P||F.items.some(it=>it.product||itemTotal(it)||itemQty(it,'t')))&&!confirm('작성 중인 내용을 지우고 닫을까요?'))return;
  $('ioOv').classList.remove('show');F=null;P=null;$('ioFile').value='';
}
function ioType(t){F.type=t;renderForm();drawPreview()}
function renderForm(){
  if(!F)return;
  const T=TYPE[F.type];
  $('ioOvTitle').textContent=T.ico+' '+T.n+' 기록';
  const sb=$('ioSubmitBtn');sb.className='io-submit '+F.type;sb.innerHTML=T.n+' 기록 제출<small>'+T.sub+'</small>';sb.disabled=busy;
  const vs=vehicles();const plates=Object.keys(vs);
  const emps=employees();
  let h=`<div class="io-seg">
    <button type="button" class="out${F.type==='out'?' on':''}" onclick="ioType('out')">${TYPE.out.ico} 출고<small>${TYPE.out.sub}</small></button>
    <button type="button" class="in${F.type==='in'?' on':''}" onclick="ioType('in')">${TYPE.in.ico} 입고<small>${TYPE.in.sub}</small></button>
  </div>
  <div class="io-sec"><div class="io-lb">사진 <small>촬영 시각이 사진 아래에 찍혀요</small></div>
    <div class="io-photo${P?' has':''}" id="ioPhotoBox" onclick="ioPickPhoto()">${P?`<img id="ioPrev" alt=""><button type="button" class="re" onclick="event.stopPropagation();ioPickPhoto()">다시 촬영</button>`:`<div class="ph"><div class="i">📷</div><b>${F.type==='in'?'창고에 내린 자재':'차에 실은 자재'}를 촬영</b><small>박스와 낱장이 다 보이게 찍어주세요</small></div>`}</div>
  </div>
  <div class="io-sec"><div class="io-lb">날짜 <span class="lnk" onclick="ioDateToggle()">${F.dateEdit?'오늘로':'변경'}</span></div>
    <div class="io-date">${F.dateEdit?`<input type="date" id="ioDate" value="${F.date}" max="${kstDate(0)}" onchange="ioDateChange(this.value)">`:`<b>${F.date}<small>${dowOf(F.date)}요일${F.date===kstDate(0)?' · 오늘':''}</small></b>`}${F.date!==kstDate(0)?'<span class="io-tag late">지연 입력</span>':''}</div>
  </div>
  <div class="io-sec"><div class="io-lb">차량 <small>${plates.length?'':'차량·공정성 탭에 등록된 차량이 없어요'}</small></div>
    <div class="io-chips">${plates.map(p=>`<div class="io-chip${!F.custom&&F.vehicle===p?' on':''}" onclick="ioVehicle('${esc(p)}')">${esc(p)}<small>${esc(vs[p]||'미배정')}</small></div>`).join('')}<div class="io-chip dim${F.custom?' on':''}" onclick="ioVehicleCustom()">직접 입력</div></div>
    ${F.custom?`<input class="io-inp" id="ioVehicleIn" style="margin-top:8px" placeholder="차량번호" value="${esc(F.vehicle)}" oninput="ioVehicleType(this.value)">`:''}
  </div>
  <div class="io-sec"><div class="io-lb">담당 <small>차량을 고르면 사수가 자동으로 들어가요</small></div>
    <select class="io-sel" id="ioWorker" onchange="ioWorker(this.value)"><option value="">선택</option>${emps.map(n=>`<option value="${esc(n)}"${F.worker===n?' selected':''}>${esc(n)}</option>`).join('')}${F.worker&&!emps.includes(F.worker)?`<option value="${esc(F.worker)}" selected>${esc(F.worker)}</option>`:''}</select>
  </div>
  <div class="io-sec"><div class="io-lb">제품 <small>오전·오후 색상이 다르면 제품을 추가해요</small></div><div id="ioItems"></div>
    <button type="button" class="io-add" onclick="ioAddItem()">＋ 제품 추가<small>다른 색상·사이즈를 같이 실었을 때</small></button>
  </div>
  <div class="io-sec"><div class="io-lb">메모 <small>선택</small></div><input class="io-inp" id="ioNote" placeholder="예) 오후 현장용 추가 적재" value="${esc(F.note)}" oninput="ioNote(this.value)"></div>`;
  $('ioForm').innerHTML=h;
  renderItems();
  if(P)drawPreview();
}
function renderItems(){
  const box=$('ioItems');if(!box||!F)return;
  box.innerHTML=F.items.map((it,i)=>{
    const p=prod(it.product);
    const groups=[...new Set(PRODUCTS.map(x=>x.g))];
    const chips=groups.map(g=>`<div class="io-pg">${esc(g)}</div><div class="io-pchips">${PRODUCTS.filter(x=>x.g===g).map(x=>`<div class="io-pchip ${x.cls}${it.product===x.k?' on':''}" onclick="ioProduct(${i},'${esc(x.k)}')">${esc(x.c)}</div>`).join('')}</div>`).join('');
    const rows=PART.map(pt=>{const a=it[pt.k];const q=itemQty(it,pt.k);const per=p?(pt.k==='t'?p.per10:p.per):0;
      return `<div class="io-row"><span class="n">${pt.n}</span>
        <span class="u"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" class="${num(a[0])?'':'z'}" value="${num(a[0])}" onfocus="ioFocus(this)" onblur="ioBlur(this)" oninput="ioNum(${i},'${pt.k}',0,this)"><i>박스</i></span>
        <span class="u"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" class="${num(a[1])?'':'z'}" value="${num(a[1])}" onfocus="ioFocus(this)" onblur="ioBlur(this)" oninput="ioNum(${i},'${pt.k}',1,this)"><i>낱장</i></span>
        <span class="q${pt.k==='t'?' t':''}${q?'':' z'}" id="ioq_${i}_${pt.k}" title="${per?'박스당 '+per+'장':''}">${p?q+'장':'–'}</span></div>`}).join('');
    return `<div class="io-pc" id="ioPc_${i}"><div class="io-pc-hd"><b>제품 ${i+1}${p?' · '+esc(p.k):''}</b>${F.items.length>1?`<button type="button" onclick="ioDelItem(${i})">삭제</button>`:''}</div>
      ${chips}
      <div class="io-grid"><div class="io-ghd"><span></span><span>박스</span><span>낱장</span><span>= 장수</span></div>${rows}</div>
      <div class="io-pc-ft"><span>${p?'박스당 '+p.per+'장 · 10T '+p.per10+'장':'색상을 먼저 골라주세요'}</span><span>합계 <b id="iot_${i}">${itemTotal(it)}</b>장${itemQty(it,'t')?` <span style="color:var(--purple)">+10T ${itemQty(it,'t')}장</span>`:''}</span></div></div>`;
  }).join('');
}
function updateItemTotals(i){
  const it=F.items[i];const p=prod(it.product);
  PART.forEach(pt=>{const el=$('ioq_'+i+'_'+pt.k);if(!el)return;const q=itemQty(it,pt.k);el.textContent=p?q+'장':'–';el.classList.toggle('z',!q)});
  const t=$('iot_'+i);if(t){t.textContent=itemTotal(it);const ft=t.parentNode;const t10=itemQty(it,'t');const extra=ft.querySelector('span');if(extra)extra.remove();if(t10){const s=document.createElement('span');s.style.color='var(--purple)';s.textContent=' +10T '+t10+'장';ft.appendChild(s)}}
}
function ioNum(i,k,idx,el){const it=F.items[i];if(!it)return;const v=num(el.value);const clean=el.value.replace(/[^0-9]/g,'');if(el.value!==clean)el.value=clean;it[k][idx]=v;updateItemTotals(i);el.classList.toggle('z',!v)}
function ioFocus(el){if(el.value==='0'){el.value='';el.classList.add('z')}try{el.select()}catch(e){}}
function ioBlur(el){if(el.value==='')el.value='0';el.classList.toggle('z',!num(el.value))}
function ioProduct(i,k){F.items[i].product=k;renderItems()}
function ioAddItem(){F.items.push(newItem());renderItems();const el=$('ioPc_'+(F.items.length-1));if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
function ioDelItem(i){if(F.items.length<=1)return;const it=F.items[i];if((it.product||itemTotal(it)||itemQty(it,'t'))&&!confirm('제품 '+(i+1)+'을 지울까요?'))return;F.items.splice(i,1);renderItems()}
function ioNote(v){F.note=v.slice(0,200)}
function ioDateToggle(){if(F.dateEdit){F.dateEdit=false;F.date=kstDate(0)}else F.dateEdit=true;renderForm()}
function ioDateChange(v){if(/^\d{4}-\d{2}-\d{2}$/.test(v)&&v<=kstDate(0))F.date=v;renderForm()}
function ioVehicle(p){F.custom=false;F.vehicle=p;const d=vehicles()[p];if(d)F.worker=d;renderForm();drawPreview()}
function ioVehicleCustom(){F.custom=true;F.vehicle='';renderForm();const el=$('ioVehicleIn');if(el)el.focus()}
function ioVehicleType(v){F.vehicle=v.trim().slice(0,20);drawPreview()}
function ioWorker(v){F.worker=v;drawPreview()}

/* ---------- 사진 ---------- */
function ioPickPhoto(){if(busy)return;const f=$('ioFile');f.value='';f.click()}
function ioPhotoChange(inp){
  const file=inp.files&&inp.files[0];if(!file)return;
  const box=$('ioPhotoBox');if(box)box.insertAdjacentHTML('beforeend','<div class="busy" id="ioPhotoBusy">사진 준비 중…</div>');
  const url=URL.createObjectURL(file);const img=new Image();
  img.onload=()=>{
    P={img,at:new Date(),taken:file.lastModified||Date.now(),name:file.name||''};
    URL.revokeObjectURL(url);
    renderForm();
  };
  img.onerror=()=>{URL.revokeObjectURL(url);const b=$('ioPhotoBusy');if(b)b.remove();ioToast('사진을 읽지 못했어요. 다시 촬영해주세요',true)};
  img.src=url;
}
function stampLines(){
  const k=kst(P.at);
  const l1=kstDate(0,P.at)+' ('+DOWK[k.getDay()]+') '+pad(k.getHours())+':'+pad(k.getMinutes())+':'+pad(k.getSeconds());
  const l2=[RN,F.vehicle||'차량 미선택',F.worker||'',TYPE[F.type].n+' ('+TYPE[F.type].sub.replace(/ /g,'')+')'].filter(Boolean).join('  ·  ');
  return [l1,l2];
}
function stampCanvas(maxPx){
  const img=P.img;const iw=img.naturalWidth||img.width,ih=img.naturalHeight||img.height;
  const sc=Math.min(1,maxPx/Math.max(iw,ih));const w=Math.max(1,Math.round(iw*sc)),h=Math.max(1,Math.round(ih*sc));
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.drawImage(img,0,0,w,h);
  const [l1,l2]=stampLines();
  const fs=Math.max(16,Math.round(Math.min(w,h)*0.05));const fs2=Math.round(fs*0.66);const pd=Math.round(fs*0.55);
  const band=Math.round(fs+fs2+pd*2.4);
  x.fillStyle='rgba(0,0,0,.66)';x.fillRect(0,h-band,w,band);
  x.fillStyle='#FF453A';x.fillRect(0,h-band,Math.round(fs*0.35),band);
  x.textBaseline='alphabetic';x.fillStyle='#fff';
  x.font='800 '+fs+'px "Noto Sans KR","Apple SD Gothic Neo",sans-serif';x.fillText(l1,pd+Math.round(fs*0.35),h-band+pd+fs*0.92);
  x.font='600 '+fs2+'px "Noto Sans KR","Apple SD Gothic Neo",sans-serif';x.fillStyle='rgba(255,255,255,.9)';x.fillText(l2,pd+Math.round(fs*0.35),h-pd*0.9);
  x.font='700 '+fs2+'px "Noto Sans KR","Apple SD Gothic Neo",sans-serif';x.fillStyle='rgba(255,255,255,.75)';x.textAlign='right';x.fillText('돌봄매트 입출고',w-pd,h-band+pd+fs*0.92);x.textAlign='left';
  return c;
}
let _pv=null;
function drawPreview(){
  if(!P||!$('ioPrev'))return;
  clearTimeout(_pv);_pv=setTimeout(()=>{try{const c=stampCanvas(900);const el=$('ioPrev');if(el)el.src=c.toDataURL('image/jpeg',0.8)}catch(e){console.warn('[io] preview',e)}const b=$('ioPhotoBusy');if(b)b.remove()},30);
}

/* ---------- 제출 ---------- */
function flatItem(it){
  const p=prod(it.product);const o={product:it.product};
  [['c','c'],['s','s'],['k','k'],['t','t']].forEach(([k])=>{o[k+'Box']=num(it[k][0]);o[k+'Ea']=num(it[k][1]);o[k+'Qty']=itemQty(it,k)});
  o.per=p?p.per:0;o.per10=p?p.per10:0;o.total=itemTotal(it);return o;
}
async function ioSubmit(){
  if(!F||busy)return;
  if(!P){ioToast('사진을 먼저 촬영해주세요',true);$('ioOv').scrollTop=0;return}
  if(!F.vehicle){ioToast('차량을 선택해주세요',true);return}
  const items=[];
  for(let i=0;i<F.items.length;i++){const it=F.items[i];const any=itemTotal(it)||itemQty(it,'t')||PART.some(pt=>num(it[pt.k][0])||num(it[pt.k][1]));
    if(!it.product&&!any)continue;
    if(!it.product){ioToast('제품 '+(i+1)+'의 색상을 골라주세요',true);return}
    if(!any){ioToast('제품 '+(i+1)+'의 수량이 비어 있어요',true);return}
    items.push(flatItem(it))}
  if(!items.length){ioToast('제품과 수량을 입력해주세요',true);return}
  busy=true;$('ioSubmitBtn').disabled=true;$('ioSubmitBtn').innerHTML='저장 중…';
  try{
    const now=new Date();const ts=now.getTime();
    const id='io_'+ts+'_'+Math.random().toString(36).slice(2,7);
    const photoGap=Math.max(0,Math.round((P.at.getTime()-P.taken)/60000));
    const rec={id,region:RN,rk:RK,type:F.type,date:F.date,at:kstDT(now),ts,vehicle:F.vehicle,worker:F.worker||'',items,note:F.note||'',late:F.date!==kstDate(0),photoAt:kstDT(P.at),photoGap,dev:devId(),ver:IO_VER,status:'pending'};
    const photo=stampCanvas(MAX_PX).toDataURL('image/jpeg',JPG_Q);
    const photoName=F.date+'_'+hm(rec.at).replace(':','')+'_'+RN+'_'+String(F.vehicle).replace(/[\\/:*?"<>|\s]/g,'')+'_'+TYPE[F.type].n+'_'+id+'.jpg';
    const payload={action:'ioLog',id,region:RN,type:F.type,date:F.date,at:rec.at,vehicle:F.vehicle,worker:rec.worker,items,note:rec.note,late:rec.late,photoAt:rec.photoAt,photoGap,dev:rec.dev,photo,photoName};
    if(!obAdd({kind:'log',id,rec,payload,tries:0,ts})){busy=false;renderForm();return}
    try{db.ref(NODE+'/'+id).set(rec)}catch(e){console.warn('[io] fb set',e)}
    localStorage.setItem('io_last_vehicle',F.vehicle);
    busy=false;F=null;P=null;$('ioFile').value='';$('ioOv').classList.remove('show');
    ioToast('✅ '+TYPE[rec.type].n+' 기록 저장 · 사진 전송 중');
    renderList();ioFlush(false);
    ioShare(rec.date,[rec.id]); // 저장 직후 공유 화면 — 스크린샷 또는 텍스트 복사해서 단톡방에
  }catch(e){console.warn('[io] submit',e);busy=false;renderForm();ioToast('저장 실패: '+(e.message||e),true)}
}
function ioVoid(id){
  const r=LOGS[id]||(obGet().find(e=>e.rec&&e.rec.id===id)||{}).rec;if(!r)return;
  if(!canVoid(r)){ioToast('본인 기록은 '+OWN_MIN+'분 안에만, 그 뒤엔 당번 모드에서 취소할 수 있어요',true);return}
  const reason=prompt('취소 사유를 적어주세요 (예: 수량 잘못 입력 → 다시 기록)');if(reason===null)return;
  const upd={status:'void',voidReason:(reason||'').trim().slice(0,100),voidAt:kstDT(new Date()),voidBy:admin()?'당번':'본인'};
  // 아직 전송 대기 중이면 서버로 안 보내고 그냥 삭제
  const ob=obGet();const idx=ob.findIndex(e=>e.kind==='log'&&e.rec&&e.rec.id===id);
  if(idx>=0){ob.splice(idx,1);obSet(ob);try{db.ref(NODE+'/'+id).remove()}catch(e){}ioToast('기록을 지웠어요');renderList();return}
  try{db.ref(NODE+'/'+id).update(upd)}catch(e){}
  obAdd({kind:'void',id:'void_'+id,payload:{action:'ioVoid',id,reason:upd.voidReason,by:upd.voidBy},tries:0,ts:Date.now()});
  ioToast('취소 처리했어요');renderList();ioFlush(false);
}

/* ---------- 전송 대기함(outbox) ---------- */
function obGet(){try{const a=JSON.parse(localStorage.getItem('io_outbox')||'[]');return Array.isArray(a)?a:[]}catch(e){return []}}
function obSet(a){try{localStorage.setItem('io_outbox',JSON.stringify(a));return true}catch(e){return false}}
function obAdd(e){const a=obGet();a.push(e);if(obSet(a))return true;ioToast('폰 저장 공간이 부족해요. 대기 중인 기록을 먼저 전송해주세요',true);return false}
function obRemove(id){const a=obGet().filter(e=>e.id!==id);obSet(a)}
async function ping(){
  if(Date.now()-pingOk<12*3600e3)return true;
  const u=apiUrl();if(!u)return false;
  try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),20000);
    const r=await fetch(u+'?type=ioPing&_='+Date.now(),{signal:ctl.signal});clearTimeout(t);const txt=await r.text();
    if(/"io"\s*:\s*true/.test(txt)){pingOk=Date.now();localStorage.setItem('io_ping_ok',String(pingOk));return true}
  }catch(e){}
  return false;
}
async function post(payload){
  const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),90000);
  try{const r=await fetch(apiUrl(),{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(payload),signal:ctl.signal});const txt=await r.text();
    try{return JSON.parse(txt)}catch(e){return {ok:false,error:'응답 형식 오류',_txt:txt.slice(0,120)}}}
  finally{clearTimeout(t)}
}
async function ioFlush(manual){
  if(flushing)return;const ob=obGet();if(!ob.length){lastErr='';renderList();return}
  if(!navigator.onLine){lastErr='오프라인';if(manual)ioToast('인터넷 연결 후 다시 시도해주세요',true);renderList();return}
  flushing=true;renderList();
  try{
    if(!(await ping())){lastErr='서버 준비 중(Apps Script 배포 확인)';if(manual)ioToast(lastErr,true);return}
    lastErr='';
    for(const e of obGet()){
      let res;try{res=await post(e.payload)}catch(err){lastErr='네트워크 오류';break}
      if(res&&res.ok){
        if(e.kind==='log'){const rec={...e.rec,status:'ok',photoId:res.photoId||'',photoUrl:res.photoId?viewUrl(res.photoId):'',sheetAt:kstDT(new Date())};
          try{await db.ref(NODE+'/'+rec.id).set(rec)}catch(err){console.warn('[io] fb',err)}}
        obRemove(e.id);renderList();
      }else{
        const a=obGet();const x=a.find(y=>y.id===e.id);if(x){x.tries=(x.tries||0)+1;x.err=res&&res.error||'';obSet(a)}
        lastErr='전송 실패: '+(res&&res.error||'알 수 없음');console.warn('[io] fail',res);
        if(res&&res._txt)console.warn('[io] 응답:',res._txt);
      }
    }
    if(!obGet().length){ioToast('📤 전송 완료')}
  }finally{flushing=false;renderList()}
}

/* ---------- 시작 ---------- */
function init(){
  ensureShell();
  try{db.ref(NODE).orderByChild('date').startAt(kstDate(-DAYS)).limitToLast(300).on('value',snap=>{const o={};snap.forEach(ch=>{o[ch.key]=ch.val()});LOGS=o;renderList()})}
  catch(e){console.warn('[io] fb listen',e);renderList()}
  window.addEventListener('online',()=>ioFlush(false));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&obGet().length)ioFlush(false)});
  setInterval(()=>{if(obGet().length&&!flushing)ioFlush(false)},90000);
  if(obGet().length)setTimeout(()=>ioFlush(false),1500);
}
Object.assign(window,{ioShare,ioShareClose,ioShareHide,ioShareShowAll,ioShareCopy,ioShow,ioOpen,ioClose,ioType,ioPickPhoto,ioPhotoChange,ioDateToggle,ioDateChange,ioVehicle,ioVehicleCustom,ioVehicleType,ioWorker,ioProduct,ioNum,ioFocus,ioBlur,ioAddItem,ioDelItem,ioNote,ioSubmit,ioVoid,ioFlush,ioView,ioViewLocal,ioViewClose});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
