/* iolog.js — 돌봄매트 스케줄러 📦 입출고 탭 (부산·경기 공용)
   차에 실은(출고) / 창고로 내린(입고) 자재를 시각 스탬프 사진과 함께 기록
   저장: Apps Script IoLog.gs(입출고기록 시트 + 드라이브 '입출고사진' 폴더) ← 원본, Firebase io_logs/{bs|gg} ← 앱 실시간 목록
   로드: scheduler.html / scheduler-gg.html 맨 아래 guide.js 다음 <script src="./iolog.js?v=..."> (코드 수정 시 v 값도 변경)
   v11 (2026-09-17k) 별도 📦 탭을 없애고 🚗 차량 탭(p-fair) 맨 위에 붙임 — 하단 탭 5개. 차량 탭을 열면(sw('fair')) 갱신·첫 도움말·재전송.
     p-fair가 없는 페이지에서는 예전처럼 별도 탭을 만듦

   v2 (2026-09-17)
   · 입력 단위를 박스+낱장 → 장(枚)으로 통일 (재고조사와 동일). 박스째면 [+박스] 버튼으로 12/4/6장(10T 24/8장)씩 더함.
     시트로 보내는 형식(cBox/cEa/cQty…)은 그대로 — 장수를 박스+낱장으로 나눠서 채우므로 IoLog.gs 수정 불필요
   · 🚚 차량별 매트 현황: 지난 실사(Firebase inventory) + 출고 − 입고 − 시공보고 판매갯수(스케줄 J.sold) = 차에 있어야 할 장수,
     실사가 2번 이상이면 직전 구간 실사 vs 예상 차이(팀별 로스)까지 표시. 10T도 같은 값에 받으므로 판매갯수에 포함 → 전부 한 묶음으로 계산
   · 첫 사용 시 1회 도움말(? 버튼으로 다시 열람), 상단 설명 문단 제거
   v3 (2026-09-17c) 대장 피드백 반영: 버튼 부제·[+박스]·'왜 하나요' 제거(장수만 입력), 제출 후 공유 화면은 그날 전체를 차량별로,
     목록도 오늘 먼저·차량별 묶음·지난 날은 접힘, 차량별 현황은 한 줄(누르면 상세), 시공→차량 매칭에 사수 폴백
   v5 (2026-09-17e) 목적 재정의(대장): 차에 싣고 나가서 판 만큼 빼고 나머지를 거짓 없이 가져왔는지 → 하루 단위 대조
     · 차량 카드 = 오늘 [출고 − 입고 − 시공보고 판매갯수] 판정(딱 맞음 / +N장 안 돌아옴 / 차 재고 사용 / 미보고 / 입고 전), 직원 폰은 내 차량(마지막 기록 차량)만, 당번 모드는 전 차량
     · 실사 구간 누적(있어야 할 장수)은 펼쳤을 때만. 날짜 묶음·공유 화면의 차량 머리에도 그날 대조 줄. 공유 화면 사진 확대, 제품 줄 두 줄
   v6 (2026-09-17f) 대조를 제품별로도 — 22T 싣고 17T 내리면 총합은 맞아도 '제품 불일치'로 잡힘 (시공 제품은 스케줄 제품 칸 코드로 매칭). 취소된 기록은 접어서 표시
   v7 (2026-09-17g) 안 맞는 날 사유 입력 — 판정이 안 돌아옴/차 재고 사용/제품 불일치면 [사유] 버튼, 선택지+메모를 Firebase io_recon/{bs|gg}/{날짜}/{차량}에 저장,
     카드·그날 기록·공유 스크린샷·텍스트 복사에 "사유: …"로 표시 (시트에는 아직 안 감 — IoLog.gs에 ioReason 액션 추가 필요)
   v8 (2026-09-17h) 작업일 기준 — 출고·입고가 저녁에 사무실에서 한 번에 이뤄지므로(내린 것 입고 + 내일 것 출고) 기록마다 '작업일(wdate)'을 붙임.
     출고 기본값: 15시 이후면 내일(일요일 건너뜀), 입고 기본값: 10시 전이면 어제. 목록·대조·공유 화면은 전부 작업일로 묶고,
     오늘 대조 = 작업일이 오늘인 출고 − 작업일이 오늘인 입고 − 오늘 시공보고. 옛 기록(wdate 없음)은 기록 날짜를 작업일로 봄
   v9 (2026-09-17i) 작업일 선택 UI 제거 — 직원은 출고/입고만 누르고, 작업일은 시각으로 자동(15시 이후 출고=내일, 10시 전 입고=어제).
     자동값이 오늘이 아닐 때만 한 줄 안내, 맨 아래 '지연 입력' 링크로만 날짜 변경. 사유는 Apps Script(ioReason)로도 전송 → '입출고사유' 시트
   v10 (2026-09-17j) 🔥 긴급 수정 — 실사 불러오는 중에 renderList가 두 번 불리면(io_logs·io_recon 콜백) loadInventory가 '이미 끝난 약속'을 돌려줘
     renderList→loadInventory→renderList… 마이크로태스크 무한 루프 → 스케줄러 전체가 멈춤(클릭 불가·시트 로딩 정지). 같은 진행 중 약속을 돌려주고
     한 번만 대기하도록 고침 + renderList 과다 호출 차단기 추가 */
(function(){
'use strict';
const IO_VER='2026.09.17k';
const RK=/scheduler-gg/i.test(location.pathname)?'gg':'bs';
const RN=RK==='gg'?'경기':'부산';
const NODE='io_logs/'+RK;
const OWN_MIN=30;         // 본인 기록 취소 가능 시간(분) — 지나면 당번 모드에서만
const DAYS=14;            // Firebase에서 불러오는 기록 기간(일) — 차량별 현황 계산용 (실사 주기 7~10일)
const LIST_DAYS=7;        // 목록에 펼쳐 보이는 기간(일)
const MAX_PX=1280;        // 업로드 사진 긴 변(px)
const JPG_Q=0.76;
const LATE_MIN=30;        // 사진 시각과 제출 시각 차이 경고(분)

// 재고표 순서. per=박스당 장수, per10=10T 박스당 장수. pid/col = 재고조사(Firebase inventory) 키 매칭용
const PRODUCTS=[
  {k:'500 모던',    g:'500매트', c:'모던',   per:12, per10:24, cls:'modern', pid:'500',     col:'모던'},
  {k:'500 마블',    g:'500매트', c:'마블',   per:12, per10:24, cls:'marble', pid:'500',     col:'마블'},
  {k:'500 코튼',    g:'500매트', c:'코튼',   per:12, per10:24, cls:'cotton', pid:'500',     col:'코튼'},
  {k:'1M 22T 모던', g:'1M 매트', c:'22T 모던',   per:4,  per10:8,  cls:'modern', pid:'1000_22', col:'모던'},
  {k:'1M 22T 베이지',g:'1M 매트',c:'22T 베이지', per:4,  per10:8,  cls:'beige',  pid:'1000_22', col:'베이지'},
  {k:'1M 17T 모던', g:'1M 매트', c:'17T 모던',   per:6,  per10:8,  cls:'modern', pid:'1000_17', col:'모던'},
  {k:'1M 17T 베이지',g:'1M 매트',c:'17T 베이지', per:6,  per10:8,  cls:'beige',  pid:'1000_17', col:'베이지'}
];
const PART=[{k:'c',n:'센터'},{k:'s',n:'사이드'},{k:'k',n:'코너'},{k:'t',n:'10T'}];
const REASONS=['현장 절단·파손','고객 무상 추가','시공보고 수정 필요','입력 실수','차에 남김','기타'];
const TYPE={out:{n:'출고',sub:'창고 → 차',ico:'🚚'},in:{n:'입고',sub:'차 → 창고',ico:'↩️'}}; // sub는 사진 스탬프 띠에만 씀

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
function fmtMD(ds){const p=String(ds||'').split('-');return p.length===3?(+p[1])+'/'+(+p[2]):String(ds||'')}
function hm(dt){return String(dt||'').slice(11,16)}
function wd(r){return (r&&(r.wdate||r.date))||''} // 기록의 작업일 (옛 기록은 기록 날짜)
function nextWorkDay(ds){let d=addDays(ds,1);if(dowOf(d)==='일')d=addDays(d,1);return d} // 일요일만 고정 휴무
function prevWorkDay(ds){let d=addDays(ds,-1);if(dowOf(d)==='일')d=addDays(d,-1);return d}
function wdOpts(type){ // 작업일 선택지 [[날짜,라벨],…]와 기본값 — 출고: 오늘/내일(15시 이후 기본 내일), 입고: 어제/오늘(10시 전 기본 어제)
  const today=kstDate(0);const h=kst(new Date()).getHours();
  if(type==='in'){const y=prevWorkDay(today);return {opts:[[y,'어제'],[today,'오늘']],def:h<10?y:today}}
  const n=nextWorkDay(today);return {opts:[[today,'오늘'],[n,'내일']],def:h>=15?n:today};
}
function addDays(ds,n){const q=String(ds).split('-');const d=new Date(Date.UTC(+q[0],+q[1]-1,+q[2]+n));return d.toISOString().slice(0,10)}
function prod(k){return PRODUCTS.find(p=>p.k===k)}
function normPlate(p){return String(p||'').replace(/\s/g,'')}
function ioToast(msg,err){
  const t=$('toast');if(!t){alert(msg);return}
  t.textContent=msg;t.className='toast toast-ok';t.style.display='block';
  t.style.background=err?'rgba(255,69,58,.92)':'';t.style.color=err?'#fff':'';
  clearTimeout(ioToast._t);ioToast._t=setTimeout(()=>{t.style.display='none';t.style.background='';t.style.color=''},2600);
}
function devId(){let d=localStorage.getItem('io_dev');if(!d){d=Math.random().toString(36).slice(2,10);localStorage.setItem('io_dev',d)}return d}
function vehicles(){try{return (typeof VEHICLES==='object'&&VEHICLES)?VEHICLES:{}}catch(e){return {}}}
function employees(){try{return Array.isArray(E)?E.filter(Boolean):[]}catch(e){return []}}
function jobs(){try{return Array.isArray(J)?J:[]}catch(e){return []}}
function admin(){try{return !!isAdmin}catch(e){return false}}
function apiUrl(){try{return SHEET_REPORT_URL}catch(e){return ''}}

/* ---------- CSS ---------- */
const CSS=`
.nav a{white-space:nowrap;padding-left:2px;padding-right:2px;letter-spacing:-.2px;overflow:hidden}
#p-io{padding-bottom:40px}
.io-sep{height:1px;background:var(--border);margin:22px 0 14px}
.io-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0 2px}
.io-hd h2{font-size:18px;font-weight:900;letter-spacing:-.3px}
.io-hd .r{display:flex;align-items:center;gap:6px}
.io-hd .r span{font-size:11px;color:var(--dim);font-weight:700}
.io-q{width:30px;height:30px;border-radius:50%;border:1px solid var(--border);background:var(--card);color:var(--sub);font-weight:900;font-size:14px;cursor:pointer;font-family:var(--font);-webkit-tap-highlight-color:transparent}
.io-start{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0 6px}
.io-start button{padding:16px 12px;border-radius:16px;border:none;font-family:var(--font);cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent;transition:transform .1s}
.io-start button:active{transform:scale(.97)}
.io-start .out{background:var(--green);color:#03170a}
.io-start .in{background:var(--card2);color:var(--text);border:1px solid rgba(255,255,255,.08)}
.io-start b{display:block;font-size:18px;font-weight:900;letter-spacing:-.3px}
.io-status{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:700;margin:8px 0}
.io-status.wait{background:rgba(255,214,10,.1);color:var(--yellow)}
.io-status.err{background:rgba(255,69,58,.12);color:var(--red)}
.io-status button{padding:7px 12px;border-radius:9px;border:none;background:rgba(255,255,255,.12);color:inherit;font-family:var(--font);font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
/* 차량별 현황 */
.io-led{background:var(--card);border-radius:14px;padding:4px 12px 2px;margin-top:12px}
.io-led-hd{display:flex;align-items:center;justify-content:space-between;padding:8px 0 6px}
.io-led-hd b{font-size:13px;font-weight:900}
.io-led-hd small{font-size:10.5px;color:var(--dim);font-weight:600;margin-left:6px}
.io-led-hd button{background:none;border:none;color:var(--dim);font-size:11px;font-family:var(--font);cursor:pointer;padding:4px 6px;font-weight:700}
.io-veh{padding:10px 0;border-top:1px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent}
.io-veh-l1{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.io-veh-l1 .p{font-size:14px;font-weight:900;white-space:nowrap}
.io-veh-l1 .p small{font-size:12px;color:var(--sub);font-weight:600;margin-left:4px}
.io-veh-l1 .e{font-size:11px;color:var(--dim);font-weight:700;white-space:nowrap;text-align:right}
.io-veh-l1 .e b{font-size:17px;font-weight:900;color:var(--text);margin-left:4px}
.io-veh-l1 .e b.neg{color:var(--red)}
.io-veh-eq{font-size:12px;color:var(--sub);margin-top:4px;line-height:1.5}
.io-veh-eq b{color:var(--text);font-weight:800}
.io-veh-eq .warn{color:var(--orange);font-weight:700}
.io-veh-l2{display:none;font-size:11px;color:var(--dim);margin-top:5px;line-height:1.55}
.io-veh-l2 b{color:var(--sub);font-weight:700}
.io-veh.open .io-veh-l2{display:block}
.io-veh-l2 b{color:var(--sub);font-weight:700}
.io-veh-l2 .warn{color:var(--orange);font-weight:700}
.io-veh-diff{display:inline-block;padding:2px 7px;border-radius:6px;font-size:10.5px;font-weight:800;margin-right:6px;vertical-align:1px}
.io-veh-diff.ok{background:rgba(48,209,88,.12);color:var(--green)}
.io-veh-diff.plus{background:rgba(255,69,58,.12);color:var(--red)}
.io-veh-diff.minus{background:rgba(90,200,250,.12);color:var(--blue)}
.io-veh-diff.warn{background:rgba(255,159,10,.14);color:var(--orange)}
.io-veh-diff.dim{background:rgba(255,255,255,.06);color:var(--dim)}
.io-veh-diff.big{font-size:12px;padding:4px 9px;margin:0}
.io-rc-prod{font-size:11px;color:var(--dim);margin-top:2px;line-height:1.5}
.io-rc-prod .plus{color:var(--red);font-weight:700}.io-rc-prod .minus{color:var(--blue);font-weight:700}
.io-void-fold{font-size:11px;color:var(--dim);padding:2px 2px 8px;cursor:pointer}
.io-auto{font-size:12px;color:var(--sub);background:var(--card);border-radius:10px;padding:9px 12px;margin:-6px 0 14px;line-height:1.5}
.io-auto b{color:var(--text)}
.io-late{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--dim);padding:2px 2px 0}
.io-late input{background:var(--card2);border:1px solid var(--border);color:var(--text);border-radius:9px;padding:7px 10px;font-size:15px;font-family:var(--font);color-scheme:dark}
.io-late .lnk{color:var(--dim);text-decoration:underline;cursor:pointer;padding:6px 0}
.io-rbtn{display:inline-block;margin-left:6px;padding:3px 8px;border-radius:6px;border:1px solid rgba(255,159,10,.5);background:transparent;color:var(--orange);font-size:11px;font-weight:800;font-family:var(--font);cursor:pointer;vertical-align:1px}
.io-rc-reason{font-size:11.5px;color:var(--sub);margin-top:3px}
.io-rc-reason b{color:var(--text);font-weight:800}
.io-rc-reason .ed{color:var(--dim);font-weight:600;margin-left:4px;cursor:pointer;text-decoration:underline}
.io-rs-sub{font-size:12px;color:var(--sub);margin:-6px 0 10px}
.io-rs-btns{display:flex;gap:8px;margin-top:12px}
.io-rs-btns button{flex:1;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer;width:auto;margin:0}
.io-rs-btns button.save{background:var(--green);color:#03170a;border-color:transparent}
.io-rs-btns button.del{color:var(--red)}
.io-veh-dt{display:none;margin-top:7px;font-size:11px;color:var(--sub);line-height:1.6;border-top:1px dashed var(--border);padding-top:6px}
.io-veh-dt div{display:flex;justify-content:space-between;gap:8px}
.io-veh-dt div span:last-child{white-space:nowrap;font-weight:700}
.io-veh.open .io-veh-dt{display:block}
.io-led-note{font-size:10.5px;color:var(--dim);padding:7px 0 6px;line-height:1.5;border-top:1px solid var(--border)}
/* 목록 */
.io-day{margin-top:16px}
.io-day-hd{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:0 2px 8px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.io-day-hd b{font-size:15px;font-weight:900}
.io-day-hd span{font-size:11px;color:var(--dim);font-weight:700}
.io-day-hd .arr{margin-left:auto;font-size:11px;color:var(--dim)}
.io-vh{display:flex;align-items:baseline;gap:6px;font-size:13px;font-weight:900;padding:8px 2px 2px}
.io-vh small{font-size:12px;color:var(--sub);font-weight:600}
.io-vh-rc{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--dim);padding:0 2px 6px}
.io-vh-rc b{color:var(--sub);font-weight:700}
.io-sum{background:var(--card);border-radius:12px;padding:9px 14px;margin-bottom:8px;font-size:12px;line-height:1.7;color:var(--sub)}
.io-sum b{color:var(--text);font-weight:800}
.io-sum .t{display:inline-block;min-width:40px;font-weight:800}
.io-sum .t.out{color:var(--green)}.io-sum .t.in{color:var(--cyan)}
.io-card{display:flex;gap:10px;background:var(--card);border-radius:14px;padding:10px;margin-bottom:8px}
.io-card.void{opacity:.45}
.io-th{width:78px;height:78px;border-radius:10px;background:var(--card2);flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--dim);text-align:center;line-height:1.4;cursor:pointer;-webkit-tap-highlight-color:transparent}
.io-th img{width:100%;height:100%;object-fit:cover;display:block}
.io-body{flex:1;min-width:0}
.io-l1{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px}
.io-tag{display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:800}
.io-tag.out{background:rgba(48,209,88,.15);color:var(--green)}
.io-tag.in{background:rgba(100,210,255,.15);color:var(--cyan)}
.io-tag.wait{background:rgba(255,214,10,.15);color:var(--yellow)}
.io-tag.late{background:rgba(255,159,10,.15);color:var(--orange)}
.io-tag.void{background:rgba(255,69,58,.15);color:var(--red)}
.io-l1 .tm{font-size:13px;font-weight:800}
.io-l1 .who{font-size:12px;color:var(--sub);font-weight:600}
.io-item{font-size:13px;line-height:1.4;color:var(--text);margin-top:3px}
.io-item b{font-weight:800;white-space:nowrap}
.io-item .q{display:block;color:var(--sub);font-size:12px;margin-top:1px}
.io-note{font-size:11px;color:var(--dim);margin-top:4px}
.io-x{align-self:flex-start;background:none;border:1px solid var(--border);color:var(--dim);border-radius:8px;padding:5px 8px;font-size:11px;font-family:var(--font);cursor:pointer;flex-shrink:0}
.io-empty{text-align:center;color:var(--dim);font-size:13px;padding:30px 0;line-height:1.7}
.io-today-empty{text-align:center;color:var(--dim);font-size:12px;padding:14px 0 4px}
.io-more{width:100%;margin-top:6px;padding:11px;border-radius:12px;border:1px dashed rgba(255,255,255,.15);background:transparent;color:var(--sub);font-size:12px;font-weight:700;font-family:var(--font);cursor:pointer}
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
.io-photo{position:relative;border-radius:16px;overflow:hidden;background:var(--card);border:2px dashed rgba(255,255,255,.14);min-height:150px;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.io-photo.has{border-style:solid;border-color:rgba(48,209,88,.4)}
.io-photo{min-height:130px}
.io-photo .ph{text-align:center;color:var(--sub);padding:18px 16px}
.io-photo .ph .i{font-size:36px;line-height:1;margin-bottom:6px}
.io-photo .ph b{display:block;font-size:16px;font-weight:900;color:var(--text);margin-bottom:5px}
.io-photo .ph small{font-size:12px;color:var(--dim);line-height:1.5}
.io-photo img{width:100%;display:block}
.io-photo .re{position:absolute;top:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:9px;padding:7px 11px;font-size:12px;font-weight:800;font-family:var(--font);cursor:pointer;backdrop-filter:blur(6px)}
.io-photo .busy{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);color:#fff;font-weight:800;font-size:14px}
.io-date{display:flex;align-items:center;justify-content:space-between;background:var(--card);border-radius:14px;padding:12px 16px}
.io-date b{font-size:17px;font-weight:900;letter-spacing:-.3px}
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
.io-row{display:grid;grid-template-columns:60px 1fr;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)}
.io-row .n{font-size:14px;font-weight:800}
.io-row .n.t{color:var(--purple)}
.io-row .u{position:relative}
.io-row input{width:100%;background:var(--card2);border:1px solid transparent;color:var(--text);border-radius:10px;padding:12px 30px 12px 12px;font-size:20px;font-weight:900;font-family:var(--font);text-align:right;outline:none;-moz-appearance:textfield}
.io-row input::-webkit-outer-spin-button,.io-row input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.io-row input:focus{border-color:rgba(90,200,250,.6);background:var(--bg)}
.io-row input.z{color:var(--dim);font-weight:600}
.io-row .u i{position:absolute;right:11px;top:50%;transform:translateY(-50%);font-style:normal;font-size:12px;color:var(--dim);font-weight:700;pointer-events:none}
.io-pc-ft{display:flex;justify-content:space-between;align-items:baseline;padding-top:10px;font-size:12px;color:var(--sub)}
.io-pc-ft b{font-size:16px;font-weight:900;color:var(--text)}
.io-add{width:100%;padding:14px;border-radius:14px;border:1.5px dashed rgba(255,255,255,.18);background:transparent;color:var(--text);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer}
.io-add small{display:block;font-size:11px;color:var(--dim);font-weight:600;margin-top:3px}
.io-foot{position:fixed;left:0;right:0;bottom:0;background:linear-gradient(to top,var(--bg) 70%,rgba(25,26,32,0));padding:14px 16px;padding-bottom:max(16px,env(safe-area-inset-bottom));z-index:6}
.io-foot-in{max-width:520px;margin:0 auto}
.io-submit{width:100%;padding:17px;border-radius:16px;border:none;font-size:17px;font-weight:900;font-family:var(--font);cursor:pointer;background:var(--green);color:#03170a;letter-spacing:-.2px}
.io-submit.in{background:var(--cyan);color:#001b24}
.io-submit:disabled{opacity:.5}
.io-view{display:none;position:fixed;inset:0;background:rgba(0,0,0,.94);z-index:995;align-items:center;justify-content:center;padding:10px}
.io-view.show{display:flex}
.io-view img{max-width:100%;max-height:100%;border-radius:8px}
.io-view button{position:absolute;top:max(14px,env(safe-area-inset-top));right:14px;background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:50%;width:40px;height:40px;font-size:18px;cursor:pointer}
.io-view a{position:absolute;bottom:max(20px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);color:#fff;background:rgba(255,255,255,.15);padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;text-decoration:none}
.io-day-hd .io-shb{margin-left:auto;background:rgba(90,200,250,.12);color:var(--blue);border:none;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:800;font-family:var(--font);cursor:pointer;white-space:nowrap}
.io-day-hd span.cnt{font-size:11px;color:var(--dim);font-weight:700}
.io-acts{display:flex;flex-direction:column;gap:6px;align-self:flex-start;flex-shrink:0}
/* 도움말 (첫 사용 1회 + ❔ 버튼) */
.io-help{display:none;position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:996;align-items:flex-end;justify-content:center}
.io-help.show{display:flex}
.io-help-in{background:var(--card);border-radius:18px 18px 0 0;width:100%;max-width:520px;padding:18px 18px;padding-bottom:max(18px,env(safe-area-inset-bottom));font-size:13px;line-height:1.55;color:var(--text)}
.io-help-in h3{font-size:15px;font-weight:900;margin-bottom:10px}
.io-help-in .st{display:flex;gap:8px;align-items:flex-start;margin:7px 0;color:var(--text)}
.io-help-in .st b{flex-shrink:0;color:var(--dim);font-weight:800}
.io-help-in .st span b{color:var(--text)}
.io-help-in .ref{font-size:12px;color:var(--dim);margin-top:8px}
.io-help-in button{width:100%;margin-top:12px;padding:12px;border-radius:12px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer}
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
.io-sh-veh{background:var(--card);border-radius:14px;padding:8px 12px 4px;margin-bottom:8px}
.io-sh-vh{font-size:14px;font-weight:900;padding:4px 0 6px}
.io-sh-vh small{font-size:12px;color:var(--sub);font-weight:600;margin-left:5px}
.io-sh-row{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--border)}
.io-sh-row .b{flex:1;min-width:0}
.io-sh-l1{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px}
.io-sh-l1 b{font-size:13px;font-weight:900}
.io-sh-line{font-size:13.5px;line-height:1.4;margin-top:4px}
.io-sh-line b{font-weight:900}
.io-sh-line .q{display:block;color:var(--sub);font-size:12px;margin-top:1px}
.io-sh-rc{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--dim);padding:2px 0 6px}
.io-sh-rc b{color:var(--sub);font-weight:700}
.io-sh-memo{font-size:11px;color:var(--dim);margin-top:2px}
.io-sh-th{width:92px;height:92px;border-radius:8px;background:var(--card2);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--dim);text-align:center;line-height:1.3;cursor:pointer}
.io-sh-th img{width:100%;height:100%;object-fit:cover;display:block}
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
let SH={open:false,date:''}; // 공유 화면 상태 (그날 전체)
let INV=null;        // Firebase inventory 최근 45일 {날짜:{팀:{위치:{time,unit,data}}}}
let invAt=0;         // INV 불러온 시각
let invPromise=null; // 진행 중인 실사 불러오기 약속 — 재진입 시 같은 약속을 돌려줌 (루프 방지)
let invWaiting=false;// 실사 도착 후 renderList 한 번만 예약
let _rlN=0,_rlT=0;   // renderList 과다 호출 차단기
let LED_OPEN={};     // 차량별 현황 펼침 상태 {plate:true}
let LIST_ALL=false;  // 목록 14일 전체 보기
let DAY_OPEN={};     // 지난 날짜 펼침 상태 {date:true}
let VOID_OPEN={};    // 취소된 기록 펼침 {날짜|차량:true}
let RECON={};        // 사유 {날짜:{차량:{reason,note,by,at,diff,verdict}}}
let RS=null;         // 사유 입력 중 {plate,date,reason,note}

/* ---------- 껍데기 ---------- */
function ensureShell(){
  if($('ioView'))return;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  const host=$('p-fair'); // 🚗 차량 탭 맨 위 (차량 배정·공정성 위)
  if(host){
    const box=document.createElement('div');box.id='ioView';const sep=document.createElement('div');sep.className='io-sep';
    host.insertBefore(sep,host.firstChild);host.insertBefore(box,sep);
    try{const _sw=window.sw;if(typeof _sw==='function'&&!_sw._io){const w=function(n){const r=_sw.apply(this,arguments);if(n==='fair')onTabOpen();return r};w._io=true;window.sw=w}}catch(e){}
  }else{ // 차량 탭이 없는 페이지: 예전처럼 별도 패널 + 하단 탭
    const pane=document.createElement('div');pane.className='pane';pane.id='p-io';pane.innerHTML='<div id="ioView"></div>';
    const panes=document.querySelectorAll('.pane');const last=panes[panes.length-1];
    if(last&&last.parentNode)last.parentNode.insertBefore(pane,last.nextSibling);else document.body.appendChild(pane);
    const nav=document.querySelector('.nav');
    if(nav){const a=document.createElement('a');a.href='#';a.id='ioNavBtn';a.setAttribute('onclick','ioShow();return false');a.innerHTML='<span>📦</span>입출고';nav.appendChild(a)}
  }
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
  const hp=document.createElement('div');hp.className='io-help';hp.id='ioHelp';hp.setAttribute('onclick','if(event.target===this)ioHelpClose()');
  hp.innerHTML=`<div class="io-help-in">
    <h3>입출고 기록</h3>
    <div class="st"><b>1</b><span>남은 것 내리면 <b>입고</b>, 내일 것 실으면 <b>출고</b>. 저녁 출고는 자동으로 내일 것으로 잡혀요.</span></div>
    <div class="st"><b>2</b><span>사진 → 차량 → 제품별 <b>장수</b> 입력. 시공보고는 입고 전에.</span></div>
    <div class="st"><b>3</b><span>제출하면 오늘 화면이 떠요. 스크린샷해서 단톡방에. 안 맞으면 <b>사유</b>.</span></div>
    <div class="ref">박스는 장수로 환산: 500 12장 · 1M 22T 4장 · 1M 17T 6장 · 10T 24장(500)/8장(1M)</div>
    <button type="button" onclick="ioHelpClose()">확인</button>
  </div>`;
  document.body.appendChild(hp);
  const rs=document.createElement('div');rs.className='io-help';rs.id='ioReasonOv';rs.setAttribute('onclick','if(event.target===this)ioReasonClose()');
  rs.innerHTML='<div class="io-help-in"><h3>안 맞는 사유</h3><div class="io-rs-sub" id="ioRsSub"></div><div class="io-chips" id="ioRsChips"></div><input class="io-inp" id="ioRsNote" style="margin-top:10px" placeholder="메모 (선택) 예) 문틀 절단 중 3장 파손" maxlength="100" oninput="ioReasonNote(this.value)"><div class="io-rs-btns"><button type="button" onclick="ioReasonClose()">닫기</button><button type="button" class="del" id="ioRsDel" onclick="ioReasonDelete()" style="display:none">지우기</button><button type="button" class="save" onclick="ioReasonSave()">저장</button></div></div>';
  document.body.appendChild(rs);
}

function onTabOpen(){ // 차량 탭이 열릴 때
  try{window.scrollTo(0,0)}catch(e){}
  renderList();
  if(obGet().length)ioFlush(false);
  if(!localStorage.getItem('io_help_seen'))ioHelp();
}
function ioShow(){
  if($('p-fair')&&typeof window.sw==='function'){window.sw('fair');return} // 차량 탭에 붙어 있으면 그 탭으로 (sw 래퍼가 onTabOpen 호출)
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('on'));
  if($('ioNavBtn'))$('ioNavBtn').classList.add('on');if($('p-io'))$('p-io').classList.add('on');
  try{currentTab='io'}catch(e){}
  onTabOpen();
}
function ioHelp(){$('ioHelp').classList.add('show')}
function ioHelpClose(){$('ioHelp').classList.remove('show');localStorage.setItem('io_help_seen','1')}

/* ---------- 차량별 현황 (지난 실사 + 출고 − 입고 − 시공보고) ---------- */
const PID_PER={'500':12,'1000_22':4,'1000_17':6};
function keyPer(k){ // 재고조사 키 '500_모던_10T' → 박스당 장수 (옛 박스 기록 환산용)
  const t=String(k).split('_').pop();const pid=k.indexOf('1000_22')===0?'1000_22':k.indexOf('1000_17')===0?'1000_17':'500';
  return t==='10T'?(pid==='500'?24:8):PID_PER[pid];
}
function locSheets(d){ // 실사 1곳 {time,unit,data} → {all:전체 장수(10T 포함), t10:그중 10T} (unit '장'이면 그대로, 없으면 박스×장수)
  const o={all:0,t10:0};if(!d||!d.data)return o;
  const isSheet=d.unit==='장';
  Object.keys(d.data).forEach(k=>{const v=+d.data[k]||0;const n=isSheet?v:v*keyPer(k);o.all+=n;if(/_10T$/.test(k))o.t10+=n});
  return o;
}
function loadInventory(force){
  if(!force&&INV&&Date.now()-invAt<5*60000)return Promise.resolve(INV);
  if(invPromise)return invPromise; // 이미 불러오는 중이면 그 약속을 그대로 (끝난 약속을 돌려주면 renderList 무한 루프)
  try{
    invPromise=db.ref('inventory').orderByKey().startAt(kstDate(-45)).endAt(kstDate(0)+'\uf8ff').once('value')
      .then(s=>{INV=s.val()||{};invAt=Date.now();return INV})
      .catch(e=>{console.warn('[io] inventory',e);INV=INV||{};invAt=Date.now();return INV})
      .finally(()=>{invPromise=null});
  }catch(e){console.warn('[io] inventory',e);INV=INV||{};invAt=Date.now();invPromise=null;return Promise.resolve(INV)}
  return invPromise;
}
function vehicleSurveys(plate){ // 이 차량의 실사 목록 (오래된순) [{date,time,all,t10}]
  const np=normPlate(plate);const out=[];
  Object.keys(INV||{}).sort().forEach(date=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
    const team=(INV[date]||{})[RN];if(!team)return;
    Object.keys(team).forEach(loc=>{if(normPlate(loc)!==np)return;const d=team[loc];if(!d||!d.time)return;const s=locSheets(d);out.push({date,time:String(d.time),all:s.all,t10:s.t10})});
  });
  return out;
}
function afterSurvey(rec,sv){ // 기록이 실사 뒤인지 — 같은 날은 실사 시각 이후만, 지연 입력은 날짜로만 판단
  if(rec.date>sv.date)return true;if(rec.date<sv.date)return false;
  if(rec.late)return false;return hm(rec.at)>sv.time;
}
function sumIO(recs,pred){ // 출고·입고 장수 합계 — 10T 포함 (판매갯수에 10T도 들어가므로 같은 묶음)
  const o={out:0,inn:0,n:0};
  recs.forEach(r=>{if(!pred(r))return;o.n++;
    const m=(r.items||[]).reduce((a,it)=>a+num(it.total)+num(it.tQty),0);
    if(r.type==='in')o.inn+=m;else o.out+=m});
  return o;
}
function jobsOf(plate,fromDate,toDate){ // 스케줄(J)에서 이 차량의 시공보고 판매갯수: fromDate 초과 ~ toDate 이하 (실측·차단 제외, AS는 판매갯수 있으면 포함). 차량번호 빈 행은 사수로 매칭
  const np=normPlate(plate);const o={sold:0,n:0,miss:0,list:[],noSold:false};
  const owner=vehicles()[plate]||'';
  jobs().forEach(j=>{
    if(!j)return;
    const jv=normPlate(j.vehicle);
    if(jv?jv!==np:!(owner&&String(j.sasu||'').trim()===owner))return; // 차량번호 있으면 그걸로, 없으면 사수=이 차 담당
    if(!(j.date>fromDate&&j.date<=toDate))return;
    const t=String(j.time||'').trim();if(t==='실측')return;
    if(/^(오전|오후)?\s*예약\s*[xX✕×](\s|$)/.test(String(j.addr||'').trim()))return;
    if(j.sold==null){o.noSold=true;return} // 스케줄러가 판매갯수를 안 넘기는 구버전
    const q=+j.sold||0;
    if(q>0){o.sold+=q;o.n++;o.list.push({date:j.date,addr:String(j.addr||'').replace(/\(.*?\)/g,'').trim().slice(0,16),q,prod:prodKeyOfCode(j.mat&&j.mat[0]&&j.mat[0].t)})}
    else if(t!=='AS'&&j.sasu)o.miss++;
  });
  return o;
}
function firstRecordDate(){ // 이 지역 입출고 기록 중 가장 이른 날짜 (불러온 14일 범위 안)
  const {all}=allRecords();let d='';
  Object.values(all).forEach(r=>{if(r&&r.date&&r.status!=='void'&&(!d||r.date<d))d=r.date});
  return d;
}
function prodKeyOfCode(code){ // 스케줄 제품 칸('모던1m22','베이지1m17','마블50'…) → PRODUCTS.k ('1M 22T 모던' 등). 못 알아보면 ''
  const s=String(code||'');const col=/베이지/.test(s)?'베이지':/마블/.test(s)?'마블':/코튼/.test(s)?'코튼':/모던/.test(s)?'모던':'';
  if(!col)return '';
  if(/1m\s*22|1000\D*22|22t/i.test(s))return '1M 22T '+col;
  if(/1m\s*17|1000\D*17|17t/i.test(s))return '1M 17T '+col;
  return '500 '+col;
}
function myPlate(){const v=localStorage.getItem('io_last_vehicle')||'';return Object.keys(vehicles()).includes(v)?v:''}
function dayRecon(plate,date){ // 그날 이 차량: 출고 − 입고 − 시공보고 판매갯수 = 차이 (0이면 판 만큼 빼고 다 가져온 것). 제품별로도 계산
  const np=normPlate(plate);const {all}=allRecords();
  const recs=Object.values(all).filter(r=>r&&wd(r)===date&&r.status!=='void'&&normPlate(r.vehicle)===np);
  const io=sumIO(recs,()=>true);const jb=jobsOf(plate,addDays(date,-1),date);
  const by={};const add=(k,f,v)=>{if(!by[k])by[k]={out:0,inn:0,sold:0};by[k][f]+=v};
  recs.forEach(r=>{(r.items||[]).forEach(it=>{add(it.product||'?',r.type==='in'?'inn':'out',num(it.total)+num(it.tQty))})});
  let unknown=false;jb.list.forEach(j=>{if(j.prod)add(j.prod,'sold',j.q);else unknown=true});
  const prods=PRODUCTS.map(p=>p.k).filter(k=>by[k]).concat(Object.keys(by).filter(k=>!PRODUCTS.some(p=>p.k===k)));
  const byProd=prods.map(k=>({k,out:by[k].out,inn:by[k].inn,sold:by[k].sold,diff:by[k].out-by[k].inn-by[k].sold}));
  const mismatch=!unknown&&byProd.some(x=>x.diff!==0);
  return {date,out:io.out,inn:io.inn,n:io.n,hasIn:recs.some(r=>r.type==='in'),sold:jb.sold,miss:jb.miss,jobsN:jb.n,list:jb.list,diff:io.out-io.inn-jb.sold,byProd,mismatch,unknown};
}
function verdictTag(R,big){ // 판정 배지
  const c=big?' big':'';let cls='dim',txt='';
  if(!R.n&&!R.jobsN&&!R.miss){txt='기록 없음'}
  else if(R.miss){cls='warn';txt='시공보고 미입력 '+R.miss+'건'}
  else if(!R.out&&(R.inn||R.sold)){cls='warn';txt='출고 기록 없음'}
  else if(!R.hasIn){txt='입고 전'}
  else if(R.diff===0&&R.mismatch){cls='warn';txt='제품 불일치'}
  else if(R.diff===0){cls='ok';txt='딱 맞음 ✓'}
  else if(R.diff>0){cls='plus';txt='+'+R.diff+'장 안 돌아옴'}
  else {cls='minus';txt=R.diff+'장 차 재고 사용'}
  return `<span class="io-veh-diff ${cls}${c}">${txt}</span>`;
}
function reconEq(R){return `출고 <b>${R.out}</b> − 입고 <b>${R.inn}</b> − 시공보고 <b>${R.sold}</b>`}
function reconProdList(R){ // 제품별로 안 맞는 것만 — 판정이 나온 상태(입고 후·미보고 없음)에서만
  if(!R.hasIn||R.miss||!R.out)return [];
  return R.byProd.filter(x=>x.diff!==0).map(x=>({k:x.k,diff:x.diff,txt:x.k+' '+(x.diff>0?'+':'')+x.diff}));
}
function reconProdHtml(R){const l=reconProdList(R);if(!l.length)return '';return `<div class="io-rc-prod">${l.map(x=>`<span class="${x.diff>0?'plus':'minus'}">${esc(x.txt)}</span>`).join(' · ')}</div>`}
function verdictText(R){
  if(!R.n&&!R.jobsN&&!R.miss)return '기록 없음';if(R.miss)return '시공보고 미입력 '+R.miss+'건';if(!R.out&&(R.inn||R.sold))return '출고 기록 없음';if(!R.hasIn)return '입고 전';
  if(R.diff===0&&R.mismatch)return '제품 불일치';
  return R.diff===0?'딱 맞음':R.diff>0?'+'+R.diff+'장 안 돌아옴':R.diff+'장 차 재고 사용';
}
/* ---------- 안 맞는 사유 ---------- */
function reasonOf(plate,date){const d=RECON[date];return d?d[normPlate(plate)]||null:null}
function needsReason(R){ // 사유 버튼이 뜨는 판정: 안 돌아옴 / 차 재고 사용 / 제품 불일치
  if(!R.n&&!R.jobsN&&!R.miss)return false;if(R.miss||(!R.out&&(R.inn||R.sold))||!R.hasIn)return false;
  return R.diff!==0||R.mismatch;
}
function reasonHtml(plate,date,R,inShare){ // 사유 줄 + 버튼
  const rs=reasonOf(plate,date);
  if(rs)return `<div class="io-rc-reason">사유: <b>${esc(rs.reason)}</b>${rs.note?' · '+esc(rs.note):''}${rs.by?` <span style="color:var(--dim)">(${esc(rs.by)})</span>`:''}${inShare?'':`<span class="ed" onclick="event.stopPropagation();ioReasonOpen('${esc(plate)}','${date}')">수정</span>`}</div>`;
  return needsReason(R)?`<button type="button" class="io-rbtn" onclick="event.stopPropagation();ioReasonOpen('${esc(plate)}','${date}')">사유 적기</button>`:'';
}
function reasonText(plate,date){const rs=reasonOf(plate,date);return rs?'사유: '+rs.reason+(rs.note?' · '+rs.note:''):''}
function ioReasonOpen(plate,date){
  const cur=reasonOf(plate,date)||{};RS={plate,date,reason:cur.reason||'',note:cur.note||''};
  const R=dayRecon(plate,date);
  $('ioRsSub').textContent=plate+' · '+fmtD(date)+' · '+verdictText(R);
  $('ioRsNote').value=RS.note;$('ioRsDel').style.display=cur.reason?'':'none';
  renderReasonChips();$('ioReasonOv').classList.add('show');
}
function renderReasonChips(){const box=$('ioRsChips');if(!box||!RS)return;box.innerHTML=REASONS.map(r=>`<div class="io-chip${RS.reason===r?' on':''}" onclick="ioReasonPick('${esc(r)}')">${esc(r)}</div>`).join('')}
function ioReasonPick(r){if(!RS)return;RS.reason=r;renderReasonChips()}
function ioReasonNote(v){if(RS)RS.note=v.slice(0,100)}
function ioReasonClose(){$('ioReasonOv').classList.remove('show');RS=null}
function ioReasonSave(){
  if(!RS)return;if(!RS.reason){ioToast('사유를 하나 골라주세요',true);return}
  const R=dayRecon(RS.plate,RS.date);
  const rec={reason:RS.reason,note:RS.note||'',by:vehicles()[RS.plate]||'',at:kstDT(new Date()),diff:R.diff,verdict:verdictText(R),dev:devId()};
  try{db.ref('io_recon/'+RK+'/'+RS.date+'/'+normPlate(RS.plate)).set(rec)}catch(e){console.warn('[io] reason',e);ioToast('저장 실패',true);return}
  obAdd({kind:'reason',id:'reason_'+Date.now(),payload:{action:'ioReason',region:RN,date:RS.date,vehicle:RS.plate,by:rec.by,reason:rec.reason,note:rec.note,diff:rec.diff,verdict:rec.verdict},tries:0,ts:Date.now()});
  ioToast('사유 저장');ioReasonClose();ioFlush(false);
}
function ioReasonDelete(){
  if(!RS)return;if(!confirm('사유를 지울까요?'))return;
  try{db.ref('io_recon/'+RK+'/'+RS.date+'/'+normPlate(RS.plate)).remove()}catch(e){}
  obAdd({kind:'reason',id:'reason_'+Date.now(),payload:{action:'ioReason',region:RN,date:RS.date,vehicle:RS.plate,remove:true},tries:0,ts:Date.now()});
  ioReasonClose();ioFlush(false);
}
function weekSummary(plate,today){ // 최근 7일 중 판정이 난 날의 차이 합계
  const o={days:0,sum:0,bad:0,noReason:0};
  for(let i=0;i<7;i++){const d=addDays(today,-i);const R=dayRecon(plate,d);
    if(!R.hasIn||R.miss||!R.out)continue;o.days++;o.sum+=R.diff;
    if(R.diff!==0||R.mismatch){o.bad++;if(!reasonOf(plate,d))o.noReason++}}
  return o;
}
function vehicleLedger(plate){
  const svs=vehicleSurveys(plate);const s1=svs[svs.length-1]||null;const s0=svs.length>1?svs[svs.length-2]:null;
  const np=normPlate(plate);const {all}=allRecords();
  const recs=Object.values(all).filter(r=>r&&r.date&&r.status!=='void'&&normPlate(r.vehicle)===np);
  const today=kstDate(0);
  const L={plate,s1,s0,cur:null,prev:null};
  if(s1){
    const io=sumIO(recs,r=>afterSurvey(r,s1));const jb=jobsOf(plate,s1.date,today);
    L.cur={io,jb,expect:s1.all+io.out-io.inn-jb.sold};
  }
  // 직전 구간 비교는 그 구간 시작 전부터 이 지역에 입출고 기록이 있었을 때만 (기록 시작 전 구간은 출고가 빠져 '잉여'로 보이는 허수가 됨)
  const first=firstRecordDate();
  if(s0&&s1&&s0.date>=kstDate(-DAYS)&&first&&first<=s0.date){
    const io=sumIO(recs,r=>afterSurvey(r,s0)&&!afterSurvey(r,s1));const jb=jobsOf(plate,s0.date,s1.date);
    if(io.n)L.prev={io,jb,expect:s0.all+io.out-io.inn-jb.sold,diff:s1.all-(s0.all+io.out-io.inn-jb.sold)};
  }
  return L;
}
function renderLedger(){
  const allPlates=Object.keys(vehicles());if(!allPlates.length)return '';
  const mine=myPlate();const showAll=admin()||!mine;const plates=showAll?allPlates:[mine];
  const today=kstDate(0);
  if(!INV&&!invWaiting){invWaiting=true;loadInventory(false).then(()=>{invWaiting=false;renderList()})}
  let h=`<div class="io-led"><div class="io-led-hd"><div><b>🚚 ${showAll?'차량별 현황':'내 차량'}</b><small>오늘 ${fmtD(today)}</small></div><button type="button" onclick="ioLedgerReload()">↻</button></div>`;
  let anyNoSold=false;
  plates.forEach(pl=>{
    const R=dayRecon(pl,today);const L=INV?vehicleLedger(pl):null;const who=vehicles()[pl]||'';const open=!!LED_OPEN[pl];
    h+=`<div class="io-veh${open?' open':''}" onclick="ioLedgerToggle('${esc(pl)}')"><div class="io-veh-l1"><span class="p">${esc(pl)}${who?`<small>${esc(who)}</small>`:''}</span><span class="e">${verdictTag(R,true)}</span></div>`;
    h+=`<div class="io-veh-eq">${reconEq(R)}${R.diff!==0&&R.hasIn&&!R.miss&&R.out?` = <b>${R.diff>0?'+':''}${R.diff}</b>`:''}${reconProdHtml(R)}${reasonHtml(pl,today,R)}</div>`;
    // 펼침: 오늘 시공 내역 + 실사 구간 누적
    h+=`<div class="io-veh-l2">`;
    if(R.list.length)h+=`오늘 시공: ${R.list.map(j=>esc(j.addr)+' '+j.q+'장').join(' · ')}<br>`;
    const nx=dayRecon(pl,nextWorkDay(today));if(nx.out)h+=`내일(${fmtMD(nextWorkDay(today))}) 것 미리 실음 <b>${nx.out}장</b><br>`;
    const wk=weekSummary(pl,today);if(wk.days)h+=`최근 7일 판정 ${wk.days}일: 합계 <b>${wk.sum>0?'+':''}${wk.sum}장</b>${wk.bad?` · 안 맞은 날 ${wk.bad}일`:''}${wk.noReason?` <span class="warn">· 사유 없음 ${wk.noReason}일</span>`:''}<br>`;
    if(!L)h+=`실사 기록 불러오는 중…`;
    else if(!L.s1)h+=`실사 기록 없음 (최근 45일)`;
    else{const c=L.cur;if(c.jb.noSold)anyNoSold=true;
      h+=`이번 주 있어야 할 <b>${c.expect}장</b> = ${fmtMD(L.s1.date)} 실사 ${L.s1.all} + 출고 ${c.io.out} − 입고 ${c.io.inn} − 시공 ${c.jb.sold}${c.jb.miss?` <span class="warn">· 미보고 ${c.jb.miss}건</span>`:''}${c.expect<0?` <span class="warn">· 출고 기록 누락</span>`:''}`;
      if(L.prev){const d=L.prev.diff;h+=`<br>지난 구간 ${fmtMD(L.s0.date)}→${fmtMD(L.s1.date)}: 실사 ${L.s1.all} vs 예상 ${L.prev.expect} → <b>${d===0?'일치':(d>0?'+':'')+d+'장 '+(d>0?'잉여':'부족')}</b>`}}
    h+=`</div></div>`;
  });
  h+=`<div class="io-led-note">${anyNoSold?'⚠️ 스케줄러가 판매갯수를 아직 안 넘겨줘요 — 업데이트 후 다시 보세요.<br>':''}${showAll&&!admin()?'출고·입고를 한 번 기록하면 내 차량만 보여요. ':''}싣고 나간 것 − 도로 내린 것 − 판 것(시공보고 판매갯수, 10T 포함) = 0이면 정상. 제품별로도 맞춰 봐요. 누르면 상세.</div></div>`;
  return h;
}
function ioLedgerToggle(pl){LED_OPEN[pl]=!LED_OPEN[pl];renderList()}
function ioLedgerReload(){INV=null;invAt=0;invWaiting=false;try{if(typeof refreshSheet==='function')refreshSheet(false)}catch(e){}renderList();ioToast('새로고침')}

/* ---------- 목록 ---------- */
function itemQty(it,k){return num(it[k])} // 장수 (작성 중 폼)
function itemTotal(it){return itemQty(it,'c')+itemQty(it,'s')+itemQty(it,'k')}
function itemLine(it){ // 저장된 기록(items 평탄화)용 — 제품 + 장수, 아래 줄에 형태별
  const parts=[['센터',it.cQty],['사이드',it.sQty],['코너',it.kQty],['10T',it.tQty]].filter(x=>num(x[1])>0).map(x=>x[0]+' '+num(x[1]));
  return '<b>'+esc(it.product)+'</b> <b>'+(num(it.total)+num(it.tQty))+'장</b><span class="q">'+esc(parts.join(' · '))+'</span>';
}
function thumbUrl(id,w){return 'https://drive.google.com/thumbnail?id='+id+'&sz=w'+(w||400)}
function viewUrl(id){return 'https://drive.google.com/file/d/'+id+'/view'}
function canVoid(r){if(admin())return true;return r.dev===devId()&&(Date.now()-(r.ts||0))<OWN_MIN*60000}

function allRecords(){ // Firebase 기록 + 이 폰의 전송 대기 기록 합치기
  const ob=obGet();const local={};ob.forEach(e=>{if(e.kind==='log'&&e.rec)local[e.rec.id]={photo:e.payload&&e.payload.photo,rec:e.rec,tries:e.tries||0}});
  const all={...LOGS};Object.keys(local).forEach(id=>{if(!all[id])all[id]=local[id].rec});
  return {all,local,ob};
}
function vehLabel(plate){const who=vehicles()[plate]||'';return esc(plate||'-')+(who?`<small>${esc(who)}</small>`:'')}
function groupByVehicle(recs){ // [{plate,recs}] — 차량 탭 등록 순서, 그 외 차량은 뒤에. 각 차량 안은 시간순
  const plates=Object.keys(vehicles());const keys=plates.map(normPlate);const g={};
  recs.forEach(r=>{const k=normPlate(r.vehicle)||'-';(g[k]=g[k]||[]).push(r)});
  const order=[...keys,...Object.keys(g).filter(k=>!keys.includes(k))];
  return order.filter(k=>g[k]).map(k=>({plate:g[k][0].vehicle||'-',recs:g[k].sort((a,b)=>(a.ts||0)-(b.ts||0))}));
}
function recCard(r,local){
  const lp=local[r.id];const pending=!!lp||r.status==='pending';const isVoid=r.status==='void';
  let th;
  if(lp&&lp.photo)th=`<div class="io-th" onclick="ioViewLocal('${esc(r.id)}')"><img src="${lp.photo}" alt=""></div>`;
  else if(r.photoId)th=`<div class="io-th" onclick="ioView('${esc(r.photoId)}')"><img src="${thumbUrl(r.photoId,300)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='사진<br>불러오기 실패'"></div>`;
  else th=`<div class="io-th">사진<br>전송 중</div>`;
  const late=r.late?'<span class="io-tag late">지연 입력</span>':'';
  const gap=r.photoGap>=LATE_MIN?`<span class="io-tag late" title="사진 시각과 제출 시각 차이">사진 ${r.photoGap}분 전</span>`:'';
  return `<div class="io-card${isVoid?' void':''}">${th}<div class="io-body">
    <div class="io-l1"><span class="io-tag ${r.type==='in'?'in':'out'}">${TYPE[r.type==='in'?'in':'out'].n}</span><span class="tm">${esc(hm(r.at))}</span>${r.worker?`<span class="who">${esc(r.worker)}</span>`:''}${pending?'<span class="io-tag wait">전송 대기</span>':''}${late}${gap}${isVoid?'<span class="io-tag void">취소됨</span>':''}</div>
    ${(r.items||[]).map(it=>`<div class="io-item">${itemLine(it)}</div>`).join('')}
    ${r.note?`<div class="io-note">${esc(r.note)}</div>`:''}${isVoid&&r.voidReason?`<div class="io-note">취소 사유: ${esc(r.voidReason)}</div>`:''}
  </div>${!isVoid&&canVoid(r)?`<div class="io-acts"><button type="button" class="io-x" onclick="ioVoid('${esc(r.id)}')">취소</button></div>`:''}</div>`;
}
function dayBlock(d,rs,local,forceOpen){
  const live=rs.filter(r=>r.status!=='void');
  const cnt={out:0,in:0};live.forEach(r=>cnt[r.type==='in'?'in':'out']++);
  const today=kstDate(0),yest=kstDate(-1),future=d>today;
  const label=d===today?'오늘 '+fmtD(d):d===yest?'어제 '+fmtD(d):future?(d===nextWorkDay(today)?'내일 ':'')+fmtD(d)+' · 미리 실은 것':fmtD(d);
  const open=forceOpen||!!DAY_OPEN[d];
  let h=`<div class="io-day"><div class="io-day-hd" onclick="${forceOpen?'':`ioDayToggle('${d}')`}"><b>${label}</b><span class="cnt">출고 ${cnt.out} · 입고 ${cnt.in}</span>${open&&live.length?`<button type="button" class="io-shb" onclick="event.stopPropagation();ioShare('${d}')">📤 공유</button>`:''}${forceOpen?'':`<span class="arr">${open?'▾':'▸'}</span>`}</div>`;
  if(!open)return h+'</div>';
  const sum={out:{},in:{}};live.forEach(r=>{(r.items||[]).forEach(it=>{const s=sum[r.type==='in'?'in':'out'];s[it.product]=s[it.product]||{q:0,t:0};s[it.product].q+=num(it.total);s[it.product].t+=num(it.tQty)})});
  const sumLine=k=>{const keys=PRODUCTS.map(p=>p.k).filter(pk=>sum[k][pk]&&(sum[k][pk].q||sum[k][pk].t));if(!keys.length)return '';return `<div><span class="t ${k}">${TYPE[k].n} 합계</span> ${keys.map(pk=>'<b>'+esc(pk)+'</b> '+(sum[k][pk].q+sum[k][pk].t)+'장'+(sum[k][pk].t?' (10T '+sum[k][pk].t+')':'')).join(' · ')}</div>`};
  const sl=sumLine('out')+sumLine('in');if(sl)h+=`<div class="io-sum">${sl}</div>`;
  groupByVehicle(rs).forEach(g=>{const R=dayRecon(g.plate,d);const live=g.recs.filter(r=>r.status!=='void'),voids=g.recs.filter(r=>r.status==='void');const vk=d+'|'+normPlate(g.plate);
    h+=`<div class="io-vh">🚚 ${vehLabel(g.plate)}</div>`+(future?`<div class="io-vh-rc"><span>미리 실은 것 <b>${R.out}</b>장</span><span class="io-veh-diff dim">${d===nextWorkDay(today)?'내일 것':fmtMD(d)+' 것'}</span></div>`:`<div class="io-vh-rc"><span>${reconEq(R)}${reconProdHtml(R)}${reasonHtml(g.plate,d,R)}</span>${verdictTag(R)}</div>`)+live.map(r=>recCard(r,local)).join('');
    if(voids.length)h+=VOID_OPEN[vk]?voids.map(r=>recCard(r,local)).join('')+`<div class="io-void-fold" onclick="ioVoidToggle('${esc(vk)}')">취소된 기록 접기</div>`:`<div class="io-void-fold" onclick="ioVoidToggle('${esc(vk)}')">취소된 기록 ${voids.length}건 보기</div>`});
  return h+'</div>';
}
function renderList(){
  const v=$('ioView');if(!v)return;
  const _now=Date.now();if(_now-_rlT>2000){_rlT=_now;_rlN=0}if(++_rlN>60){if(_rlN===61)console.warn('[io] renderList 과다 호출 차단');return} // 어떤 이유로든 폭주하면 스케줄러를 지키기 위해 멈춤
  const {all,local,ob}=allRecords();
  const from=kstDate(-(LIST_ALL?DAYS:LIST_DAYS));const today=kstDate(0);
  const list=Object.values(all).filter(r=>r&&wd(r)&&wd(r)>=from);
  if(SH.open)renderShare();
  let h=`<div class="io-hd"><h2>📦 입출고</h2><div class="r"><span>${RN}</span><button type="button" class="io-q" onclick="ioHelp()" title="도움말">?</button></div></div>
  <div class="io-start">
    <button type="button" class="out" onclick="ioOpen('out')"><b>${TYPE.out.ico} 출고</b></button>
    <button type="button" class="in" onclick="ioOpen('in')"><b>${TYPE.in.ico} 입고</b></button>
  </div>`;
  if(ob.length){
    const stuck=ob.some(e=>(e.tries||0)>=8);
    h+=`<div class="io-status ${stuck||lastErr?'err':'wait'}"><span>📤 전송 대기 ${ob.length}건${lastErr?' · '+esc(lastErr):''}</span><button type="button" onclick="ioFlush(true)">${flushing?'전송 중…':'지금 보내기'}</button></div>`;
  }
  const days={};list.forEach(r=>{const d=wd(r);(days[d]=days[d]||[]).push(r)});
  // 오늘 작업일 먼저 (항상 펼침)
  if(days[today])h+=dayBlock(today,days[today],local,true);
  else h+=`<div class="io-today-empty">오늘 ${fmtD(today)} 기록 없음</div>`;
  // 내일 이후 작업분 (저녁에 미리 실은 것)
  Object.keys(days).filter(d=>d>today).sort().forEach(d=>{h+=dayBlock(d,days[d],local,true)});
  // 차량별 현황
  h+=renderLedger();
  // 지난 작업일 (접힘)
  Object.keys(days).filter(d=>d<today).sort().reverse().forEach(d=>{h+=dayBlock(d,days[d],local,false)});
  if(!LIST_ALL){const older=Object.values(all).some(r=>r&&wd(r)&&wd(r)<from);if(older)h+=`<button type="button" class="io-more" onclick="ioListMore()">지난 ${DAYS}일 기록 더 보기</button>`}
  v.innerHTML=h;
}
function ioDayToggle(d){DAY_OPEN[d]=!DAY_OPEN[d];renderList()}
function ioVoidToggle(k){VOID_OPEN[k]=!VOID_OPEN[k];renderList()}
function ioListMore(){LIST_ALL=true;renderList()}
function ioView(id){const im=$('ioViewImg');im.src=thumbUrl(id,1600);const a=$('ioViewLink');a.href=viewUrl(id);a.style.display='block';$('ioViewer').classList.add('show')}
function ioViewLocal(id){const e=obGet().find(x=>x.rec&&x.rec.id===id);if(!e||!e.payload||!e.payload.photo)return;$('ioViewImg').src=e.payload.photo;$('ioViewLink').style.display='none';$('ioViewer').classList.add('show')}
function ioViewClose(){$('ioViewer').classList.remove('show');$('ioViewImg').src=''}

/* ---------- 공유 화면 (스크린샷 · 카톡용 텍스트) ---------- */
function shareRecords(){
  const {all,local}=allRecords();
  const recs=Object.values(all).filter(r=>r&&wd(r)===SH.date&&r.status!=='void').sort((a,b)=>(a.ts||0)-(b.ts||0));
  return {recs,local};
}
function ioShare(date){ // 그날 전체 (차량별) — 제출 직후·날짜 공유 버튼 공용
  SH={open:true,date};
  renderShare();$('ioShare').classList.add('show');$('ioShare').scrollTop=0;
}
function ioShareClose(){SH.open=false;$('ioShare').classList.remove('show')}

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
  return TYPE[k].n+' 합계 · '+keys.map(pk=>pk+' '+(sum[k][pk].q+sum[k][pk].t)+'장'+(sum[k][pk].t?'(10T '+sum[k][pk].t+')':'')).join(' · ');
}
function recText(r){
  const T=TYPE[r.type==='in'?'in':'out'];
  const lines=['['+T.n+'] '+hm(r.at)+(r.worker?' · '+r.worker:'')];
  (r.items||[]).forEach(it=>{
    const parts=[['센터',it.cQty],['사이드',it.sQty],['코너',it.kQty],['10T',it.tQty]].filter(x=>num(x[1])>0).map(x=>x[0]+' '+num(x[1])+'장');
    lines.push(it.product+' '+(num(it.total)+num(it.tQty))+'장 ('+parts.join(' · ')+')');
  });
  if(r.note)lines.push('메모: '+r.note);
  if(r.late)lines.push('※ 지연 입력');
  return lines.join('\n');
}
function shareText(){
  const {recs}=shareRecords();if(!recs.length)return '';
  let t='';
  groupByVehicle(recs).forEach(g=>{const who=vehicles()[g.plate]||'';const R=dayRecon(g.plate,SH.date);const pl=reconProdList(R);const rt=reasonText(g.plate,SH.date);t+='🚚 '+g.plate+(who?' · '+who:'')+'\n출고 '+R.out+' − 입고 '+R.inn+' − 시공보고 '+R.sold+' → '+verdictText(R)+(pl.length?'\n'+pl.map(x=>x.txt).join(' · '):'')+(rt?'\n'+rt:'')+'\n\n'+g.recs.map(recText).join('\n\n')+'\n\n──────────\n\n'});
  const sum=sumByProduct(recs);const sl=[sumLineText(sum,'out'),sumLineText(sum,'in')].filter(Boolean);
  t+=fmtD(SH.date)+' 작업일 · '+RN+(sl.length?'\n'+sl.join('\n'):'');
  return t;
}
function renderShare(){
  const box=$('ioShareIn');if(!box||!SH.open)return;
  const {recs,local}=shareRecords();
  let h=`<div class="io-sh-hd"><div><div class="io-sh-t">📦 입·출고</div><div class="io-sh-s">돌봄매트 ${RN} · ${fmtD(SH.date)}</div></div></div>`;
  if(!recs.length){h+=`<div class="io-empty">이날 기록이 없어요.</div>`;box.innerHTML=h;return}
  groupByVehicle(recs).forEach(g=>{
    const R=dayRecon(g.plate,SH.date);
    h+=`<div class="io-sh-veh"><div class="io-sh-vh">🚚 ${vehLabel(g.plate)}</div><div class="io-sh-rc"><span>${reconEq(R)}${reconProdHtml(R)}${reasonHtml(g.plate,SH.date,R,false)}</span>${verdictTag(R)}</div>`;
    g.recs.forEach(r=>{
      const k=r.type==='in'?'in':'out';const lp=local[r.id];const pending=!!lp||r.status==='pending';
      let th;
      if(lp&&lp.photo)th=`<div class="io-sh-th" onclick="ioViewLocal('${esc(r.id)}')"><img src="${lp.photo}" alt=""></div>`;
      else if(r.photoId)th=`<div class="io-sh-th" onclick="ioView('${esc(r.photoId)}')"><img src="${thumbUrl(r.photoId,300)}" alt="" onerror="this.parentNode.innerHTML='사진<br>실패'"></div>`;
      else th=`<div class="io-sh-th">사진<br>전송 중</div>`;
      const items=(r.items||[]).map(it=>{const parts=[['센터',it.cQty],['사이드',it.sQty],['코너',it.kQty],['10T',it.tQty]].filter(x=>num(x[1])>0).map(x=>x[0]+' '+num(x[1]));
        return `<div class="io-sh-line"><b>${esc(it.product)}</b> <b>${num(it.total)+num(it.tQty)}장</b><span class="q">${esc(parts.join(' · '))}</span></div>`}).join('');
      h+=`<div class="io-sh-row"><div class="b"><div class="io-sh-l1"><span class="io-tag ${k}">${TYPE[k].n}</span><b>${esc(hm(r.at))}</b>${r.worker?`<span class="q" style="font-size:12px;color:var(--sub)">${esc(r.worker)}</span>`:''}${pending?'<span class="io-tag wait">사진 전송 중</span>':''}${r.late?'<span class="io-tag late">지연 입력</span>':''}</div>${items}${r.note?`<div class="io-sh-memo">${esc(r.note)}</div>`:''}</div>${th}</div>`;
    });
    h+=`</div>`;
  });
  // 다음 작업일에 쓰려고 미리 실은 것 (오늘 저녁 출고)
  const nd=nextWorkDay(SH.date);const {all:allR}=allRecords();
  const nextRecs=Object.values(allR).filter(r=>r&&wd(r)===nd&&r.type!=='in'&&r.status!=='void').sort((a,b)=>(a.ts||0)-(b.ts||0));
  if(nextRecs.length){h+=`<div class="io-sh-veh" style="border:1px dashed rgba(255,255,255,.14)"><div class="io-sh-vh">📦 ${fmtD(nd)} 것 미리 실음</div>`;
    groupByVehicle(nextRecs).forEach(g=>{const o=sumIO(g.recs,()=>true);h+=`<div class="io-sh-line"><b>${vehLabel(g.plate)}</b> 출고 <b>${o.out}장</b><span class="q">${g.recs.map(r=>(r.items||[]).map(it=>esc(it.product)+' '+(num(it.total)+num(it.tQty))).join(' · ')).join(' · ')}</span></div>`});
    h+=`</div>`}
  const sum=sumByProduct(recs);const parts=['out','in'].map(k=>{const keys=PRODUCTS.map(p=>p.k).filter(pk=>sum[k][pk]&&(sum[k][pk].q||sum[k][pk].t));if(!keys.length)return '';return `<div><span class="t ${k}">${TYPE[k].n} 합계</span>${keys.map(pk=>'<b>'+esc(pk)+'</b> '+(sum[k][pk].q+sum[k][pk].t)+'장'+(sum[k][pk].t?' (10T '+sum[k][pk].t+')':'')).join(' · ')}</div>`}).filter(Boolean);
  if(parts.length)h+=`<div class="io-sh-tot">${parts.join('')}</div>`;
  h+=`<div class="io-sh-note">이 화면을 스크린샷해서 단톡방에 올려주세요.</div>`;
  box.innerHTML=h;
  const cb=$('ioShareCopyBtn');if(cb)cb.disabled=!recs.length;
}
function copyText(text,onOk){
  const fallback=()=>{const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0;font-size:16px';document.body.appendChild(ta);ta.focus();ta.select();try{ta.setSelectionRange(0,999999)}catch(e){}let ok=false;try{ok=document.execCommand('copy')}catch(e){}document.body.removeChild(ta);if(ok)onOk();else ioToast('복사가 안 돼요 · 스크린샷으로 올려주세요',true)};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(onOk).catch(fallback);else fallback();
}
function ioShareCopy(){
  const t=shareText();if(!t){ioToast('복사할 기록이 없어요',true);return}
  copyText(t,()=>ioToast('📋 복사됨 · 카톡에 붙여넣기'));
}

/* ---------- 작성 (장 단위) ---------- */
function newItem(){return {product:'',c:0,s:0,k:0,t:0}}
function ioOpen(type){
  const vs=Object.keys(vehicles());
  const lastV=localStorage.getItem('io_last_vehicle')||'';
  const vehicle=vs.includes(lastV)?lastV:(vs.length===1?vs[0]:'');
  const w=wdOpts(type==='in'?'in':'out');
  F={type:type==='in'?'in':'out',date:kstDate(0),wdate:w.def,wopts:w.opts,dateEdit:false,vehicle,custom:false,worker:vehicle?(vehicles()[vehicle]||''):'',items:[newItem()],note:''};
  P=null;busy=false;
  renderForm();
  $('ioOv').classList.add('show');$('ioOv').scrollTop=0;
}
function ioClose(){
  if(busy)return;
  if(F&&(P||F.items.some(it=>it.product||itemTotal(it)||itemQty(it,'t')))&&!confirm('작성 중인 내용을 지우고 닫을까요?'))return;
  $('ioOv').classList.remove('show');F=null;P=null;$('ioFile').value='';
}
function ioType(t){F.type=t;const w=wdOpts(t);F.wopts=w.opts;if(!F.dateEdit)F.wdate=w.def;renderForm();drawPreview()}
function renderForm(){
  if(!F)return;
  const T=TYPE[F.type];
  $('ioOvTitle').textContent=T.ico+' '+T.n+' 기록';
  const sb=$('ioSubmitBtn');sb.className='io-submit '+F.type;sb.textContent=T.n+' 기록 제출';sb.disabled=busy;
  const vs=vehicles();const plates=Object.keys(vs);
  const emps=employees();
  let h=`<div class="io-seg">
    <button type="button" class="out${F.type==='out'?' on':''}" onclick="ioType('out')">${TYPE.out.ico} 출고</button>
    <button type="button" class="in${F.type==='in'?' on':''}" onclick="ioType('in')">${TYPE.in.ico} 입고</button>
  </div>
  ${F.wdate!==kstDate(0)&&!F.dateEdit?`<div class="io-auto">${F.type==='in'?'아침 입고는 <b>어제 작업하고 남은 것</b>':'저녁 출고는 <b>내일 쓸 것</b>'}으로 기록돼요 · ${fmtD(F.wdate)}</div>`:''}
  <div class="io-sec"><div class="io-lb">사진</div>
    <div class="io-photo${P?' has':''}" id="ioPhotoBox" onclick="ioPickPhoto()">${P?`<img id="ioPrev" alt=""><button type="button" class="re" onclick="event.stopPropagation();ioPickPhoto()">다시 촬영</button>`:`<div class="ph"><div class="i">📷</div><b>촬영</b><small>박스·낱장이 다 보이게</small></div>`}</div>
  </div>
  <div class="io-sec"><div class="io-lb">차량 <small>${plates.length?'':'차량·공정성 탭에 등록된 차량이 없어요'}</small></div>
    <div class="io-chips">${plates.map(p=>`<div class="io-chip${!F.custom&&F.vehicle===p?' on':''}" onclick="ioVehicle('${esc(p)}')">${esc(p)}<small>${esc(vs[p]||'미배정')}</small></div>`).join('')}<div class="io-chip dim${F.custom?' on':''}" onclick="ioVehicleCustom()">직접 입력</div></div>
    ${F.custom?`<input class="io-inp" id="ioVehicleIn" style="margin-top:8px" placeholder="차량번호" value="${esc(F.vehicle)}" oninput="ioVehicleType(this.value)">`:''}
  </div>
  <div class="io-sec"><div class="io-lb">제품 <small>장수로 입력</small></div><div id="ioItems"></div>
    <button type="button" class="io-add" onclick="ioAddItem()">＋ 제품 추가</button>
  </div>
  <div class="io-sec"><div class="io-lb">담당</div>
    <select class="io-sel" id="ioWorker" onchange="ioWorker(this.value)"><option value="">선택</option>${emps.map(n=>`<option value="${esc(n)}"${F.worker===n?' selected':''}>${esc(n)}</option>`).join('')}${F.worker&&!emps.includes(F.worker)?`<option value="${esc(F.worker)}" selected>${esc(F.worker)}</option>`:''}</select>
  </div>
  <div class="io-sec"><div class="io-lb">메모 <small>선택</small></div><input class="io-inp" id="ioNote" placeholder="예) 오후 현장용 추가 적재" value="${esc(F.note)}" oninput="ioNote(this.value)"></div>
  <div class="io-late">${F.dateEdit?`<span>작업일</span><input type="date" id="ioDate" value="${F.wdate}" onchange="ioDateChange(this.value)"><span class="io-tag late">지연 입력</span><span class="lnk" onclick="ioWdate('${wdOpts(F.type).def}')">자동으로</span>`:`<span class="lnk" onclick="ioDateToggle()">지난 날짜 것을 지금 기록 (지연 입력)</span>`}</div>`;
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
    const rows=PART.map(pt=>{const q=itemQty(it,pt.k);
      return `<div class="io-row"><span class="n${pt.k==='t'?' t':''}">${pt.n}</span>
        <span class="u"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" class="${q?'':'z'}" value="${q}" onfocus="ioFocus(this)" onblur="ioBlur(this)" oninput="ioNum(${i},'${pt.k}',this)"><i>장</i></span></div>`}).join('');
    return `<div class="io-pc" id="ioPc_${i}"><div class="io-pc-hd"><b>제품 ${i+1}${p?' · '+esc(p.k):''}</b>${F.items.length>1?`<button type="button" onclick="ioDelItem(${i})">삭제</button>`:''}</div>
      ${chips}
      <div class="io-grid">${rows}</div>
      <div class="io-pc-ft"><span>${p?'1박스 = '+p.per+'장 · 10T '+p.per10+'장':'색상을 먼저 골라주세요'}</span><span>합계 <b id="iot_${i}">${itemTotal(it)}</b>장${itemQty(it,'t')?` <span style="color:var(--purple)">+10T ${itemQty(it,'t')}장</span>`:''}</span></div></div>`;
  }).join('');
}
function updateItemTotals(i){
  const it=F.items[i];
  const t=$('iot_'+i);if(t){t.textContent=itemTotal(it);const ft=t.parentNode;const t10=itemQty(it,'t');const extra=ft.querySelector('span');if(extra)extra.remove();if(t10){const s=document.createElement('span');s.style.color='var(--purple)';s.textContent=' +10T '+t10+'장';ft.appendChild(s)}}
}
function ioNum(i,k,el){const it=F.items[i];if(!it)return;const clean=el.value.replace(/[^0-9]/g,'');if(el.value!==clean)el.value=clean;const v=num(el.value);it[k]=v;updateItemTotals(i);el.classList.toggle('z',!v)}

function ioFocus(el){if(el.value==='0'){el.value='';el.classList.add('z')}try{el.select()}catch(e){}}
function ioBlur(el){if(el.value==='')el.value='0';el.classList.toggle('z',!num(el.value))}
function ioProduct(i,k){F.items[i].product=k;renderItems()}
function ioAddItem(){F.items.push(newItem());renderItems();const el=$('ioPc_'+(F.items.length-1));if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
function ioDelItem(i){if(F.items.length<=1)return;const it=F.items[i];if((it.product||itemTotal(it)||itemQty(it,'t'))&&!confirm('제품 '+(i+1)+'을 지울까요?'))return;F.items.splice(i,1);renderItems()}
function ioNote(v){F.note=v.slice(0,200)}
function ioWdate(d){F.dateEdit=false;F.wdate=d;renderForm()}
function ioDateToggle(){F.dateEdit=true;if(F.wdate>=kstDate(0))F.wdate=prevWorkDay(kstDate(0));renderForm()}
function ioDateChange(v){if(/^\d{4}-\d{2}-\d{2}$/.test(v))F.wdate=v;renderForm()}
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
  const l2=[RN,F.vehicle||'차량 미선택',F.worker||'',TYPE[F.type].n+' ('+TYPE[F.type].sub.replace(/ /g,'')+')',F.wdate&&F.wdate!==kstDate(0,P.at)?'작업일 '+fmtMD(F.wdate):''].filter(Boolean).join('  ·  ');
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
function flatItem(it){ // 시트 형식(박스+낱장+장수)은 그대로 — 장수를 박스당 장수로 나눠 채움
  const p=prod(it.product);const per=p?p.per:0,per10=p?p.per10:0;const o={product:it.product};
  PART.forEach(pt=>{const q=itemQty(it,pt.k);const d=pt.k==='t'?per10:per;const box=d?Math.floor(q/d):0;
    o[pt.k+'Box']=box;o[pt.k+'Ea']=q-box*d;o[pt.k+'Qty']=q});
  o.per=per;o.per10=per10;o.total=itemTotal(it);return o;
}
async function ioSubmit(){
  if(!F||busy)return;
  if(!P){ioToast('사진을 먼저 촬영해주세요',true);$('ioOv').scrollTop=0;return}
  if(!F.vehicle){ioToast('차량을 선택해주세요',true);return}
  const items=[];
  for(let i=0;i<F.items.length;i++){const it=F.items[i];const any=itemTotal(it)||itemQty(it,'t');
    if(!it.product&&!any)continue;
    if(!it.product){ioToast('제품 '+(i+1)+'의 색상을 골라주세요',true);return}
    if(!any){ioToast('제품 '+(i+1)+'의 장수가 비어 있어요',true);return}
    items.push(flatItem(it))}
  if(!items.length){ioToast('제품과 장수를 입력해주세요',true);return}
  busy=true;$('ioSubmitBtn').disabled=true;$('ioSubmitBtn').innerHTML='저장 중…';
  try{
    const now=new Date();const ts=now.getTime();
    const id='io_'+ts+'_'+Math.random().toString(36).slice(2,7);
    const photoGap=Math.max(0,Math.round((P.at.getTime()-P.taken)/60000));
    const late=!F.wopts.some(o=>o[0]===F.wdate);
    const rec={id,region:RN,rk:RK,type:F.type,date:F.date,wdate:F.wdate,at:kstDT(now),ts,vehicle:F.vehicle,worker:F.worker||'',items,note:F.note||'',late,photoAt:kstDT(P.at),photoGap,dev:devId(),ver:IO_VER,status:'pending'};
    const photo=stampCanvas(MAX_PX).toDataURL('image/jpeg',JPG_Q);
    const photoName=F.date+'_'+hm(rec.at).replace(':','')+'_'+RN+'_'+String(F.vehicle).replace(/[\\/:*?"<>|\s]/g,'')+'_'+TYPE[F.type].n+'_'+id+'.jpg';
    const payload={action:'ioLog',id,region:RN,type:F.type,date:F.date,wdate:F.wdate,at:rec.at,vehicle:F.vehicle,worker:rec.worker,items,note:rec.note,late:rec.late,photoAt:rec.photoAt,photoGap,dev:rec.dev,photo,photoName};
    if(!obAdd({kind:'log',id,rec,payload,tries:0,ts})){busy=false;renderForm();return}
    try{db.ref(NODE+'/'+id).set(rec)}catch(e){console.warn('[io] fb set',e)}
    localStorage.setItem('io_last_vehicle',F.vehicle);
    busy=false;F=null;P=null;$('ioFile').value='';$('ioOv').classList.remove('show');
    ioToast('✅ '+TYPE[rec.type].n+' 기록 저장 · 사진 전송 중');
    renderList();ioFlush(false);
    ioShare(rec.wdate>kstDate(0)?kstDate(0):rec.wdate); // 저장 직후 그 작업일 전체 화면 (내일 것 실은 건 오늘 화면에 '내일 실은 것'으로 같이) — 스크린샷해서 단톡방에
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
  try{db.ref(NODE).orderByChild('date').startAt(kstDate(-DAYS)).limitToLast(600).on('value',snap=>{const o={};snap.forEach(ch=>{o[ch.key]=ch.val()});LOGS=o;renderList()})}
  catch(e){console.warn('[io] fb listen',e);renderList()}
  try{db.ref('io_recon/'+RK).orderByKey().startAt(kstDate(-DAYS)).on('value',snap=>{RECON=snap.val()||{};renderList();if(SH.open)renderShare()})}catch(e){console.warn('[io] recon listen',e)}
  window.addEventListener('online',()=>ioFlush(false));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&obGet().length)ioFlush(false)});
  setInterval(()=>{if(obGet().length&&!flushing)ioFlush(false)},90000);
  if(obGet().length)setTimeout(()=>ioFlush(false),1500);
}
Object.assign(window,{ioShare,ioShareClose,ioShareCopy,ioShow,ioHelp,ioHelpClose,ioOpen,ioClose,ioType,ioPickPhoto,ioPhotoChange,ioDateToggle,ioDateChange,ioWdate,ioVehicle,ioVehicleCustom,ioVehicleType,ioWorker,ioProduct,ioNum,ioFocus,ioBlur,ioAddItem,ioDelItem,ioNote,ioSubmit,ioVoid,ioFlush,ioView,ioViewLocal,ioViewClose,ioLedgerToggle,ioLedgerReload,ioListMore,ioDayToggle,ioVoidToggle,ioReasonOpen,ioReasonPick,ioReasonNote,ioReasonClose,ioReasonSave,ioReasonDelete});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
