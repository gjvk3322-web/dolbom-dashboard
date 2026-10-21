/* 돌봄매트 스케줄러 — 프로세스 탭 상단 "직원별 작업·AS·로스" 통합표 (부산·경기 공용, 2026-10-21)
   ■ 목적: 부산·경기 전 직원이 같은 표를 본다 — 11월 작업부터 본인이 몇 집 했고, 그 작업에서 AS가 몇 건 났는지, 로스가 얼마인지.
   ■ 기준(대장 결정 2026-10-21)
     · 집계 시작 ST_START = 2026-11-01 (작업일 기준). 그 전 시공은 작업 수에도, AS 분모·분자에도 안 들어감.
     · 작업 = 시공스케줄(부산+경기) 오전/오후 건에서 사수·부사수로 적힌 사람 (차단·주소 없는 행 제외, 오늘까지).
     · AS = 시간 'AS' 행 중 구분이 '유상수리'가 아닌 것(제품하자·시공하자·기타, 구분 빈칸 포함). 고객 전화번호(뒤 8자리)로
       그 AS보다 앞선 가장 최근 오전/오후 시공을 찾아 그 시공의 사수·부사수에게 1건씩. 원시공이 ST_START 전이면 '이전 시공분'으로 따로 센다.
       → 월 선택은 "작업한 달" 기준: 11월 AS율 = 11월 시공에서 난 AS ÷ 11월 시공 수 (AS는 보통 1~3개월 뒤에 나오므로 초반엔 낮게 보임).
     · 로스 = 입출고 탭 '직원별 로스 기록'과 같은 숫자(iocycle ledgerAll). 각 지역 폰이 자기 지역 요약을 Firebase io_stats/{bs|gg}/{YYYY-MM}에
       올려 두고, 표는 양쪽을 읽어 합친다. 로스율 = 로스(−분) ÷ 판매.
   ■ 속도: 프로세스 탭을 열 때만 계산. 시트 CSV는 앱이 이미 받은 것(fetchPrevHistory 5분 캐시)을 재사용, Firebase는 io_stats 두 노드 +
     직원 명단 두 노드만 읽음(10분 캐시). 몇 년 쌓여도 행 수에 비례하는 단순 루프라 수십 ms.
   ■ 로드: scheduler.html·scheduler-gg.html에서 guide.js 다음에 <script src="./stats.js?v=…"> — gShow(프로세스 탭 열기)를 감싸서 동작. */
(function(){
'use strict';
const ST_VER='2026.10.21a';
const ST_START='2026-11-01';
const RK=/scheduler-gg/i.test(location.pathname)?'gg':'bs';
const CACHE_MS=10*60*1000;
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const kst=off=>new Date(Date.now()+9*3600e3+(off||0)*86400e3).toISOString().slice(0,10);
const nn=v=>{const x=Number(v);return Number.isFinite(x)?x:0};

let ym=(function(){const t=kst(0);return t<ST_START?ST_START.slice(0,7):t.slice(0,7)})(); // 보는 달. 11월 전에는 11월을 보여줌
let cum=false;            // 누적(ST_START~) 보기
let openName='';          // 펼친 사람
let EMP={bs:null,gg:null},empAt=0;
let STATS={bs:null,gg:null},statsAt=0;
let hist=null,histAt=0;   // fetchPrevHistory 결과
let busy=false,err='';
let pollT=null,pollN=0;

const CSS=`
#stView{background:var(--card);border-radius:18px;padding:14px 14px 10px;margin:0 0 14px}
#stView .st-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
#stView .st-title{font-size:15px;font-weight:800;color:var(--text)}
#stView .st-sub{font-size:11px;color:var(--dim);margin-top:2px}
#stView .st-nav{display:flex;align-items:center;gap:6px}
#stView .st-nav button{background:var(--card2);border:none;color:var(--text);border-radius:9px;padding:6px 10px;font-size:13px;font-weight:700;font-family:var(--font);cursor:pointer}
#stView .st-nav .ym{min-width:62px;text-align:center;font-size:13px;font-weight:800;color:var(--text)}
#stView .st-nav button.on{background:var(--text);color:var(--bg)}
#stView table{width:100%;border-collapse:collapse;font-size:12px}
#stView th{font-size:10px;font-weight:700;color:var(--dim);text-align:right;padding:6px 3px;border-bottom:1px solid var(--border);white-space:nowrap}
#stView th:first-child,#stView td:first-child{text-align:left}
#stView td{padding:7px 3px;text-align:right;color:var(--text);border-bottom:1px solid var(--border);white-space:nowrap;font-variant-numeric:tabular-nums}
#stView tr.reg td{background:var(--card2);color:var(--dim);font-size:10px;font-weight:800;text-align:left;padding:4px 6px;letter-spacing:.3px}
#stView tr.p{cursor:pointer}
#stView tr.p.on td{background:rgba(255,255,255,.03)}
#stView .nm{font-weight:800}
#stView .b{color:var(--red);font-weight:800}
#stView .g{color:var(--green);font-weight:800}
#stView .d{color:var(--dim)}
#stView .det td{white-space:normal;text-align:left;font-size:11px;color:var(--sub);padding:4px 6px 8px;background:rgba(255,255,255,.02)}
#stView .det .r{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dashed var(--border)}
#stView .det .r:last-child{border-bottom:none}
#stView .st-foot{font-size:10.5px;color:var(--dim);margin-top:8px;line-height:1.5}
#stView .st-msg{padding:18px 6px;text-align:center;color:var(--dim);font-size:12px}
`;

/* ---------- 데이터 ---------- */
function loadEmployees(){
  if(EMP.bs&&EMP.gg&&Date.now()-empAt<CACHE_MS)return Promise.resolve(EMP);
  const rd=k=>db.ref(k).once('value').then(s=>{const v=s.val();return Array.isArray(v)?v.filter(Boolean):(v&&typeof v==='object')?Object.values(v).filter(Boolean):[]}).catch(()=>[]);
  return Promise.all([rd('employees'),rd('gg_employees')]).then(([bs,gg])=>{EMP={bs,gg};empAt=Date.now();return EMP});
}
function loadStats(){
  if(STATS.bs&&STATS.gg&&Date.now()-statsAt<CACHE_MS)return Promise.resolve(STATS);
  const rd=k=>db.ref('io_stats/'+k).once('value').then(s=>s.val()||{}).catch(()=>({}));
  return Promise.all([rd('bs'),rd('gg')]).then(([bs,gg])=>{STATS={bs,gg};statsAt=Date.now();return STATS});
}
function loadHist(){
  if(hist&&Date.now()-histAt<CACHE_MS)return Promise.resolve(hist);
  if(typeof fetchPrevHistory!=='function')return Promise.reject(new Error('fetchPrevHistory 없음'));
  return fetchPrevHistory().then(h=>{hist=h||[];histAt=Date.now();return hist});
}
// 내 지역 로스 요약을 io_stats/{RK}에 올림 — iocycle이 준비될 때까지 1.5초 간격으로 최대 20회 시도
function publishMine(){
  clearTimeout(pollT);
  if(!window.ioCycle||typeof ioCycle.statsMonthly!=='function'){
    try{if(window.__io&&typeof __io.board==='function')__io.board()}catch(e){}
    if(pollN++<20)pollT=setTimeout(publishMine,1500);return;
  }
  let m=null;try{m=ioCycle.statsMonthly()}catch(e){console.warn('[stats]',e);return}
  if(!m){if(pollN++<20)pollT=setTimeout(publishMine,1500);return}
  pollN=0;
  const up={};Object.keys(m).forEach(k=>{if(k>=ST_START.slice(0,7))up[k]={at:kst(0),people:m[k]}});
  if(!Object.keys(up).length)return;
  const cur=STATS[RK]||{};
  if(JSON.stringify(cur)!==JSON.stringify(Object.assign({},cur,up))){
    STATS[RK]=Object.assign({},cur,up);
    try{db.ref('io_stats/'+RK).update(up)}catch(e){}
    render();
  }
}

/* ---------- 계산 ---------- */
function p8(v){return String(v||'').replace(/[^0-9]/g,'').slice(-8)}
function crew(r){const a=[r.sasu].concat(String(r.busasu||'').split(/[,·\/]/));return a.map(x=>String(x||'').trim()).filter(Boolean)}
function isWork(r){if(!(r.time==='오전'||r.time==='오후'))return false;const a=String(r.addr||'').trim();if(!a)return false;if(/예약\s*[xX✕×]/.test(a))return false;return true}
function calc(){
  const today=kst(0);const rows=hist||[];
  const inRange=d=>cum?(d>=ST_START&&d<=today):(d.slice(0,7)===ym&&d>=ST_START&&d<=today);
  const P={};const get=(reg,n)=>{const k=reg+'|'+n;return P[k]||(P[k]={reg,n,work:0,as:0,asList:[],net:0,used:0,lossN:0,asLoss:0})};
  // 작업 수
  const works=rows.filter(isWork);
  works.forEach(r=>{if(!inRange(r.date))return;crew(r).forEach(n=>get(r.region,n).work++)});
  // AS → 원시공
  const byPh={};works.forEach(r=>{if(!r.ph8)return;(byPh[r.ph8]=byPh[r.ph8]||[]).push(r)});
  Object.values(byPh).forEach(a=>a.sort((x,y)=>x.date<y.date?-1:x.date>y.date?1:0));
  let asOld=0,asNone=0,asPaid=0,asAll=0;
  rows.forEach(r=>{
    if(String(r.time||'').trim().toUpperCase()!=='AS')return;
    if(r.date<ST_START||r.date>today)return;
    asAll++;
    if(/유상/.test(String(r.category||''))){asPaid++;return}
    const cand=(byPh[r.ph8]||[]).filter(x=>x.date<r.date);
    const o=cand[cand.length-1];
    if(!o){asNone++;return}
    if(o.date<ST_START){asOld++;return}
    if(!inRange(o.date))return;
    crew(o).forEach(n=>{const p=get(o.region,n);p.as++;p.asList.push({date:r.date,cat:r.category||'구분 없음',addr:String(r.addr||'').replace(/\(.*?\)/g,'').trim().split(' ').slice(0,3).join(' '),orig:o.date})});
  });
  // 로스 (io_stats)
  ['bs','gg'].forEach(k=>{const reg=k==='gg'?'경기':'부산';const S=STATS[k]||{};
    Object.keys(S).forEach(m=>{if(!(cum?m>=ST_START.slice(0,7):m===ym))return;const pp=S[m]&&S[m].people||{};
      Object.keys(pp).forEach(n=>{const v=pp[n]||{};const p=get(reg,n);p.net+=nn(v.net);p.used+=nn(v.used);p.lossN+=nn(v.n);p.asLoss+=nn(v.as)})});
  });
  // 명단: 팀설정 직원 + 기록에 등장한 사람
  const names={부산:(EMP.bs||[]).slice(),경기:(EMP.gg||[]).slice()};
  Object.values(P).forEach(p=>{if(names[p.reg]&&names[p.reg].indexOf(p.n)<0)names[p.reg].push(p.n)});
  const out=[];['부산','경기'].forEach(reg=>{(names[reg]||[]).forEach(n=>out.push(get(reg,n)))});
  return {list:out,asAll,asPaid,asOld,asNone};
}

/* ---------- 화면 ---------- */
function ymLabel(){const [y,m]=ym.split('-');return (+m)+'월'}
function pct(a,b){return b?Math.round(a/b*1000)/10:null}
function render(){
  const v=document.getElementById('stView');if(!v)return;
  const t=kst(0);
  const head=`<div class="st-hd"><div><div class="st-title">직원별 작업 · AS · 로스</div><div class="st-sub">부산·경기 전원 · ${esc(ST_START.slice(5,7).replace(/^0/,''))}월 작업부터 · ${cum?'누적':'작업한 달 기준'}</div></div>
    <div class="st-nav">${cum?'':`<button onclick="dolbomStats.prev()">‹</button><span class="ym">${esc(ymLabel())}</span><button onclick="dolbomStats.next()">›</button>`}<button class="${cum?'on':''}" onclick="dolbomStats.cum()">누적</button></div></div>`;
  if(busy&&!hist){v.innerHTML=head+'<div class="st-msg">불러오는 중…</div>';return}
  if(err&&!hist){v.innerHTML=head+'<div class="st-msg">'+esc(err)+'<br><u onclick="dolbomStats.refresh(1)" style="cursor:pointer">다시 시도</u></div>';return}
  const R=calc();
  let rowsH='';let lastReg='';
  R.list.forEach(p=>{
    if(p.reg!==lastReg){lastReg=p.reg;rowsH+=`<tr class="reg"><td colspan="7">${esc(p.reg)}</td></tr>`}
    const ar=pct(p.as,p.work);const lr=p.used?Math.round(Math.max(0,-p.net)/p.used*1000)/10:null;
    const on=openName===p.reg+'|'+p.n;
    rowsH+=`<tr class="p${on?' on':''}" onclick="dolbomStats.open('${esc(p.reg+'|'+p.n)}')">
      <td class="nm">${esc(p.n)}</td>
      <td>${p.work||'<span class="d">–</span>'}</td>
      <td class="${p.as?'b':''}">${p.as||'<span class="d">0</span>'}</td>
      <td class="${ar!=null&&ar>0?'b':'d'}">${ar==null?'–':ar+'%'}</td>
      <td>${p.used||'<span class="d">–</span>'}</td>
      <td class="${p.net<0?'b':p.net>0?'g':'d'}">${p.lossN||p.asLoss?(p.net>0?'+':'')+p.net:'–'}</td>
      <td class="${lr!=null&&lr>3?'b':'d'}">${lr==null?'–':lr+'%'}</td></tr>`;
    if(on){
      const det=p.asList.length?p.asList.sort((a,b)=>a.date<b.date?-1:1).map(a=>`<div class="r"><span>${esc(a.date.slice(5).replace('-','/'))} <b>${esc(a.cat)}</b> · ${esc(a.addr)}</span><span class="d">시공 ${esc(a.orig.slice(5).replace('-','/'))}</span></div>`).join(''):'<div class="d">이 기간 작업에서 난 AS 없음</div>';
      const loss=(p.lossN||p.asLoss)?`<div class="r"><span>로스 ${p.net>0?'+':''}${p.net}장 = 판매 ${p.used}장 기준${p.asLoss?` · 시공하자 AS 무상 ${p.asLoss}장 포함`:''}</span><span class="d">입출고 탭 직원별 기록과 동일</span></div>`:'';
      rowsH+=`<tr class="det"><td colspan="7">${det}${loss}</td></tr>`;
    }
  });
  const foot=[];
  if(R.asAll)foot.push(`이 기간 접수 AS ${R.asAll}건 중 유상수리 ${R.asPaid}건 제외${R.asOld?` · ${ST_START.slice(5,7).replace(/^0/,'')}월 전 시공분 ${R.asOld}건은 미집계`:''}${R.asNone?` · 원시공 못 찾음 ${R.asNone}건`:''}`);
  foot.push('AS는 제품하자·시공하자·기타 모두 포함(유상수리만 제외) · 고객 번호로 원래 시공팀을 찾아 그 팀에 1건씩 · 로스율 = 로스 ÷ 판매');
  const mine=STATS[RK]&&Object.keys(STATS[RK]).length;
  if(!mine)foot.push('로스 숫자는 입출고 기록이 쌓이면 표시됨');
  v.innerHTML=head+`<table><thead><tr><th>이름</th><th>작업</th><th>AS</th><th>AS율</th><th>판매</th><th>로스</th><th>로스율</th></tr></thead><tbody>${rowsH||'<tr><td colspan="7" class="st-msg">표시할 직원이 없어요</td></tr>'}</tbody></table><div class="st-foot">${foot.map(esc).join('<br>')}</div>`;
}
function refresh(force){
  if(force){hist=null;statsAt=0;empAt=0}
  busy=true;err='';render();
  Promise.all([loadEmployees(),loadStats(),loadHist()]).then(()=>{busy=false;render();pollN=0;publishMine()}).catch(e=>{busy=false;err='시트를 불러오지 못했어요 ('+(e&&e.message||e)+')';render()});
}
function ensureShell(){
  if(document.getElementById('stView'))return true;
  const pane=document.getElementById('p-guide');if(!pane)return false;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  const box=document.createElement('div');box.id='stView';
  pane.insertBefore(box,pane.firstChild);
  return true;
}
function show(){if(!ensureShell())return;if(!hist||Date.now()-histAt>CACHE_MS)refresh();else{render();publishMine()}}
function shiftYm(d){const [y,m]=ym.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1+d,1));const n=dt.toISOString().slice(0,7);const max=kst(0).slice(0,7);if(n<ST_START.slice(0,7)||n>max)return;ym=n;openName='';render()}
window.dolbomStats={ver:ST_VER,show,refresh,prev:()=>shiftYm(-1),next:()=>shiftYm(1),cum:()=>{cum=!cum;openName='';render()},open:k=>{openName=openName===k?'':k;render()}};
// 프로세스 탭 열기(gShow)에 끼워 넣음 — guide.js 다음에 로드돼야 함
function hook(){const g=window.gShow;if(typeof g!=='function'){setTimeout(hook,300);return}
  if(g.__st)return;const w=function(){const r=g.apply(this,arguments);try{show()}catch(e){console.warn('[stats]',e)}return r};w.__st=1;window.gShow=w;
  const p=document.getElementById('p-guide');if(p&&p.classList.contains('on'))try{show()}catch(e){}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook);else hook();
})();
