/* iocycle.js — 돌봄매트 입출고 '순환' 기준 팀 카드 (부산·경기 공용) · v1 2026-09-30
   iolog.js(window.__io) 다음, ioadmin.js 다음에 불러옴 (iolog.js loadBoard가 순서대로 붙임).

   ■ 순환(cycle) = 차량 기준으로 "출고를 찍은 순간 ~ 반납(입고)을 찍은 순간"
     · 출고를 여러 번 찍어도 반납 전이면 같은 순환에 누적 (차 잔량 = 누적 출고 − 사용)
     · 반납을 찍으면 순환이 닫힘. 규칙: 남은 매트는 무조건 반납 후 다시 출고 (이월·인계 없음). 다 써서 0장이면 [반납 0장]으로 닫음
     · 반납 뒤 새 출고가 오면 새 순환 시작. 반납이 여러 번이면(부분 반납) 다음 출고 전까지 전부 같은 순환
   ■ 사용(자동) = 순환 기간(첫 출고 작업일 ~ 마지막 반납 작업일, 열려 있으면 오늘)에 이 차량으로 잡힌 시공보고 판매갯수(시공스케줄 Y열)
     + AS보고서(Firebase asReports)의 '들어간 장수' — 결제 무료면 A(무상 AS), 유상이면 판매로. '자투리사용'은 0장
     시공 연결: 시트 L열 차량번호 우선, 없으면 그 순환 담당 2명 중 한 명이 사수인 건. 틀리면 카드에서 빼고 넣을 수 있음
   ■ 로스 = 출고 − (판매 + 무상 AS) − 반납   (제품·색상 합계 기준, 형태는 안 봄)
     양수 = 로스(안 돌아옴), 음수 = 자투리 활용(가져간 것보다 더 깔았음 → 개인 기록에 +). 시공보고 미입력·AS보고 미제출·반납 전이면 확정 안 함
   ■ 개인 기록 = 반납 + 사용 − 출고 (로스는 −, 자투리는 +). 시공하자 AS를 무료로 하며 새 매트가 들어가면 그 장수는 AS보고서의 이전 작업자에게 −로 기록
   ■ 개인 적용 = 그 순환의 담당 2명(출고 때 자동, 카드에서 변경) 각각에 같은 로스·자투리를 '공동작업 기준'으로 표시. 회사 집계는 1번
   ■ 저장 (원본 io_logs는 안 건드림): Firebase io_cycle/{bs|gg}/{차량키}/{시작ts} = {crew:[a,b], add:{jobId:1}, del:{jobId:1}, scrap:{제품:장}, confirm:{by,at}, by, at}
     차량 기준 설정: io_cycle/{bs|gg}/{차량키}/_veh = {crew:[..], crewByDate:{날짜:[..]}, add:{jobId:1}, del:{jobId:1}} — 갈 현장 넣기·빼기, 특정 날짜 담당 고정
   ■ 담당(그날 실제 팀)은 스케줄에서 자동: 그 날짜에 이 차량(시트 L열 차량번호, 없으면 차량 탭 사수)으로 잡힌 시공의 사수·부사수.
     우선순위: 순환별 수정 > 날짜별 수정(_veh.crewByDate) > 스케줄 > 출고 때 적은 담당 > 차량 기본(_veh.crew > 차량 탭 사수 + 팀설정 짝)
   ■ 시공 연결은 차량번호 기준(없으면 사수=차량 탭 사수). 닫힌 순환에 쓰인 시공은 다음 순환에 다시 안 붙고, 다른 차량 카드에서 수동으로 가져간 시공은 이 차량에서 빠짐
     (2026-10-02) [수정]에서 수동으로 넣은 시공은 앞 순환의 자동 연결보다 우선 · 반납만 있는 순환(출고 없음)은 시공을 안 가져감 ·
     같은 작업일에 순환이 둘이면: 앞 순환이 그날 정오 전에 반납으로 닫혔을 때(아침에 남은 걸 반납하고 다시 실음)만 그날 시공을 뒤 순환에 넘김, 저녁에 닫혔으면 앞 순환 것(뒤 출고는 작업일 실수)
   ■ 카드는 달력 날짜 기준(2026-10-01u): 그 날짜가 들어가는 순환을 보여 주고(열린 순환은 뒤로 계속), 없으면 '출고 전' + 그날 갈 현장. 출고 작업일 = 달력 날짜, 반납 작업일 = 그 순환의 마지막 작업일.
     내일 실을 땐 달력을 내일로 옮겨 [출고]. 닫힌 순환 카드엔 다음 시공일로 가는 링크, 순환 없는 날엔 지난 순환·미리 찍은 출고 링크
     (2026-10-02b) '오늘' 날짜에서 정오 이후에 찍는 출고는 다음 시공일 것(버튼에 '출고 · 10/3') — 싣는 건 늘 전날 저녁이라서. 오전엔 오늘 것
   ■ 순환 묶기 규칙(2026-10-02b): 작업일이 더 뒤인 출고는 새 순환으로 시작(앞 순환은 반납이 오면 닫힘) · 반납의 작업일이 열린 순환의 첫 작업일보다 앞서면 앞 순환으로 감(저녁에 내일 것 출고 → 오늘 남은 것 반납 순서여도 됨) ·
     반납 없이 열린 순환 뒤에 또 순환이 생기면 다음 순환에 합침(2박 출장·반납 누락). 당번은 기록 수정에서 작업일을 바꿀 수 있음
   ■ 직원별 누적은 Firebase io_ledger/{bs|gg}에 '지난달까지' 저장본을 두고(매달 10일부터, 처음 여는 폰이 자동 저장) 그 뒤 기록만 읽어 더함 — 기록이 쌓여도 열 때 읽는 양이 안 늘어남.
     저장은 매번 전체 기록으로 다시 계산하므로 옛 기록을 고치면 다음 달 저장 때 반영, 당장 반영하려면 당번 모드 [다시 계산]
   ■ 자투리 입력·확정은 당번 모드. 담당 변경·시공 연결 수정은 누구나 */
(function(){
'use strict';
const X=window.__io;
if(!X||!X.util||!X.records){console.warn('[iocycle] iolog.js v27+ 필요');return}
const U=X.util,PRODUCTS=X.PRODUCTS,PART=X.PART,RK=X.RK,RN=X.RN;
const $=id=>document.getElementById(id),esc=U.esc;
const NODE=(X.beta?'io_cycle_beta/':'io_cycle/')+RK;
const CY_VER='2026.10.02b';
const CY_START='2026-09-30'; // 순환 시작일 — 이 날 이전 기록은 '반납→출고' 규칙 전이라 순환에서 제외 (옛 테스트 기록이 카드를 오염시키지 않게)
const NP=p=>U.normPlate(p)||'_';
const nn=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
let OV={};          // 오버라이드 {plateKey:{startTs:{...}}}
let AS={};          // asReports 캐시 {jobId: rec|null}
let asWait={};      // 불러오는 중
let SEL=null;       // 모달이 잡은 순환 {plate,startTs}
let HIST_OPEN={};   // 지난 순환 펼침 {plateKey:true}
let REP=null;       // 보고 화면 {plate,startTs}
let PSEL=(function(){try{return localStorage.getItem('io_person')||''}catch(e){return ''}})(); // 직원별 달력에서 고른 사람
let PPL_OPEN=(function(){try{return localStorage.getItem('io_ppl_open')==='1'}catch(e){return false}})(); // 직원별 섹션 펼침 — 펼친 폰만 전체 기록을 내려받음

/* ---------- 데이터 ---------- */
function admin(){try{return X.admin()}catch(e){return false}}
function vehicles(){try{return X.vehicles()}catch(e){return {}}}
function emps(){try{return X.employees()}catch(e){return []}}
function teamsArr(){try{return Array.isArray(teams)?teams:[]}catch(e){return []}}
function partnerOf(name){const t=teamsArr().find(t=>Array.isArray(t)&&t.indexOf(name)>=0);if(!t)return '';return t.filter(m=>m&&m!==name)[0]||''}
function teamNo(names,plate){ // 팀 번호: 차량 탭 사수가 속한 팀 > 담당과 가장 많이 겹치는 팀(사수 자리가 같으면 우선). 한 명이 두 팀을 오가도 안 겹침
  const T=teamsArr().map(t=>Array.isArray(t)?t.filter(Boolean):[]);
  if(plate){const o=ownerOf(plate);if(o){let i=T.findIndex(t=>t[0]===o);if(i<0)i=T.findIndex(t=>t.indexOf(o)>=0);if(i>=0)return i+1}}
  // 차량 탭 사수가 없으면: 그 팀의 사수(맨 앞 사람)가 담당에 있어야 그 팀. 부사수만 겹치는 임시 조합(승민·경준 등)은 팀 번호 없음
  let best=0,bi=0;(names||[]).length&&T.forEach((t,i)=>{if(!t.length||names.indexOf(t[0])<0)return;const sc=names.filter(n=>n&&t.indexOf(n)>=0).length;if(sc>best){best=sc;bi=i+1}});
  return bi;
}
function records(){try{return X.records().all||{}}catch(e){return {}}}
let MREC={};        // 기록 캐시 {all:{id:rec}, from:'기록일'} — 직원별 장부용. iolog는 최근 14일만 들고 있어서 from 이후를 따로 읽음
let MLOAD={};
function loadRecs(from){ // io_logs를 from(기록일) 이후로 한 번 읽어 캐시. 더 이른 from이 필요해지면 다시 읽음. 이후 변경은 iolog 실시간 기록과 병합
  from=from||CY_START;
  if(MLOAD.all||(MREC.from&&MREC.from<=from))return;MLOAD.all=1;
  const fail=()=>{MREC.all=MREC.all||{};MREC.from=from;delete MLOAD.all;rerender()};
  try{db.ref('io_logs/'+RK).orderByChild('date').startAt(from).once('value').then(s=>{const o={};s.forEach(ch=>{o[ch.key]=ch.val()});MREC.all=o;MREC.from=from;delete MLOAD.all;rerender()}).catch(fail)}catch(e){fail()}
}
function recordsAll(){const o=Object.assign({},MREC.all||{});const live=records();Object.keys(live).forEach(k=>{o[k]=live[k]});return o}
function jobs(){try{return X.jobs()}catch(e){return []}}
function parseQty(q){const s=String(q||'');if(/자투리/.test(s))return 0;const m=s.match(/\d+/);return m?+m[0]:0}
function recQty(r){return (r.items||[]).reduce((a,it)=>a+nn(it.total)+nn(it.tQty),0)}
function recByProd(r,into){(r.items||[]).forEach(it=>{const k=it.product||'?';into[k]=(into[k]||0)+nn(it.total)+nn(it.tQty)})}
function crewOf(r){if(Array.isArray(r.crew)&&r.crew.length)return r.crew.filter(Boolean).slice(0,3);const w=r.worker||'';return w?[w,partnerOf(w)].filter(Boolean):[]}
function arr(v){return Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v):[])} // Firebase가 배열을 객체로 줄 때 대비
function splitNames(v){return String(v||'').split(/[,·\/]/).map(x=>x.trim()).filter(Boolean)}
function orderCrew(names){ // 표시 순서 = 팀설정 기준: 팀설정 사수(맨 앞 사람)가 있으면 먼저, 나머지는 팀 번호·팀 내 순서 (시트 사수 칸이 입사일 순이어도 카드는 팀설정대로)
  const T=teamsArr().map(t=>Array.isArray(t)?t:[]);
  const pos=n=>{for(let i=0;i<T.length;i++){const k=T[i].indexOf(n);if(k>=0)return i*100+k}return 9999};
  const lead=names.find(n=>T.some(t=>t[0]===n));
  const rest=names.filter(n=>n!==lead).slice().sort((a,b)=>pos(a)-pos(b));
  return lead?[lead].concat(rest):rest;
}
function crewFromJobs(list){const out=[];list.forEach(j=>{splitNames(j.sasu).concat(splitNames(j.busasu)).forEach(n=>{if(out.indexOf(n)<0)out.push(n)})});return orderCrew(out).slice(0,3)}
function ownerOf(plate){const np=NP(plate);const V=vehicles();const k=Object.keys(V).find(p=>NP(p)===np);return k?String(V[k]||'').trim():''} // 차량 탭에 적힌 사수
function asOf(id){ // AS보고서 — 없으면 한 번 불러오고 도착하면 다시 그림
  if(id in AS)return AS[id];
  if(asWait[id])return undefined;asWait[id]=1;
  try{db.ref('asReports/'+id).once('value').then(s=>{AS[id]=s.val()||null;delete asWait[id];rerender()}).catch(()=>{AS[id]=null;delete asWait[id]})}catch(e){AS[id]=null}
  return undefined;
}
function rerender(){try{if(window.ioAdmin&&ioAdmin.mount)ioAdmin.mount()}catch(e){}try{if(REP)renderReport()}catch(e){}}
function ovOf(cy){return ((OV[NP(cy.plate)]||{})[String(cy.startTs)])||{}}
function vehOv(plate){return (OV[NP(plate)]||{})._veh||{}}
function vehCrew(plate){const v=vehOv(plate);const c=arr(v.crew).filter(Boolean);if(c.length)return c.slice(0,3);const o=ownerOf(plate);return o?[o,partnerOf(o)].filter(Boolean):[]} // 차량 기본 담당
function claimedElsewhere(id,plate){ // 다른 차량 카드에서 수동으로 가져간 시공이면 true (이중 집계 방지)
  const np=NP(plate);
  return Object.keys(OV).some(pk=>{if(pk===np)return false;const o=OV[pk]||{};if(o._veh&&o._veh.add&&o._veh.add[id])return true;return Object.keys(o).some(k=>k!=='_veh'&&o[k]&&o[k].add&&o[k].add[id])});
}
function schedJobs(plate,date){ // 그 날짜에 이 차량이 가는 시공 (스케줄 차량번호 기준 + 카드에서 넣고 뺀 것 반영)
  const vo=vehOv(plate);const add=vo.add||{},del=vo.del||{};
  return jobs().filter(j=>j&&jobOK(j)&&j.date===date&&!del[j.id]&&(jobMatches(j,plate)||add[j.id])&&!claimedElsewhere(j.id,plate)).sort((a,b)=>String(a.time).localeCompare(String(b.time)));
}
function crewFor(plate,date,seed){ // 그 날짜 이 차량의 담당 — 날짜별 수정 > 스케줄 > seed(출고 때 적은 담당) > 차량 기본
  const bd=arr((vehOv(plate).crewByDate||{})[date]).filter(Boolean);if(bd.length)return orderCrew(bd).slice(0,3);
  const c=crewFromJobs(schedJobs(plate,date));if(c.length)return c;
  if(seed&&seed.length)return orderCrew(seed);return vehCrew(plate);
}
function upcomingOf(plate,from,skip){ // 선택 날짜 이후 이 차량의 첫 시공일과 그날 갈 현장 (skip: 이미 순환에 쓰인 시공 id)
  const dates=[];jobs().forEach(j=>{if(j&&jobOK(j)&&j.date>=from&&dates.indexOf(j.date)<0)dates.push(j.date)});dates.sort();
  for(const d of dates){const l=schedJobs(plate,d).filter(j=>!skip||!skip.has(j.id));if(l.length)return {date:d,list:l}}
  return {date:'',list:[]};
}
function saveVeh(plate,patch){
  const o=Object.assign({},patch,{by:(localStorage.getItem('io_admin_name')||'').trim()||'',at:U.kstDT(new Date()),ver:CY_VER});
  return db.ref(NODE+'/'+NP(plate)+'/_veh').update(o);
}
function save(cy,patch){
  const o=Object.assign({},patch,{by:(localStorage.getItem('io_admin_name')||X.myPlate&&vehicles()[X.myPlate()]||'').trim()||'',at:U.kstDT(new Date()),plate:cy.plate,ver:CY_VER});
  return db.ref(NODE+'/'+NP(cy.plate)+'/'+cy.startTs).update(o);
}

/* ---------- 순환 만들기 ---------- */
function cyclesOf(plate,recMap,seed){ // seed: 앞서(저장본에서) 이미 정산된 시공 id — 이 차량의 새 순환에 다시 안 붙음
  const np=NP(plate);const today=U.kstDate(0);
  const recs=Object.values(recMap||records()).filter(r=>r&&r.status!=='void'&&NP(r.vehicle)===np&&r.ts&&String(r.date||'')>=CY_START).sort((a,b)=>a.ts-b.ts);
  const list=[];let cur=null;const consumed=new Set(seed||[]);
  const mk=r=>({plate:r.vehicle||plate,startTs:r.ts,startAt:r.at,outs:[],ins:[],seed:crewOf(r),crew:[]});
  const wOf=r=>String(r.wdate||r.date||'');const minW=a=>a.map(wOf).sort()[0]||'',maxW=a=>a.map(wOf).sort().pop()||'';
  recs.forEach(r=>{
    if(r.type==='in'){
      // 열린 순환의 첫 작업일이 이 반납의 작업일보다 뒤면(저녁에 내일 것 출고를 먼저 찍고 오늘 남은 걸 반납) 그 순환엔 안 붙고 앞 순환(오늘 것) 몫 — 2026-10-02
      if(cur&&cur.outs.length&&!cur.ins.length&&wOf(r)<minW(cur.outs)){
        if(list.length)list[list.length-1].ins.push(r);else list.push(Object.assign(mk(r),{orphan:true,ins:[r]}));
        return}
      if(!cur)cur=Object.assign(mk(r),{orphan:true});cur.ins.push(r);return}
    if(cur&&cur.ins.length){list.push(cur);cur=null}
    else if(cur&&cur.outs.length&&wOf(r)>maxW(cur.outs)){list.push(cur);cur=null} // 작업일이 더 뒤인 출고는 새 순환으로 (앞 순환은 반납이 오면 그때 닫힘)
    if(!cur)cur=mk(r);cur.outs.push(r);
  });
  if(cur)list.push(cur);
  // 반납 없이 열린 채로 뒤에 또 순환이 생겼으면(2박 출장처럼 출고를 이어 찍음, 또는 반납을 빼먹음) 다음 순환에 합쳐 하나로 봄
  for(let i=0;i<list.length-1;){const c=list[i];if(c.outs.length&&!c.ins.length){const n=list[i+1];n.outs=c.outs.concat(n.outs);n.startTs=c.startTs;n.startAt=c.startAt;n.seed=c.seed;n.orphan=false;list.splice(i,1)}else i++}
  const claim={};list.forEach(cy=>{Object.keys((ovOf(cy).add)||{}).forEach(id=>{claim[id]=cy.startTs})}); // 이 차량의 어느 순환에 수동으로 넣은 시공인지 — 그 순환이 가져가고 다른 순환(앞 순환 자동 연결 포함)에선 빠짐
  list.forEach((cy,i)=>{ // 1) 기간부터 전부 정함 — 뒤 순환의 기간을 앞 순환 계산에서 봐야 하므로(같은 작업일이면 뒤 순환 몫)
    cy.ov=ovOf(cy);cy.open=!cy.ins.length;cy.later=list.slice(i+1);
    const wds=cy.outs.map(r=>r.wdate||r.date).filter(Boolean).sort();
    cy.fromW=wds[0]||U.kstDate(0,new Date(cy.startTs));cy.lastW=wds[wds.length-1]||cy.fromW;
    const iws=cy.ins.map(r=>r.wdate||r.date).filter(Boolean).sort();
    cy.toW=cy.open?today:(iws[iws.length-1]||cy.fromW);
    if(cy.toW<cy.fromW)cy.toW=cy.fromW;
    cy.endAt=cy.open?'':cy.ins[cy.ins.length-1].at;
    cy.zero=!cy.open&&cy.ins.every(r=>r.zero||!recQty(r));
  });
  list.forEach(cy=>{ // 2) 시공 연결·계산
    compute(cy,consumed,claim);
    if(!cy.open&&cy.outs.length)cy.jobs.forEach(r=>consumed.add(r.id)); // 닫힌 순환에 쓰인 시공은 다음 순환에 다시 안 붙음 (출고 없는 반납만 있는 순환은 시공을 안 가져감)
  });
  list.consumed=consumed;
  return list;
}
function plateOfName(name){const V=vehicles();const k=Object.keys(V).find(p=>String(V[p]||'').trim()===name);return k?NP(k):''} // 차량 탭에서 이 사람이 사수인 차량
function fallbackPlate(j){ // 스케줄 차량번호가 빈 행: 사수 → 부사수 순으로 차량 탭 사수인 사람의 차량 (한 건은 한 차량에만 붙게)
  const names=splitNames(j.sasu).concat(splitNames(j.busasu));
  for(const n of names){const pk=plateOfName(n);if(pk)return pk}
  return '';
}
function jobMatches(j,plate){ // 스케줄 차량번호가 있으면 그걸로. 없으면 그 행 사수·부사수 중 차량 탭 사수인 사람의 차량 (시트 사수가 입사일 순이라 팀 사수가 부사수 칸에 적히는 경우 대비)
  const jv=U.normPlate(j.vehicle);
  if(jv)return jv===NP(plate);
  return fallbackPlate(j)===NP(plate);
}
function jobOK(j){const t=String(j.time||'').trim();if(t==='실측')return false;if(/^(오전|오후)?\s*예약\s*[xX✕×](\s|$)/.test(String(j.addr||'').trim()))return false;return !!(j.addr&&j.addr.trim())}
function laterCovers(cy,d){ // 같은 작업일을 이 차량의 뒤 순환도 덮을 때 그날 시공을 뒤 순환에 넘길지 (2026-10-02)
  // 이 순환이 그날 정오 전에 반납으로 닫혔으면(아침에 남은 걸 먼저 반납하고 다시 실은 날) 그날 일은 뒤 순환이 한 것. 저녁에 닫혔으면 이 순환이 일한 것(뒤 순환은 작업일을 잘못 찍은 출고)
  if(cy.open||!cy.ins.length||!cy.outs.length||d!==cy.toW)return false;
  const at=String(cy.ins[cy.ins.length-1].at||'');if(at.slice(0,10)!==d||!(at<d+' 12:00'))return false; // 그날 정오 전에 찍은 반납일 때만
  return (cy.later||[]).some(k=>{const a=k.fromW||'',b=k.open?'9999-12-31':(k.toW||'');return a&&a<=d&&d<=b});
}
function compute(cy,consumed,claim){ // claim: {시공id: 수동으로 넣은 순환 startTs} — 수동 연결은 앞 순환의 자동 연결보다 우선
  const ov=cy.ov||{};const vo=vehOv(cy.plate);const add=Object.assign({},vo.add||{},ov.add||{}),del=Object.assign({},vo.del||{},ov.del||{});
  Object.keys(ov.add||{}).forEach(k=>{delete del[k]});Object.keys(ov.del||{}).forEach(k=>{delete add[k]}); // 순환별 결정이 차량 설정보다 우선
  const by={};const P=k=>by[k]||(by[k]={out:0,inn:0,sold:0,asFree:0});
  cy.outs.forEach(r=>{const t={};recByProd(r,t);Object.keys(t).forEach(k=>{P(k).out+=t[k]})});
  cy.ins.forEach(r=>{const t={};recByProd(r,t);Object.keys(t).forEach(k=>{P(k).inn+=t[k]})});
  const J=cy.outs.length?jobs():[];const linked=[],miss=[],asMiss=[];let asLoading=false; // 출고 없이 반납만 있는 순환(아침에 남은 걸 먼저 반납)은 시공을 안 붙임 — 2026-10-02: 그게 그날 시공을 먹어서 진짜 순환에 자동 연결이 안 되던 문제
  J.forEach(j=>{
    if(!j||!jobOK(j))return;
    const mine=!!(ov.add||{})[j.id]; // 이 순환에 수동으로 넣은 시공
    if(!mine&&claim&&claim[j.id]&&claim[j.id]!==cy.startTs)return; // 같은 차량의 다른 순환이 수동으로 가져감
    if(!mine&&consumed&&consumed.has(j.id))return; // 앞 순환에서 이미 정산된 시공 (수동으로 넣은 건 예외 — 2026-10-02: 앞 순환이 같은 날 시공을 먹어 버려 [수정]에서 체크해도 안 붙던 문제)
    const inWin=j.date>=cy.fromW&&j.date<=cy.toW&&!laterCovers(cy,j.date);
    const auto=inWin&&jobMatches(j,cy.plate);
    if(del[j.id])return;
    if(!auto&&!add[j.id])return;
    if(!mine&&claimedElsewhere(j.id,cy.plate))return; // 다른 차량 카드가 가져간 시공
    const isAs=/^AS$/i.test(String(j.time||'').trim());
    const pk=X.prodKeyOfCode(j.mat&&j.mat[0]&&j.mat[0].t)||'';
    const row={id:j.id,date:j.date,addr:String(j.addr||'').replace(/\(.*?\)/g,'').trim().slice(0,20),time:String(j.time||'').slice(0,2),py:String(j.py||'').trim(),prod:prodLabel(j),sasu:j.sasu||'',busasu:j.busasu||'',isAs,defect:isAs&&/시공하자/.test(String(j.category||'')),prev:[],auto,sold:0,asFree:0,pk,st:''};
    const sold=+j.sold||0;
    if(sold>0){row.sold=sold;P(pk||'?').sold+=sold;row.st='ok'}
    else if(isAs){
      const a=asOf(j.id);
      if(a===undefined){row.st='load';asLoading=true}
      else if(!a){row.st='asmiss';asMiss.push(row)}
      else{const q=parseQty(a.qty);const k=X.prodKeyOfCode(a.color)||pk||'?';row.prev=splitNames(a.prevWorker);
        if(String(a.pay||'')==='무료'){row.asFree=q;P(k).asFree+=q;row.st=q?'free':'zero'}else{row.sold=q;P(k).sold+=q;row.st=q?'ok':'zero'}}
    }
    else if(j.date>U.kstDate(0)){row.st='future'}
    else if(String(j.sasu||'').trim()){row.st='miss';miss.push(row)}
    else row.st='none';
    linked.push(row);
  });
  linked.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  // 담당: 순환별 수정 > 날짜별 수정 > 스케줄(연결된 시공의 사수·부사수) > 출고 때 적은 담당 > 차량 기본
  const ovc=arr(ov.crew).filter(Boolean);const bd=arr((vo.crewByDate||{})[cy.fromW]).filter(Boolean);const sc=crewFromJobs(linked);
  cy.crew=orderCrew(ovc.length?ovc:bd.length?bd:sc.length?sc:cy.seed.length?cy.seed:vehCrew(cy.plate)).slice(0,3);
  cy.crewSrc=ovc.length?'수정':bd.length?'수정':sc.length?'스케줄':cy.seed.length?'출고':'기본';
  const prods=PRODUCTS.map(p=>p.k).filter(k=>by[k]).concat(Object.keys(by).filter(k=>!PRODUCTS.some(p=>p.k===k)));
  cy.byProd=prods.map(k=>{const b=by[k];const used=b.sold+b.asFree;return {k,out:b.out,inn:b.inn,sold:b.sold,asFree:b.asFree,used,diff:b.out-used-b.inn}});
  const T=cy.byProd.reduce((t,b)=>{['out','inn','sold','asFree','used','diff'].forEach(f=>t[f]+=b[f]);return t},{out:0,inn:0,sold:0,asFree:0,used:0,diff:0});
  T.scrap=0;
  Object.assign(cy,T,{jobs:linked,miss,asMiss,asLoading,jobsN:linked.filter(r=>r.sold||r.asFree).length});
  cy.confirmed=!!(ov.confirm&&ov.confirm.at);
  if(cy.open)cy.st='open';
  else if(!cy.outs.length)cy.st='noout';
  else if(asLoading)cy.st='load';
  else if(miss.length||asMiss.length)cy.st='wait';
  else if(cy.diff===0)cy.st='fit';
  else if(cy.diff>0)cy.st='loss';
  else cy.st='scrap'; // 가져간 것보다 더 깔았음 = 자투리 활용 (초과 확인 아님)
  cy.decided=cy.st==='fit'||cy.st==='loss'||cy.st==='scrap';
  cy.net=-cy.diff; // 개인 기록: 로스 −, 자투리 +
  cy.remain=cy.out-cy.used; // 열린 순환의 차 잔량
}
function latestOf(plate){const l=cyclesOf(plate);return {cur:l[l.length-1]||null,list:l,consumed:l.consumed}}
function cycleOn(plate,D){ // 달력 날짜 기준: cur = 그 날짜가 들어가는 순환(출고 작업일 ≤ D ≤ 반납 작업일, 열려 있으면 그 뒤로 계속), prev = 그 앞의 마지막 순환, next = 그 뒤 첫 순환(미리 찍어 둔 출고)
  const {list,consumed}=latestOf(plate);let cur=null,prev=null,next=null;
  list.forEach(c=>{const a=c.fromW,b=c.open?'9999-12-31':c.toW;if(a<=D&&D<=b)cur=c;else if(b<D)prev=c;else if(!next)next=c});
  return {cur,prev,next,list,consumed};
}
function cyLabel(cy){return U.fmtMD(cy.fromW)+(cy.toW!==cy.fromW?'~'+U.fmtMD(cy.toW):'')}
function stChip(cy){
  return ({open:['blue','진행중 · 반납 전'],noout:['wait','출고 기록 없음'],load:['','AS보고 확인 중'],wait:['wait','대조 대기'],fit:['ok',cy.confirmed?'확정 · 일치':'일치'],loss:['bad',(cy.confirmed?'확정 · ':'')+'로스 '+cy.diff+'장'],scrap:['ok',(cy.confirmed?'확정 · ':'')+'자투리 +'+(-cy.diff)]})[cy.st]||['','']
}
function sgn(n){return (n>0?'+':'')+n}
function diffTxt(d){return d>0?'로스 '+d:d<0?'자투리 +'+(-d):'일치'} // 순환·제품 표시
function netTxt(d){const n=-d;return n>0?'+'+n:String(n)}                 // 개인 기록 표시 (로스 −, 자투리 +)
function diffCls(d){return d>0?'bad':d<0?'ok':'ok'}

/* ---------- 카드 ---------- */
const CSS=`
.cy-card .ia-metrics{grid-template-columns:repeat(4,minmax(0,1fr))}
.cy-crew{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:var(--dm-muted);margin-top:2px}
.cy-crew b{color:var(--dm-ink)}
.cy-crew u{color:var(--dm-blue);text-decoration:none;cursor:pointer;font-weight:700;font-size:12px}
.cy-jobs{border-top:1px dashed var(--dm-line);margin-top:10px;padding-top:8px;font-size:12px;color:var(--dm-muted);line-height:1.6}
.cy-jobs .j{display:flex;gap:8px;justify-content:space-between}
.cy-jobs .j span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cy-jobs .j b{color:var(--dm-ink);white-space:nowrap}
.cy-jobs .j small{display:block;font-size:11px;color:var(--dm-muted);opacity:.85}
.cy-jobs .j.miss b{color:var(--dm-amber)}.cy-jobs .j.free b{color:var(--dm-blue)}
.cy-next .nh{font-weight:800;color:var(--dm-ink);font-size:12.5px;margin-bottom:2px}.cy-next .nh small{font-weight:600;color:var(--dm-muted)}
.cy-people{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cy-people span{display:inline-flex;gap:5px;align-items:center;padding:4px 9px;border-radius:7px;background:var(--dm-soft);font-size:12px;color:var(--dm-muted)}
.cy-people span b{color:var(--dm-ink)}
.cy-people span.bad b{color:var(--red)}
.cy-acts{display:grid;grid-template-columns:.72fr 1fr 1fr .72fr;gap:7px;margin-top:12px}
.cy-acts .ia-button{min-height:46px}
.cy-acts .ia-button.zero{grid-column:1/-1;min-height:40px;background:transparent;color:var(--dm-muted)}
.cy-hist{margin-top:10px;font-size:12px}
.cy-hist summary{cursor:pointer;color:var(--dm-muted);font-weight:700;min-height:28px;display:flex;align-items:center}
.cy-hist .h{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px dashed var(--dm-line);cursor:pointer}
.cy-hist .h span:first-child{color:var(--dm-muted)}
.cy-hist .h b{white-space:nowrap}
.cy-hist .h b.bad{color:var(--red)}.cy-hist .h b.ok{color:var(--dm-green)}
.cy-month{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}
.cy-month div{background:var(--dm-soft);border-radius:8px;padding:8px;text-align:center}
.cy-month span{display:block;font-size:11px;color:var(--dm-muted)}
.cy-month b{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}
.cy-md label{display:block;font-size:12px;color:var(--dm-muted);margin:10px 0 4px;font-weight:700}
.cy-md select,.cy-md input[type=number]{height:40px;border:1px solid var(--dm-line);border-radius:8px;background:var(--dm-bg);color:var(--dm-ink);padding:6px 10px;font-size:15px;font-family:var(--font);color-scheme:dark}
.cy-md .row{display:flex;gap:8px;align-items:center}
.cy-md .row select{flex:1;min-width:0}
.cy-md .jl{display:flex;gap:8px;align-items:center;padding:7px 0;border-top:1px dashed var(--dm-line);font-size:12.5px}
.cy-md .jl input[type=checkbox]{width:18px;height:18px;flex:none;accent-color:var(--dm-green)}
.cy-md .jl span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cy-md .jl b{white-space:nowrap}
.cy-md .jl.cand{opacity:.7}
.cy-md .sc{display:grid;grid-template-columns:1fr 90px;gap:6px;align-items:center;padding:4px 0}
.cy-note{font-size:11.5px;color:var(--dm-muted);line-height:1.6;margin-top:8px}
.cy-ppl{margin:4px 0 20px}
.cy-ppl .hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:14px;font-weight:800;margin:0 2px 8px}
.cy-ppl .hd small{font-weight:600;color:var(--dm-muted);font-size:11.5px}
.cy-chips{display:flex;gap:6px;flex-wrap:wrap}
.cy-chip{display:inline-flex;gap:6px;align-items:center;padding:7px 11px;border-radius:9px;background:var(--dm-soft);border:1px solid transparent;font-size:13px;font-weight:700;color:var(--dm-ink);cursor:pointer;min-height:36px}
.cy-chip.on{border-color:var(--dm-blue);background:var(--dm-card)}
.cy-chip b{font-variant-numeric:tabular-nums}.cy-chip b.bad{color:var(--red)}.cy-chip b.ok{color:var(--dm-green)}.cy-chip b.dim{color:var(--dm-muted);font-weight:600}
.cy-cal{background:var(--dm-card);border:1px solid var(--dm-line);border-radius:12px;padding:10px 10px 8px;margin-top:10px}
.cy-cal .ttl{display:flex;justify-content:space-between;align-items:baseline;font-size:14px;font-weight:800;margin:0 2px 8px}
.cy-cal .ttl small{font-weight:600;color:var(--dm-muted);font-size:11.5px}
.cy-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
.cy-grid .dw{font-size:10.5px;color:var(--dm-muted);text-align:center;padding:2px 0 4px;font-weight:700}
.cy-grid .dw.su{color:var(--red)}
.cy-cell{min-height:44px;border-radius:7px;background:var(--dm-soft);padding:4px 3px 3px;display:flex;flex-direction:column;align-items:center;gap:2px}
.cy-cell.off{background:transparent}
.cy-cell .n{font-size:11px;color:var(--dm-muted);line-height:1}
.cy-cell.today .n{color:var(--dm-blue);font-weight:800}
.cy-cell .v{font-size:12.5px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.cy-cell .v.bad{color:var(--red)}.cy-cell .v.ok{color:var(--dm-green)}.cy-cell .v.zero{color:var(--dm-muted)}
.cy-cell .as{font-size:9px;color:var(--dm-amber);font-weight:800;line-height:1}
.cy-sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:10px}
.cy-sum div{background:var(--dm-soft);border-radius:8px;padding:7px 6px;text-align:center}
.cy-sum span{display:block;font-size:10.5px;color:var(--dm-muted)}
.cy-sum b{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}.cy-sum b.bad{color:var(--red)}.cy-sum b.ok{color:var(--dm-green)}
.cy-led{margin-top:8px;font-size:12px;color:var(--dm-muted)}
.cy-led .r{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-top:1px dashed var(--dm-line)}
.cy-led .r span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cy-led .r b{white-space:nowrap}.cy-led .r b.bad{color:var(--red)}.cy-led .r b.ok{color:var(--dm-green)}
`;
function ensureCss(){if(!$('cyCss')){const s=document.createElement('style');s.id='cyCss';s.textContent=CSS;document.head.appendChild(s)}}
function prodLines(cy){
  if(!cy.byProd.length)return '';
  return `<div class="ia-prods">${cy.byProd.map(b=>`<div class="ia-prodsec"><div class="p"><b><span>${esc(b.k)}</span><span>${cy.open?'잔량 '+(b.out-b.used):cy.decided?diffTxt(b.diff):'대기'}</span></b><span>출고 ${b.out} · 사용 ${b.used}${b.asFree?' (AS '+b.asFree+')':''} · 반납 ${b.inn}</span></div></div>`).join('')}</div>`;
}
function jobLines(cy){
  if(!cy.jobs.length)return `<div class="cy-jobs">연결된 시공 없음${cy.open?' · 시공보고가 들어오면 자동으로 붙어요':''}</div>`;
  const lab=r=>r.st==='miss'?'미입력':r.st==='asmiss'?'AS보고 없음':r.st==='load'?'확인 중':r.st==='future'?'예정':r.st==='zero'?'0장':r.asFree?'AS 무상 '+r.asFree:r.sold+'장';
  return `<div class="cy-jobs">${cy.jobs.map(r=>`<div class="j ${r.st==='miss'||r.st==='asmiss'?'miss':r.asFree?'free':''}"><span>${esc(U.fmtMD(r.date))} ${r.isAs?'<span style="color:var(--red)">AS</span> ':''}${esc(r.addr)}${r.auto?'':' <span style="color:var(--dm-blue)">수동</span>'}<small>${esc(r.prod||'')}${r.py?' · '+esc(r.py)+'평':''}${r.asFree&&r.defect?' · 시공하자 → '+(r.prev.length?esc(r.prev.join('·'))+' 로스 −'+r.asFree:'이전작업자 미기재'):''}</small></span><b>${lab(r)}</b></div>`).join('')}</div>`;
}
function peopleLines(cy){
  if(!cy.crew.length)return '';
  const on=cy.decided;
  return `<div class="cy-people">${cy.crew.map(n=>`<span class="${on&&cy.diff>0?'bad':''}">${esc(n)} <b>${on?netTxt(cy.diff):'—'}</b></span>`).join('')}</div>`;
}
function metrics(cy){
  const m=(lab,val,cls)=>`<div><span>${lab}</span><b class="${cls||''}">${val}</b><small>장</small></div>`;
  if(cy.open)return m('출고 누적',cy.out)+m('사용 (자동)',cy.used)+m('차 잔량',cy.remain,cy.remain<0?'ia-loss':'')+m('반납','–','dimv');
  return m('출고',cy.out)+m('사용',cy.used)+m('반납',cy.inn)+m(cy.decided&&cy.diff<0?'자투리':'로스',cy.decided?(cy.diff<0?'+'+(-cy.diff):String(cy.diff)):'–',cy.decided?(cy.diff>0?'ia-loss':'ia-fit'):'dimv');
}
function histHTML(plate,list,cur){
  const past=list.filter(c=>c!==cur).slice(-6).reverse();if(!past.length)return '';
  const k=NP(plate);
  return `<details class="cy-hist" ${HIST_OPEN[k]?'open':''} ontoggle="ioCycle.hist('${esc(k)}',this.open)"><summary>지난 순환 ${past.length}건</summary>${past.map(c=>`<div class="h" onclick="ioCycle.openBy('${esc(plate)}',${c.startTs})"><span>${esc(cyLabel(c))} · ${esc(c.crew.join('·'))}</span><b class="${c.decided?diffCls(c.diff):''}">${c.decided?diffTxt(c.diff):stChip(c)[1]}</b></div>`).join('')}</details>`;
}
function prodLabel(j){const k=X.prodKeyOfCode(j.mat&&j.mat[0]&&j.mat[0].t);if(k)return k.replace('1M ','1M·');return /이전설치/.test(String(j.category||'')+String(j.time||''))?'이전설치':'제품 미정'}
function upcomingHTML(v,up,from){ // 갈 현장: 선택 날짜 이후 이 차량의 첫 시공일 목록 (출고 전 실을 양 참고)
  if(!up.date)return '';const add=vehOv(v.plate).add||{};
  return `<div class="cy-jobs cy-next"><div class="nh">${esc(U.fmtMD(up.date))} 갈 현장 ${up.list.length}곳${up.date===from?'':' <small>다음 시공일</small>'}</div>${up.list.map(j=>`<div class="j"><span>${/^AS$/i.test(j.time)?'<span style="color:var(--red)">AS</span>':esc(String(j.time||'').slice(0,2))} ${esc(String(j.addr||'').replace(/\(.*?\)/g,'').trim().slice(0,18))}${add[j.id]?' <span style="color:var(--dm-blue)">수동</span>':''}</span><b>${esc(prodLabel(j))}${j.py?' · '+esc(j.py)+'평':''}</b></div>`).join('')}</div>`;
}
function nextWorkDay(d){let x=U.addDays(d,1);while(new Date(x+'T00:00:00Z').getUTCDay()===0)x=U.addDays(x,1);return x} // 일요일만 쉼
function goLink(d,txt){return `<u style="color:var(--dm-blue);cursor:pointer;text-decoration:none;font-weight:700" onclick="ioAdmin.goto('${esc(d)}')">${txt}</u>`}
function cardHTML(v){ // 카드는 달력 날짜(D) 기준: 그 날짜가 들어가는 순환을 보여 주고, 없으면 그날 갈 현장 + [출고]. 출고 작업일 = D, 반납 작업일 = 그 순환의 마지막 작업일
  const S_=cardHTML.S||{};const D=S_.from||U.kstDate(0);
  const {cur,prev,next,list,consumed}=cycleOn(v.plate,D);
  const open=!!(cur&&cur.open);
  const dayJobs=schedJobs(v.plate,D);
  const showUp=cur?(open&&D>cur.toW&&dayJobs.length>0):dayJobs.length>0; // 갈 현장: 순환 없으면 그날 현장, 열린 순환인데 그날(내일 이후) 현장이 아직 안 붙었으면 그것
  const who=cur?cur.crew:crewFor(v.plate,D); // 그날 실제 팀은 스케줄 기준
  const tn=teamNo(who,v.plate);const chip=cur?stChip(cur):dayJobs.length?['','출고 전']:['','시공 없음'];
  const tgt=cur||prev; // 반납·보고 대상: 그 날짜의 순환, 없으면 바로 앞 순환(어제 실은 걸 오늘 반납)
  const today=U.kstDate(0);const hour=+String(U.kstDT(new Date())).slice(11,13);
  let outW=D; // 출고 작업일 = 달력 날짜. 단 '오늘' 날짜에서 정오 이후에 찍는 출고는 다음 시공일 것(싣는 건 늘 전날 저녁) — 2026-10-02: 18시에 찍은 내일 출고가 오늘 것으로 들어가던 문제
  if(D===today&&hour>=12){const nx=upcomingOf(v.plate,U.addDays(today,1),consumed);outW=nx.date||nextWorkDay(today)}
  const inW=tgt?(tgt.open?tgt.lastW:tgt.toW):D;
  // 그 작업일에 이미 남긴 기록이 있으면 [출고]/[반납]은 빈 폼 대신 그 기록을 열어 고침 (v32). 같은 날 두 번 실었으면 수정 화면의 [따로 추가]
  const lastOf=(arr,w)=>arr.filter(r=>(r.wdate||r.date)===w).sort((a,b)=>a.ts-b.ts).pop()||null;
  const outRec=lastOf((cur?cur.outs:[]).concat(next?next.outs:[]),outW),inRec=tgt?lastOf(tgt.ins,inW):null;
  const edited=(cur?cur.outs.concat(cur.ins):[]).filter(r=>nn(r.editN)>0).length;
  let mine=false;try{mine=!!X.myPlate&&U.normPlate(X.myPlate())===NP(v.plate)}catch(e){}
  let h=`<div class="ia-team cy-card${mine?' mine':''}"><div class="ia-teamtop"><span class="ia-teamname">${tn?tn+'팀 · ':''}${esc(who.join('·')||'담당 미지정')}<small>${esc(v.plate)}</small></span><span class="ia-status ${chip[0]}">${chip[1]}</span></div>`;
  h+=`<div class="cy-crew"><span class="ia-tiny">${cur?esc(cyLabel(cur))+' · '+(cur.open?'출고 '+esc(String(cur.startAt||'').slice(5,16)):'반납 '+esc(String(cur.endAt||'').slice(5,16))):esc(U.fmtMD(D))}</span>${mine?' <span style="color:var(--dm-blue)">내 차량</span>':''}</div>`;
  if(cur){h+=`<div class="ia-metrics">${metrics(cur)}</div>${prodLines(cur)}${jobLines(cur)}${!cur.open?peopleLines(cur):''}`;
    const foot=[];
    if(cur.miss.length)foot.push(`시공보고 미입력 <b>${cur.miss.length}건</b> — 들어오면 자동 반영`);
    if(cur.asMiss.length)foot.push(`AS보고서 미제출 <b>${cur.asMiss.length}건</b>`);
    if(cur.st==='scrap')foot.push(`가져간 것보다 ${-cur.diff}장 더 깔았어요 → 자투리 활용 +${-cur.diff}로 기록`);
    if(cur.zero&&!cur.open)foot.push('반납 0장(다 씀)으로 닫힘');
    if(cur.ov.confirm)foot.push(`확정 ${esc(cur.ov.confirm.by||'')} ${esc(String(cur.ov.confirm.at||'').slice(5,16))}`);
    if(edited)foot.push(`고친 기록 <b>${edited}건</b> — [보고]에서 원래 값 확인`);
    if(!cur.open){ // 닫힌 순환: 다음 실을 날로 가는 길 (출고는 그 날짜 카드에서)
      if(next)foot.push(`${goLink(next.fromW,esc(U.fmtMD(next.fromW))+' 출고 기록 있음')} · ${next.out}장`);
      else{const nx=upcomingOf(v.plate,U.addDays(cur.toW,1),consumed);if(nx.date)foot.push(`다음 시공 ${goLink(nx.date,esc(U.fmtMD(nx.date))+' '+nx.list.length+'곳')} — 실을 땐 그 날짜에서 [출고]`)}
    }
    if(foot.length)h+=`<div class="ia-teamfoot">${foot.join('<br>')}</div>`;
  }else{
    const lines=[];
    if(!dayJobs.length){const nx=upcomingOf(v.plate,U.addDays(D,1),consumed);lines.push(`${esc(U.fmtMD(D))} 시공 없음${nx.date?' · 다음 시공 '+goLink(nx.date,esc(U.fmtMD(nx.date))+' '+nx.list.length+'곳'):''}`)}
    if(prev)lines.push(`지난 순환 ${goLink(prev.toW,esc(cyLabel(prev)))} · ${prev.decided?esc(diffTxt(prev.diff)):esc(stChip(prev)[1])}${prev.miss.length?' · 미입력 '+prev.miss.length+'건':''}${prev.asMiss.length?' · AS보고 없음 '+prev.asMiss.length+'건':''}`);
    if(next)lines.push(`${goLink(next.fromW,esc(U.fmtMD(next.fromW))+' 출고 기록 있음')} · ${next.out}장`);
    if(lines.length)h+=`<div class="ia-tiny" style="margin-top:6px;line-height:1.7">${lines.join('<br>')}</div>`;
  }
  if(showUp)h+=upcomingHTML(v,{date:D,list:dayJobs},D);
  h+=`<div class="cy-acts"><button type="button" class="ia-button quiet" onclick="ioCycle.openBy('${esc(v.plate)}',${cur?cur.startTs:0})">수정</button><button type="button" class="ia-button${open?'':' primary'}" onclick="ioOpen('out','${esc(v.plate)}','${esc(outW)}','${outRec?esc(outRec.id):''}')">출고${outW!==D?' · '+esc(U.fmtMD(outW)):''}</button><button type="button" class="ia-button${open?' primary':''}" onclick="ioOpen('in','${esc(v.plate)}','${esc(inW)}','${inRec?esc(inRec.id):''}')">반납</button><button type="button" class="ia-button quiet" ${tgt?`onclick="ioCycle.report('${esc(v.plate)}',${tgt.startTs})"`:'disabled'}>보고</button>${open?`<button type="button" class="ia-button zero" onclick="ioCycle.zero('${esc(v.plate)}')">반납 0장 (다 써서 없음)</button>`:''}</div>`;
  h+=histHTML(v.plate,list,cur);
  return h+'</div>';
}
function monthHTML(vehs,from,to){
  let h='';const tot={out:0,used:0,inn:0,diff:0,n:0,und:0,loss:0,scrap:0};
  vehs.forEach(v=>{
    const {list}=latestOf(v.plate);const cys=list.filter(c=>!c.open&&c.toW>=from&&c.toW<=to);
    if(!cys.length)return;
    const t={out:0,used:0,inn:0,diff:0,n:0,und:0,loss:0,scrap:0};
    cys.forEach(c=>{if(c.decided){t.n++;t.out+=c.out;t.used+=c.used;t.inn+=c.inn;t.diff+=c.diff;if(c.diff>0)t.loss+=c.diff;else t.scrap+=-c.diff}else t.und++});
    ['out','used','inn','diff','n','und','loss','scrap'].forEach(f=>tot[f]+=t[f]);
    const tn=teamNo(cys[cys.length-1].crew,v.plate);
    h+=`<div class="ia-team cy-card"><div class="ia-teamtop"><span class="ia-teamname">${tn?tn+'팀':''}<small>${esc(v.plate)}</small></span><span class="ia-status ${t.diff>0?'bad':t.n?'ok':''}">${t.n?'확정 '+t.n+'회'+(t.und?' · 대기 '+t.und:''):'대기 '+t.und}</span></div>
      <div class="ia-metrics"><div><span>출고</span><b>${t.out}</b><small>장</small></div><div><span>사용</span><b>${t.used}</b><small>장</small></div><div><span>로스</span><b class="${t.loss?'ia-loss':t.n?'ia-fit':'dimv'}">${t.n?t.loss:'–'}</b><small>장</small></div><div><span>자투리</span><b class="${t.n?'ia-fit':'dimv'}">${t.n?'+'+t.scrap:'–'}</b><small>장</small></div></div></div>`;
  });
  h+=`<div class="ia-tiny" style="margin:4px 2px 12px">회사 로스 <b style="color:${tot.loss?'var(--red)':'var(--dm-ink)'}">${tot.loss}장</b> · 자투리 활용 <b>+${tot.scrap}장</b> (확정 순환 ${tot.n}회${tot.und?' · 대조 대기 '+tot.und+'회 제외':''}) · 반납일이 이 달인 순환만 · 직원별은 아래 달력</div>`;
  return h||`<div class="ia-empty">이 달에 닫힌 순환이 없어요</div>`;
}
function cardsHTML(M,S){
  ensureCss();
  const ym=String(S.from||U.kstDate(0)).slice(0,7);
  if(S.mode==='month')return `<div class="ia-teams">${monthHTML(M.veh,S.from,S.to)}</div>`+peopleSection(ym);
  cardHTML.S=S;
  return `<div class="ia-teams">${M.veh.map(cardHTML).join('')}</div>`+peopleSection(ym);
}

/* ---------- 직원별 로스 기록 (달력) — 누적 저장본(io_ledger) + 그 뒤 기록 ----------
   · 매달 SNAP_DAY(10일)부터는 '지난달 말일까지'를 직원별 기록으로 계산해 Firebase io_ledger/{bs|gg}에 저장 (처음 여는 폰이 자동으로, 먼저 저장한 쪽이 이김)
   · 평소엔 저장본(작은 것) + 저장본 이후 기록만 읽어서 계산 → 기록이 몇 년 쌓여도 열 때 읽는 양이 안 늘어남
   · 저장은 매번 전체 기록으로 다시 계산 → 옛 순환을 수정하거나 시공보고·AS보고를 늦게 넣어도 다음 저장 때 반영. 당장 반영하려면 당번 모드 [다시 계산]
   · 저장본 = {cutoff:마지막 날, openFrom:이후 기록을 읽기 시작할 기록일, upto:{차량키:ts — 이 ts까지는 저장본에 들어감}, used:[정산된 시공 id], entries:[{n,date,amt,kind,note,used,...}]}
     차량별로 '앞에서부터 확정된 순환까지'만 저장본에 넣고(그 뒤 열린·미확정 순환은 평소 계산 몫), 닫힌 지 60일 넘은 미확정 순환은 넘어감(다음 저장 때 다시 봄) */
const LNODE=(X.beta?'io_ledger_beta/':'io_ledger/')+RK;
const SNAP_DAY=10,LV=1; // LV: 장부 계산 규칙 버전 — 바꾸면 저장본을 다시 만듦
let SNAP;            // undefined=아직 안 읽음, null=저장본 없음
let SNAP_FORCE=false,SNAP_BUSY=false,SNAP_FAIL=0;
function loadSnap(){if(SNAP!==undefined||MLOAD.snap)return;MLOAD.snap=1;
  const done=v=>{SNAP=v||null;delete MLOAD.snap;rerender()};
  try{db.ref(LNODE).once('value').then(s=>done(s.val())).catch(()=>done(null))}catch(e){done(null)}}
function snapCutoff(){ // 지금 저장본이 담아야 할 마지막 날: 매달 SNAP_DAY부터 지난달 말일, 그 전엔 전전달 말일. 순환 시작 전이면 ''
  const t=U.kstDate(0);let y=+t.slice(0,4),m=+t.slice(5,7);const d=+t.slice(8,10);
  m-=(d>=SNAP_DAY?1:2);while(m<1){m+=12;y--}
  const c=y+'-'+String(m).padStart(2,'0')+'-'+String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0');
  return c>=CY_START?c:'';
}
function addDays(d,n){const b=new Date(d+'T00:00:00Z');b.setUTCDate(b.getUTCDate()+n);return b.toISOString().slice(0,10)}
function snapOK(s){return !!(s&&s.cutoff&&nn(s.lv)===LV)}
function ledgerCalc(recs,o){ // 직원별 기록 계산. o.build=저장본 만들기(to=cutoff까지), 아니면 저장본(upto·used) 이후 기록으로 평소 계산
  // 반환 {entries:[{n,date,amt,kind,note,used,...}], asLoading, asNoPrev, upto, used, openFrom}. amt: 로스 −, 자투리 +. 순환은 반납 작업일, 시공하자 AS 무상분은 이전 작업자에게 −
  o=o||{};const E=[];const add=(n,e)=>{if(n)E.push(Object.assign({n},e))};
  const today=U.kstDate(0),to=o.to||today;const upto=Object.assign({},o.upto||{});const used=new Set(arr(o.used));
  let asLoading=false,asNoPrev=0,openFrom='';const stale=o.build?addDays(to,-60):'';
  Object.keys(vehicles()).forEach(p=>{const np=NP(p);
    const rm={};Object.keys(recs||{}).forEach(k=>{const r=recs[k];if(r&&NP(r.vehicle)===np&&nn(r.ts)>(upto[np]||0))rm[k]=r});
    let cut=true;
    cyclesOf(p,rm,arr(o.used)).forEach(c=>{
      const settled=!c.open&&c.decided&&c.toW>=CY_START&&c.toW<=to;
      const put=()=>c.crew.forEach(n=>add(n,{date:c.toW,amt:-c.diff,kind:'cycle',note:p+' · 출고 '+c.out+' 사용 '+c.used+' 반납 '+c.inn,used:c.used,plate:p,startTs:c.startTs}));
      if(!o.build){if(settled)put();return}
      if(cut&&(settled||(!c.open&&c.toW<=stale))){if(settled)put();c.jobs.forEach(r=>used.add(r.id));upto[np]=Math.max(upto[np]||0,...c.outs.concat(c.ins).map(r=>nn(r.ts)))}
      else{cut=false;const d0=c.outs.concat(c.ins).map(r=>String(r.date||'')).filter(Boolean).sort()[0]||'';if(d0&&(!openFrom||d0<openFrom))openFrom=d0}
    });
  });
  const asFrom=o.asFrom||CY_START,asTo=o.asTo||today;
  jobs().forEach(j=>{
    if(!j||!jobOK(j)||j.date<asFrom||j.date>asTo||j.date>today)return;
    if(!/^AS$/i.test(String(j.time||'').trim())||!/시공하자/.test(String(j.category||'')))return;
    const a=asOf(j.id);if(a===undefined){asLoading=true;return}
    if(!a||String(a.pay||'')!=='무료')return;
    const q=parseQty(a.qty);if(!q)return;
    const prev=splitNames(a.prevWorker);if(!prev.length){asNoPrev++;return}
    prev.forEach(n=>add(n,{date:j.date,amt:-q,kind:'as',note:'시공하자 AS 무상 '+q+'장 · '+String(j.addr||'').replace(/\(.*?\)/g,'').trim().slice(0,16),used:0,id:j.id}));
  });
  return {entries:E,asLoading,asNoPrev,upto,used:Array.from(used),openFrom};
}
function ledgerAll(){ // {L:{name:[entries]},asLoading,asNoPrev} = 저장본 entries + 저장본 이후 기록으로 계산한 것 (저장본 없으면 전부 계산)
  const S=snapOK(SNAP)?SNAP:null;
  const live=ledgerCalc(recordsAll(),S?{upto:S.upto||{},used:S.used,asFrom:addDays(S.cutoff,1)}:{});
  const L={};(S?arr(S.entries):[]).concat(live.entries).forEach(e=>{if(e&&e.n)(L[e.n]=L[e.n]||[]).push(e)});
  Object.values(L).forEach(a=>a.sort((x,y)=>x.date<y.date?-1:x.date>y.date?1:0));
  return {L,asLoading:live.asLoading,asNoPrev:live.asNoPrev+(S?nn(S.asNoPrev):0)};
}
function snapBuild(){ // 저장본 만들기: 전체 기록을 읽어 cutoff까지 계산 → io_ledger에 저장. 다른 폰이 먼저 저장했으면 그걸 받음
  const cutoff=snapCutoff();if(!cutoff||SNAP_BUSY||Date.now()-SNAP_FAIL<60000)return;
  if(!(MREC.from&&MREC.from<=CY_START)){loadRecs(CY_START);return}
  if(MLOAD.all)return;
  const r=ledgerCalc(recordsAll(),{build:true,to:cutoff,asTo:cutoff});
  if(r.asLoading)return; // AS보고서가 다 오면 rerender → 다시 시도
  const today=U.kstDate(0);const force=SNAP_FORCE;SNAP_FORCE=false;SNAP_BUSY=true;
  const snap={lv:LV,cutoff,openFrom:(r.openFrom&&r.openFrom<today)?r.openFrom:today,upto:r.upto,used:r.used,entries:r.entries,asNoPrev:r.asNoPrev,n:r.entries.length,builtAt:U.kstDT(new Date()),by:(localStorage.getItem('io_admin_name')||'').trim()||'',ver:CY_VER};
  const end=v=>{SNAP_BUSY=false;SNAP=v;rerender()};
  try{db.ref(LNODE).transaction(cur=>{if(!force&&snapOK(cur)&&cur.cutoff>=cutoff)return;return snap}).then(res=>{const v=res&&res.snapshot&&res.snapshot.val();end(v||snap)}).catch(()=>{SNAP_FAIL=Date.now();end(SNAP||null)})}catch(e){SNAP_FAIL=Date.now();end(SNAP||null)}
}
function relearn(){if(!admin())return;SNAP_FORCE=true;rerender()}
function personSum(arr){const o={net:0,as:0,asN:0,n:0,used:0};(arr||[]).forEach(e=>{o.net+=e.amt;if(e.kind==='as'){o.as+=-e.amt;o.asN++}else{o.n++;o.used+=e.used||0}});o.rate=o.used&&o.net<0?Math.round(-o.net/o.used*1000)/10:(o.used?0:null);return o}
function calHTML(name,ym,all){
  const entries=(all||[]).filter(e=>e.date.slice(0,7)===ym);
  const y=+ym.slice(0,4),m=+ym.slice(5,7);const first=new Date(Date.UTC(y,m-1,1));const dow=first.getUTCDay();const days=new Date(Date.UTC(y,m,0)).getUTCDate();
  const byDay={};entries.forEach(e=>{const d=+e.date.slice(8,10);(byDay[d]=byDay[d]||{amt:0,as:false});byDay[d].amt+=e.amt;if(e.kind==='as')byDay[d].as=true});
  const today=U.kstDate(0);
  let cells=['일','월','화','수','목','금','토'].map((d,i)=>`<div class="dw${i===0?' su':''}">${d}</div>`).join('');
  for(let i=0;i<dow;i++)cells+='<div class="cy-cell off"></div>';
  for(let d=1;d<=days;d++){const ds=ym+'-'+String(d).padStart(2,'0');const b=byDay[d];
    cells+=`<div class="cy-cell${ds===today?' today':''}"><span class="n">${d}</span>${b?`<span class="v ${b.amt<0?'bad':b.amt>0?'ok':'zero'}">${b.amt>0?'+':''}${b.amt}</span>${b.as?'<span class="as">AS</span>':''}`:''}</div>`}
  const S=personSum(all);const first0=(all&&all.length)?all[0].date:'';
  return `<div class="cy-cal"><div class="ttl"><span>${esc(name)}</span><small>${first0?esc(U.fmtMD(first0))+'부터':''}</small></div>
    <div class="cy-sum" style="margin-top:0;grid-template-columns:repeat(2,minmax(0,1fr))"><div><span>로스 누적</span><b class="${S.net<0?'bad':S.net>0?'ok':''}">${S.net>0?'+':''}${S.net}</b>${S.as?`<span style="margin-top:3px">하자 AS −${S.as}장 ${S.asN}건 포함</span>`:''}</div><div><span>로스율</span><b class="${S.rate>3?'bad':''}">${S.rate==null?'–':S.rate+'%'}</b><span style="margin-top:3px">사용 ${S.used}장 기준</span></div></div>
    <div class="ttl" style="margin-top:10px"><span>${m}월</span></div><div class="cy-grid">${cells}</div>
    ${entries.length?`<div class="cy-led">${entries.slice().reverse().map(e=>`<div class="r"><span>${esc(U.fmtMD(e.date))} ${e.kind==='as'?'<span style="color:var(--dm-amber)">AS</span> ':''}${esc(e.note)}</span><b class="${e.amt<0?'bad':e.amt>0?'ok':''}">${e.amt>0?'+':''}${e.amt}</b></div>`).join('')}</div>`:''}</div>`;
}
function peopleSection(ym){
  const lnk=(f,t)=>`<u style="cursor:pointer;color:var(--dm-blue)" onclick="ioCycle.${f}()">${t}</u>`;
  if(!PPL_OPEN)return `<div class="cy-ppl"><div class="hd"><span>👤 직원별 로스 기록</span><small>${lnk('pplToggle','보기')}</small></div></div>`;
  loadSnap();
  const S=snapOK(SNAP)?SNAP:null;const want=snapCutoff();
  const due=SNAP!==undefined&&!!want&&(SNAP_FORCE||!S||S.cutoff<want);
  if(due)snapBuild();else loadRecs(S?(S.openFrom||addDays(S.cutoff,1)):CY_START); // 저장할 때가 됐으면 전체를, 아니면 저장본 이후만
  const loading=SNAP===undefined||!!MLOAD.all||!MREC.from;
  const {L,asLoading,asNoPrev}=loading?{L:{},asLoading:false,asNoPrev:0}:ledgerAll();
  const names=emps().slice();Object.keys(L).forEach(n=>{if(names.indexOf(n)<0)names.push(n)});
  if(!names.length)return '';
  if(PSEL&&names.indexOf(PSEL)<0)PSEL='';
  const chips=loading?'':names.map(n=>{const P=personSum(L[n]);const v=P.net;return `<span class="cy-chip${PSEL===n?' on':''}" onclick="ioCycle.person('${esc(n)}')">${esc(n)}<b class="${v<0?'bad':v>0?'ok':'dim'}">${L[n]?(v>0?'+':'')+v:'–'}</b></span>`}).join('');
  const parts=[loading?'불러오는 중…':SNAP_BUSY?'누적 저장 중…':asLoading?'AS보고 확인 중…':'',asNoPrev?'이전작업자 미기재 AS '+asNoPrev+'건':'',admin()&&S&&!loading?`${esc(U.fmtMD(S.cutoff))}까지 저장 · ${lnk('relearn','다시 계산')}`:'',lnk('pplToggle','접기')].filter(Boolean);
  return `<div class="cy-ppl"><div class="hd"><span>👤 직원별 로스 기록</span><small>${parts.join(' · ')}</small></div><div class="cy-chips">${chips}</div>${PSEL&&!loading?calHTML(PSEL,ym,L[PSEL]||[]):''}</div>`;
}
function pplToggle(){PPL_OPEN=!PPL_OPEN;try{localStorage.setItem('io_ppl_open',PPL_OPEN?'1':'0')}catch(e){}rerender()}
function person(n){PSEL=(PSEL===n)?'':n;try{localStorage.setItem('io_person',PSEL)}catch(e){}rerender()}

/* ---------- 수정 모달 ---------- */
function md(html){let m=$('cyMd');if(!m){m=document.createElement('div');m.className='ia-md';m.id='cyMd';m.setAttribute('onclick','if(event.target===this)ioCycle.close()');m.innerHTML='<div class="ia-md-in cy-md" id="cyMdIn"></div>';document.body.appendChild(m)}$('cyMdIn').innerHTML=html;m.classList.add('show')}
function close(){const m=$('cyMd');if(m)m.classList.remove('show');SEL=null}
function cur(){if(!SEL||!SEL.startTs)return null;return cyclesOf(SEL.plate).find(c=>c.startTs===SEL.startTs)||null}
function openBy(plate,startTs){SEL={plate,startTs:+startTs};render()}
function upcomingFor(plate,cy){ // 모달용 갈 현장 후보: 그 날짜의 이 지역 시공 전부 (이 차량 것은 체크됨). 순환 없으면 달력 날짜(그날 시공 없으면 다음 시공일), 열린 순환이면 아직 안 붙은 다음 날부터, 닫힌 순환은 없음(다음 날 카드 몫)
  const S=cardHTML.S||{};const D=S.from||U.kstDate(0);
  const {consumed}=latestOf(plate);const linked=new Set(cy?cy.jobs.map(r=>r.id):[]);
  if(cy&&!cy.open)return {date:'',list:[]};
  const okJ=j=>j&&jobOK(j)&&!linked.has(j.id)&&!(consumed&&consumed.has(j.id));
  let d='';
  if(cy){const from=cy.toW>=D?U.addDays(cy.toW,1):D;d=upcomingOf(plate,from,consumed).date;if(!d){d=jobs().filter(j=>okJ(j)&&j.date>=from).map(j=>j.date).sort()[0]||''}}
  else{d=jobs().some(j=>okJ(j)&&j.date===D)?D:(jobs().filter(j=>okJ(j)&&j.date>D).map(j=>j.date).sort()[0]||'')}
  if(!d)return {date:'',list:[]};
  const on=new Set(schedJobs(plate,d).map(j=>j.id));
  return {date:d,list:jobs().filter(j=>j&&jobOK(j)&&j.date===d&&!linked.has(j.id)&&!(consumed&&consumed.has(j.id))).sort((a,b)=>String(a.time).localeCompare(String(b.time))).map(j=>({j,on:on.has(j.id),auto:jobMatches(j,plate)}))};
}
function render(){
  const cy=cur();if(!SEL){close();return}
  const plate=SEL.plate;
  const E=emps();const opt=sel=>`<option value="">선택</option>${E.map(n=>`<option value="${esc(n)}"${sel===n?' selected':''}>${esc(n)}</option>`).join('')}${sel&&!E.includes(sel)?`<option value="${esc(sel)}" selected>${esc(sel)}</option>`:''}`;
  const adm=admin();
  const up=upcomingFor(plate,cy);
  const crew=cy?cy.crew:(up.date?crewFor(plate,up.date):vehCrew(plate));
  let h;
  if(cy){const chip=stChip(cy);
    h=`<h3>${esc(plate)} · ${esc(cyLabel(cy))} <span class="ia-status ${chip[0]}">${chip[1]}</span></h3>
    <div class="ia-tiny">출고 ${cy.out} − 사용 ${cy.used}${cy.asFree?' (AS 무상 '+cy.asFree+')':''} − 반납 ${cy.open?'(전)':cy.inn} = ${cy.open?'잔량 '+cy.remain:cy.decided?diffTxt(cy.diff):'대조 대기'}</div>`;
  }else h=`<h3>${esc(plate)} <span class="ia-status">${up.date?esc(U.fmtMD(up.date))+' 준비':'기록 없음'}</span></h3>`;
  const nSel=crew.length>=3?3:2;
  h+=`<label>담당${cy?'':up.date?' · '+esc(U.fmtMD(up.date)):' · 기본'}</label>
    <div class="row">${Array.from({length:nSel},(_,i)=>`<select id="cyC${i+1}">${opt(crew[i]||'')}</select>`).join('')}</div>`;
  if(cy){
  // 후보 시공: 기간 안 이 지역 시공 중 이 순환에 안 붙은 것(차량 다름) — 넣을 수 있게
  const linkedIds=new Set(cy.jobs.map(r=>r.id));
  const dels=cy.ov.del||{};
  const cand=jobs().filter(j=>j&&jobOK(j)&&j.date>=cy.fromW&&j.date<=cy.toW&&!linkedIds.has(j.id)).slice(0,12); // 뺀 시공도 보여서 다시 넣을 수 있게
  const cons=latestOf(plate).consumed||new Set(); // 이 차량의 다른 순환에 이미 붙은 시공 — 체크하면 이 순환으로 옮겨 옴
  h+=`<label>연결된 시공</label>`;
  h+=cy.jobs.map(r=>`<div class="jl"><input type="checkbox" checked data-id="${esc(r.id)}"><span>${esc(U.fmtMD(r.date))} ${r.isAs?'AS ':''}${esc(r.addr)} <span class="ia-tiny">${esc([r.sasu,r.busasu].filter(Boolean).join('·'))}${r.auto?'':' · <span style="color:var(--dm-blue)">수동</span>'}</span></span><b>${r.sold?r.sold+'장':r.asFree?'AS '+r.asFree:r.st==='miss'?'미입력':r.st==='asmiss'?'AS보고 없음':r.st==='future'?'예정':'0'}</b></div>`).join('')||'<div class="ia-tiny">없음</div>';
  if(cand.length)h+=`<label>같은 기간 다른 시공</label>`+cand.map(j=>`<div class="jl cand"><input type="checkbox" data-add="${esc(j.id)}" data-auto="${jobMatches(j,cy.plate)?1:0}"><span>${esc(U.fmtMD(j.date))} ${/^AS$/i.test(j.time)?'AS ':''}${esc(String(j.addr||'').slice(0,18))} <span class="ia-tiny">${esc([j.sasu,j.busasu].filter(Boolean).join('·'))}${j.vehicle?' · '+esc(j.vehicle):''}${dels[j.id]?' · <span style="color:var(--dm-amber)">뺀 시공</span>':cons.has(j.id)?' · <span style="color:var(--dm-amber)">이 차 다른 순환에 연결됨</span>':''}</span></span><b>${(+j.sold||0)?j.sold+'장':'—'}</b></div>`).join('');
  }
  if(up.list.length)h+=`<label>${esc(U.fmtMD(up.date))} 갈 현장</label>`+up.list.map(x=>`<div class="jl${x.on?'':' cand'}"><input type="checkbox" ${x.on?'checked':''} data-up="${esc(x.j.id)}" data-auto="${x.auto?1:0}"><span>${/^AS$/i.test(x.j.time)?'AS ':esc(String(x.j.time||'').slice(0,2))+' '}${esc(String(x.j.addr||'').replace(/\(.*?\)/g,'').slice(0,18))} <span class="ia-tiny">${esc([x.j.sasu,x.j.busasu].filter(Boolean).join('·'))}${x.j.vehicle?' · '+esc(x.j.vehicle):''}</span></span><b>${esc(prodLabel(x.j))}${x.j.py?' · '+esc(x.j.py)+'평':''}</b></div>`).join('');
  const last=(cy&&cy.ov.at)?cy.ov:vehOv(plate);
  if(last.at)h+=`<div class="cy-note">마지막 수정 ${esc(last.by||'')} ${esc(String(last.at||'').slice(5,16))}</div>`;
  const touched=!!(cy&&(cy.ov.add||cy.ov.del||(arr(cy.ov.crew).length)));
  h+=`<div class="bt"><button type="button" class="ia-btn" onclick="ioCycle.close()">닫기</button>${touched?`<button type="button" class="ia-btn" onclick="ioCycle.reset()">스케줄대로</button>`:''}${adm&&cy&&cy.decided?`<button type="button" class="ia-btn ${cy.confirmed?'':'ok'}" onclick="ioCycle.confirm(${cy.confirmed?0:1})">${cy.confirmed?'확정 해제':'로스 확정'}</button>`:''}<button type="button" class="ia-btn pri" onclick="ioCycle.save()">저장</button></div>`;
  md(h);
}
function saveEdit(){
  if(!SEL)return;const cy=cur();const plate=SEL.plate;
  const crew=[];[1,2,3].forEach(i=>{const el=$('cyC'+i);const v=el?String(el.value||'').trim():'';if(v&&crew.indexOf(v)<0)crew.push(v)});
  if(!crew.length){X.toast('담당을 한 명 이상 골라주세요',true);return}
  // 차량 설정: 갈 현장 넣기·빼기 (+ 순환이 없을 땐 그 날짜 담당)
  const vo=vehOv(plate);const vadd=Object.assign({},vo.add||{}),vdel=Object.assign({},vo.del||{});
  document.querySelectorAll('#cyMdIn input[data-up]').forEach(el=>{const id=el.dataset.up,auto=el.dataset.auto==='1';if(el.checked){delete vdel[id];if(!auto)vadd[id]=1;else delete vadd[id]}else{delete vadd[id];if(auto)vdel[id]=1}});
  const vpatch={add:Object.keys(vadd).length?vadd:null,del:Object.keys(vdel).length?vdel:null};
  if(!cy){
    const up=upcomingFor(plate,null);
    if(up.date){const cbd=Object.assign({},vo.crewByDate||{});cbd[up.date]=crew;vpatch.crewByDate=cbd}else vpatch.crew=crew;
    saveVeh(plate,vpatch).then(()=>{X.toast('저장했어요');close();rerender()}).catch(e=>X.toast('저장 실패: '+String(e&&e.message||e),true));return}
  const del=Object.assign({},cy.ov.del||{}),add=Object.assign({},cy.ov.add||{});
  document.querySelectorAll('#cyMdIn input[data-id]').forEach(el=>{const id=el.dataset.id;const row=cy.jobs.find(r=>r.id===id);if(!el.checked){if(row&&row.auto)del[id]=1;delete add[id]}else{delete del[id];if(row&&!row.auto)add[id]=1}});
  document.querySelectorAll('#cyMdIn input[data-add]').forEach(el=>{if(el.checked){delete del[el.dataset.add];if(el.dataset.auto!=='1')add[el.dataset.add]=1}}); // 스케줄상 이 차량 시공이면 '뺀 것'만 풀고, 남의 시공이면 수동 추가
  const patch={crew,add:Object.keys(add).length?add:null,del:Object.keys(del).length?del:null};
  patch.scrap=null; // 자투리 수동 입력 폐지 — 사용이 출고보다 많으면 자동으로 자투리 활용
  if(cy.confirmed&&!confirm('확정된 순환이에요. 수정하면 확정이 풀리고 다시 계산돼요. 계속할까요?'))return;
  patch.confirm=null;
  Promise.all([save(cy,patch),saveVeh(plate,vpatch)]).then(()=>{X.toast('저장했어요');close();rerender()}).catch(e=>X.toast('저장 실패: '+String(e&&e.message||e),true));
}
function reset(){ // 수동으로 넣고 뺀 것·담당 수정을 전부 지우고 스케줄 자동 연결로 되돌림
  const cy=cur();if(!cy)return;
  if(!confirm('이 순환의 수동 연결·담당 수정을 지우고 스케줄대로 되돌릴까요?'))return;
  save(cy,{add:null,del:null,crew:null,confirm:null}).then(()=>{X.toast('스케줄대로 되돌렸어요');close();rerender()}).catch(e=>X.toast('저장 실패: '+String(e&&e.message||e),true));
}
function confirmCy(on){
  const cy=cur();if(!cy||!admin())return;
  const by=(localStorage.getItem('io_admin_name')||'').trim()||prompt('담당자 이름')||'';if(!by)return;
  try{localStorage.setItem('io_admin_name',by)}catch(e){}
  save(cy,{confirm:on?{by,at:U.kstDT(new Date()),diff:cy.diff,out:cy.out,used:cy.used,inn:cy.inn}:null}).then(()=>{X.toast(on?'로스 확정':'확정 해제');close();rerender()}).catch(e=>X.toast('저장 실패',true));
}
function zero(plate){
  const {cur:cy}=latestOf(plate);
  if(!cy||!cy.open){X.toast('열려 있는 순환이 없어요',true);return}
  if(!confirm(plate+' · 출고 '+cy.out+'장 / 사용 '+cy.used+'장\n\n남은 매트가 0장이라 반납할 게 없나요?\n이 순환을 "반납 0장"으로 닫아요.'+(cy.remain>0?'\n\n⚠ 계산상 잔량 '+cy.remain+'장이 남아 있어야 해요. 그대로 닫으면 '+cy.remain+'장이 로스로 잡혀요.':'')))return;
  try{window.ioZeroReturn(plate,cy.lastW)}catch(e){X.toast('반납 0장 기록을 못 만들었어요 (iolog.js 버전 확인)',true)}
}
function hist(k,open){HIST_OPEN[k]=!!open}

/* ---------- 공유 화면용 (그날 반납으로 닫힌 순환 + 열린 순환) ---------- */
function shareHTML(date,onlyPlate){
  const plates=Object.keys(vehicles()).filter(p=>!onlyPlate||NP(p)===NP(onlyPlate));
  let h='';
  plates.forEach(p=>{const {list}=latestOf(p);list.filter(c=>(c.open&&c.fromW<=date)||(!c.open&&c.toW===date)).forEach(c=>{
    const tn=teamNo(c.crew,p);const chip=stChip(c);
    h+=`<div class="io-sh-veh"><div class="io-sh-vh">🚚 ${tn?tn+'팀 · ':''}${esc(p)}<small>${esc(c.crew.join(' / '))}</small></div>
      <div class="io-sh-rc"><span>출고 <b>${c.out}</b> − 사용 <b>${c.used}</b>${c.asFree?' (AS '+c.asFree+')':''} − 반납 <b>${c.open?'–':c.inn}</b>${c.open?' → 차 잔량 <b>'+c.remain+'</b>':' → <b>'+(c.decided?diffTxt(c.diff):'대조 대기')+'</b>'}</span><span class="io-veh-diff ${chip[0]==='bad'?'plus':chip[0]==='ok'?'ok':chip[0]==='wait'?'warn':'dim'}">${chip[1]}</span></div>
      ${c.byProd.length?`<div class="io-rc-prod">${c.byProd.map(b=>esc(b.k)+' '+(c.open?'잔 '+(b.out-b.used):c.decided?diffTxt(b.diff):'대기')).join(' · ')}</div>`:''}
      ${!c.open&&c.crew.length?`<div class="io-rc-prod">${c.crew.map(n=>esc(n)+' '+(c.decided?netTxt(c.diff):'—')).join(' · ')} <span style="opacity:.7">(공동작업 기준 · 로스 − / 자투리 +)</span></div>`:''}</div>`;
  })});
  return h?`<div class="io-sh-nx" style="margin-top:0;margin-bottom:10px"><div class="io-sh-nxh">📦 순환 정산 · ${esc(U.fmtD(date))}</div>${h}</div>`:'';
}
function shareText(date,onlyPlate){
  const plates=Object.keys(vehicles()).filter(p=>!onlyPlate||NP(p)===NP(onlyPlate));const out=[];
  plates.forEach(p=>{const {list}=latestOf(p);list.filter(c=>(c.open&&c.fromW<=date)||(!c.open&&c.toW===date)).forEach(c=>{
    const tn=teamNo(c.crew,p);
    out.push((tn?RN+' '+tn+'팀 · ':'')+p+' · 순환 정산 ('+cyLabel(c)+')\n담당: '+c.crew.join(' / ')+'\n출고 '+c.out+'장\n사용 '+c.used+'장 — 시공 '+c.sold+'장'+(c.asFree?' / AS 무상 '+c.asFree+'장':'')+'\n반납 '+(c.open?'(전) · 차 잔량 '+c.remain+'장':c.inn+'장')+(c.open?'':'\n'+(c.decided?diffTxt(c.diff):'대조 대기'))+(c.decided?'\n'+c.crew.map(n=>n+': '+netTxt(c.diff)).join(' / ')+' (공동작업 기준)':'')+'\n상태: '+stChip(c)[1]);
  })});
  return out.join('\n\n');
}

/* ---------- 보고 화면 — 차량 한 대 · 현재 순환, 휴대폰 한 화면 스크린샷 → 단톡방 ---------- */
const REP_CSS=`
#cyRep{display:none;position:fixed;inset:0;background:var(--bg);z-index:993;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}
#cyRep.show{display:block}
.cyr-in{max-width:520px;margin:0 auto;padding:0 14px 84px}
.cyr-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:14px 0 10px;padding-top:max(14px,env(safe-area-inset-top))}
.cyr-t{font-size:18px;font-weight:900;letter-spacing:-.4px}
.cyr-s{font-size:12.5px;color:var(--sub);font-weight:600;margin-top:3px;line-height:1.4}
.cyr-chip{display:inline-block;padding:3px 9px;border-radius:7px;font-size:11.5px;font-weight:800;background:var(--card2);color:var(--sub);white-space:nowrap}
.cyr-chip.bad{background:rgba(255,69,58,.16);color:var(--red)}.cyr-chip.ok{background:rgba(48,209,88,.16);color:var(--green)}.cyr-chip.warn{background:rgba(255,214,10,.14);color:var(--yellow)}.cyr-chip.blue{background:rgba(100,210,255,.14);color:var(--cyan)}
.cyr-sec{background:var(--card);border-radius:14px;padding:9px 12px;margin-bottom:8px}
.cyr-sh{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:14px;font-weight:900}
.cyr-sh small{font-size:11.5px;color:var(--sub);font-weight:600;white-space:nowrap}
.cyr-row{display:flex;gap:10px;align-items:flex-start;padding:7px 0 4px;border-top:1px solid var(--border);margin-top:6px}
.cyr-row:first-of-type{border-top:none;margin-top:2px}
.cyr-row .b{flex:1;min-width:0;font-size:13px;line-height:1.5}
.cyr-row .b .l{color:var(--sub);font-size:12px}
.cyr-row .b .l b{color:var(--text);font-weight:800}
.cyr-th{width:60px;height:60px;border-radius:8px;overflow:hidden;background:var(--card2);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--dim);text-align:center;line-height:1.3}
.cyr-th img{width:100%;height:100%;object-fit:cover;display:block}
.cyr-j{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;padding:3px 0;color:var(--sub)}
.cyr-j span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cyr-j b{color:var(--text);white-space:nowrap}.cyr-j b.miss{color:var(--yellow)}.cyr-j b.free{color:var(--cyan)}
.cyr-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 14px;font-size:12.5px;color:var(--sub);margin-top:4px}
.cyr-grid div{display:flex;justify-content:space-between;gap:6px}.cyr-grid b{color:var(--text)}.cyr-grid b.bad{color:var(--red)}.cyr-grid b.ok{color:var(--green)}
.cyr-tot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:14px;font-weight:900}
.cyr-tot .bad{color:var(--red)}.cyr-tot .ok{color:var(--green)}.cyr-tot .warn{color:var(--yellow)}
.cyr-people{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;font-size:12px;color:var(--sub)}
.cyr-people span{background:var(--card2);border-radius:7px;padding:3px 8px}.cyr-people b{color:var(--text)}.cyr-people b.bad{color:var(--red)}
.cyr-note{font-size:11px;color:var(--dim);text-align:center;margin-top:8px;line-height:1.5}
.cyr-recs{display:flex;gap:8px;flex-wrap:wrap}
.cyr-rec{display:flex;align-items:center;gap:8px;background:var(--card2);border-radius:10px;padding:6px 8px 6px 6px;flex:1;min-width:140px}
.cyr-rec .cyr-th{width:46px;height:46px}
.cyr-rec .t{font-size:12.5px;line-height:1.35}.cyr-rec .t b{display:block;font-size:13px}
.cyr-tag{display:inline-block;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:800;min-width:34px;text-align:center}
.cyr-tag.out{background:rgba(48,209,88,.16);color:var(--green)}.cyr-tag.in{background:rgba(100,210,255,.16);color:var(--cyan)}.cyr-tag.use{background:rgba(255,255,255,.08);color:var(--sub)}
.cyr-prod{padding:8px 0 6px;border-top:1px solid var(--border)}
.cyr-prod:first-of-type{border-top:none;padding-top:4px}
.cyr-ph{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:14px;font-weight:900;margin-bottom:4px}
.cyr-ph .d{font-size:13px}.cyr-ph .d.bad{color:var(--red)}.cyr-ph .d.ok{color:var(--green)}.cyr-ph .d.warn{color:var(--yellow)}.cyr-ph .d.dim{color:var(--sub);font-weight:700}
.cyr-pl{display:flex;align-items:baseline;gap:7px;font-size:13px;padding:2px 0;line-height:1.4}
.cyr-pl b{min-width:44px;text-align:right}.cyr-pl .q{color:var(--sub);font-size:12px;flex:1;min-width:0}
.cyr-pl.out b{color:var(--green)}.cyr-pl.in b{color:var(--cyan)}.cyr-pl.use b{color:var(--text)}
.cyr-ft{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;padding-bottom:max(14px,env(safe-area-inset-bottom));display:flex;justify-content:center;gap:10px;pointer-events:none;z-index:6}
.cyr-ft button{pointer-events:auto;padding:11px 26px;border-radius:22px;border:1px solid rgba(255,255,255,.12);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer;background:rgba(40,42,50,.92);color:var(--text);backdrop-filter:blur(8px)}
.cyr-ft button.lnk{background:transparent;border-color:transparent;color:var(--dim);font-size:12px;font-weight:700;padding:11px 8px}
`;
function ensureRep(){
  if(!$('cyRepCss')){const st=document.createElement('style');st.id='cyRepCss';st.textContent=REP_CSS;document.head.appendChild(st)}
  if(!$('cyRep')){const d=document.createElement('div');d.id='cyRep';d.innerHTML='<div class="cyr-in" id="cyRepIn"></div><div class="cyr-ft"><button type="button" onclick="ioCycle.reportClose()">✕ 닫기</button><button type="button" class="lnk" onclick="ioCycle.reportCopy()">텍스트로 복사</button></div>';document.body.appendChild(d)}
}
function origTxt(r){const h=arr(r.hist);if(!h.length)return '';const o=h[0];const q=(arr(o.items)).reduce((a,it)=>a+nn(it.total)+nn(it.tQty),0);return o.zero?' · 원래 0장':q?' · 원래 '+q+'장':''}
function editTag(r){return nn(r.editN)?` <span class="cyr-chip warn" style="padding:1px 6px">수정 ${nn(r.editN)}회${esc(origTxt(r))}</span>`:''}
function recThumb(r){
  let local={};try{local=X.records().local||{}}catch(e){}
  const lp=local[r.id];
  if(lp&&lp.photo)return `<div class="cyr-th"><img src="${lp.photo}" alt=""></div>`;
  if(r.photoId)return `<div class="cyr-th" onclick="ioView('${esc(r.photoId)}')"><img src="${U.thumbUrl(r.photoId,240)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='사진<br>실패'"></div>`;
  if(r.zero)return '';
  return `<div class="cyr-th">사진<br>전송 중</div>`;
}
function recLines(r){ // 기록 1건의 제품별 줄
  return (r.items||[]).filter(it=>it&&(nn(it.total)||nn(it.tQty))).map(it=>{const parts=[['센터',it.cQty],['사이드',it.sQty],['코너',it.kQty],['10T',it.tQty]].filter(x=>nn(x[1])>0).map(x=>x[0]+' '+nn(x[1]));
    return `<div class="l"><b>${esc(it.product||'')}</b> <b>${nn(it.total)+nn(it.tQty)}장</b>${parts.length?' <span>'+esc(parts.join(' · '))+'</span>':''}</div>`}).join('');
}
function recRow(r){
  const q=recQty(r);
  return `<div class="cyr-row"><div class="b"><div><b>${esc(U.hm(r.at))}</b> ${r.type==='in'?'반납':'출고'} <b>${q}장</b>${r.zero?' <span class="l">다 써서 없음</span>':''}${r.late?' <span class="cyr-chip warn" style="padding:1px 6px">지연 입력</span>':''}${r.wdate&&r.wdate!==r.date?` <span class="l">${esc(U.fmtMD(r.wdate))} 것</span>`:''}${editTag(r)}</div>${recLines(r)}${r.note&&!r.zero?`<div class="l">${esc(String(r.note).slice(0,60))}</div>`:''}</div>${recThumb(r)}</div>`;
}
function partsByProd(recs){ // 기록들 → {제품:{c,s,k,t,total}}
  const o={};recs.forEach(r=>{(r.items||[]).forEach(it=>{const k=it.product||'?';const x=o[k]||(o[k]={c:0,s:0,k:0,t:0,total:0});x.c+=nn(it.cQty);x.s+=nn(it.sQty);x.k+=nn(it.kQty);x.t+=nn(it.tQty);x.total+=nn(it.total)+nn(it.tQty)})});return o;
}
function partsStr(x){if(!x)return '';return [['센터',x.c],['사이드',x.s],['코너',x.k],['10T',x.t]].filter(a=>a[1]>0).map(a=>a[0]+' '+a[1]).join(' · ')}
function jobLabel(r){return r.st==='miss'?'미입력':r.st==='asmiss'?'AS보고 없음':r.st==='load'?'확인 중':r.st==='future'?'예정':r.st==='zero'?'0장':r.asFree?'AS 무상 '+r.asFree:(r.sold||0)+'장'}
function reportHTML(cy){
  const tn=teamNo(cy.crew,cy.plate);const chip=stChip(cy);
  const chipCls=chip[0]==='bad'?'bad':chip[0]==='ok'?'ok':chip[0]==='wait'?'warn':chip[0]==='blue'?'blue':'';
  let h=`<div class="cyr-hd"><div><div class="cyr-t">📦 출고·반납 보고</div><div class="cyr-s">${esc(RN)} ${tn?tn+'팀 · ':''}${esc(cy.crew.join('·'))} · ${esc(cy.plate)}<br>${esc(U.fmtD(cy.fromW))}${!cy.open&&cy.toW!==cy.fromW?' ~ '+esc(U.fmtD(cy.toW)):''}${cy.open?' · 반납 전':' · 반납 '+esc(String(cy.endAt||'').slice(5,16))}</div></div><span class="cyr-chip ${chipCls}">${chip[1]}</span></div>`;
  // 기록 띠: 출고·반납 기록(시각·장수·사진) 한 줄
  const recChip=r=>`<div class="cyr-rec">${recThumb(r)}<div class="t"><span class="cyr-tag ${r.type==='in'?'in':'out'}">${r.type==='in'?'반납':'출고'}</span> ${esc(U.hm(r.at))}${r.wdate&&r.wdate!==r.date?' <span style="color:var(--sub)">'+esc(U.fmtMD(r.wdate))+' 것</span>':''}<b>${recQty(r)}장${r.zero?' · 다 써서 없음':''}${r.late?' · <span style="color:var(--yellow)">지연</span>':''}${nn(r.editN)?' · <span style="color:var(--yellow)">수정 '+nn(r.editN)+'회'+origTxt(r)+'</span>':''}</b></div></div>`;
  h+=`<div class="cyr-sec"><div class="cyr-recs">${cy.outs.map(recChip).join('')}${cy.ins.map(recChip).join('')}${cy.open?`<div class="cyr-rec"><div class="t"><span class="cyr-tag in">반납</span> 전<b>차 잔량 ${cy.remain}장</b></div></div>`:''}</div></div>`;
  // 제품별 대조: 출고 / 사용 / 반납 나란히 + 로스
  const PO=partsByProd(cy.outs),PI=partsByProd(cy.ins);
  const keys=PRODUCTS.map(p=>p.k).filter(k=>PO[k]||PI[k]||cy.byProd.some(b=>b.k===k)).concat(Object.keys(Object.assign({},PO,PI)).filter(k=>!PRODUCTS.some(p=>p.k===k)));
  h+=`<div class="cyr-sec"><div class="cyr-sh"><span>제품별 대조</span><small>출고 − 사용 − 반납 = 로스</small></div>`;
  keys.forEach(k=>{const b=cy.byProd.find(x=>x.k===k)||{out:0,inn:0,sold:0,asFree:0,scrap:0,used:0,diff:0};
    const dTxt=cy.open?'잔 '+(b.out-b.used):cy.decided?diffTxt(b.diff):'대기';
    const dCls=cy.open?'dim':!cy.decided?'warn':diffCls(b.diff);
    const useQ=[b.sold?'시공 '+b.sold:'',b.asFree?'AS 무상 '+b.asFree:''].filter(Boolean).join(' · ');
    h+=`<div class="cyr-prod"><div class="cyr-ph"><span>${esc(k)}</span><span class="d ${dCls}">${dTxt}</span></div>
      <div class="cyr-pl out"><span class="cyr-tag out">출고</span><b>${b.out}장</b><span class="q">${esc(partsStr(PO[k]))}</span></div>
      <div class="cyr-pl use"><span class="cyr-tag use">사용</span><b>${b.used}장</b><span class="q">${esc(useQ)}</span></div>
      <div class="cyr-pl in"><span class="cyr-tag in">반납</span><b>${cy.open?'–':b.inn+'장'}</b><span class="q">${cy.open?'반납 전':esc(partsStr(PI[k])||(cy.zero?'다 써서 없음':''))}</span></div></div>`;
  });
  h+=`</div>`;
  // 사용 내역 (현장별)
  const useSub=[`시공 ${cy.sold}`].concat(cy.asFree?['AS 무상 '+cy.asFree]:[]).join(' · ');
  h+=`<div class="cyr-sec"><div class="cyr-sh"><span>사용 ${cy.used}장 · 현장</span><small>${esc(useSub)}</small></div>${cy.jobs.map(r=>`<div class="cyr-j"><span>${r.isAs?'<span style="color:var(--red)">AS</span> ':esc(r.time||'')+' '}${esc(r.addr)}${r.prod?' <span style="opacity:.75">· '+esc(r.prod)+'</span>':''}${r.asFree&&r.defect?' <span style="color:var(--yellow)">시공하자 → '+(r.prev.length?esc(r.prev.join('·'))+' −'+r.asFree:'이전작업자 미기재')+'</span>':''}</span><b class="${r.st==='miss'||r.st==='asmiss'?'miss':r.asFree?'free':''}">${jobLabel(r)}</b></div>`).join('')||'<div class="cyr-j"><span>연결된 시공 없음</span></div>'}</div>`;
  // 합계
  const totCls=cy.decided?diffCls(cy.diff):'warn';
  const totTxt=cy.open?'반납 후 확정':cy.decided?(cy.diff===0?'일치 · 로스 0':cy.diff>0?'로스 '+cy.diff+'장':'자투리 활용 +'+(-cy.diff)+'장'):'대조 대기';
  const waitWhy=[].concat(cy.miss.length?['시공보고 미입력 '+cy.miss.length]:[]).concat(cy.asMiss.length?['AS보고 없음 '+cy.asMiss.length]:[]).join(' · ');
  h+=`<div class="cyr-sec"><div class="cyr-tot" style="margin-top:0;padding-top:0;border-top:none"><span>합계 · 출고 ${cy.out} − 사용 ${cy.used} − 반납 ${cy.open?'–':cy.inn}</span><span class="${cy.open?'':totCls}">${cy.open?'잔량 '+cy.remain+'장':totTxt}</span></div>
    ${waitWhy&&!cy.open?`<div class="cyr-note" style="text-align:left;margin-top:4px">${esc(waitWhy)} — 들어오면 자동 반영</div>`:''}
    ${!cy.open&&cy.crew.length?`<div class="cyr-people">${cy.crew.map(n=>`<span>${esc(n)} <b class="${cy.decided&&cy.diff>0?'bad':''}">${cy.decided?netTxt(cy.diff):'—'}</b></span>`).join('')}<span>공동작업 기준 · 로스 − / 자투리 +</span></div>`:''}
    ${cy.ov&&cy.ov.confirm?`<div class="cyr-note">확정 ${esc(cy.ov.confirm.by||'')} ${esc(String(cy.ov.confirm.at||'').slice(5,16))}</div>`:''}</div>`;
  h+=`<div class="cyr-note">${esc(U.kstDT(new Date()).slice(0,16))} 기준 · 시공보고가 들어오면 자동 갱신</div>`;
  return h;
}
function reportText(cy){
  const tn=teamNo(cy.crew,cy.plate);const L=[];
  L.push(`[${RN}${tn?' '+tn+'팀':''} · ${cy.plate}] 출고·반납 보고 ${cy.open?U.fmtMD(cy.fromW):cyLabel(cy)}`);
  L.push('담당: '+cy.crew.join(' / '));
  const PO=partsByProd(cy.outs),PI=partsByProd(cy.ins);
  cy.outs.forEach(r=>L.push('출고 '+U.hm(r.at)+' '+recQty(r)+'장'+(r.late?' (지연 입력)':'')));
  cy.ins.forEach(r=>L.push('반납 '+U.hm(r.at)+' '+recQty(r)+'장'+(r.zero?' (다 써서 없음)':'')));
  if(cy.open)L.push('반납 전 · 차 잔량 '+cy.remain+'장');
  cy.byProd.forEach(b=>{L.push('· '+b.k+': 출고 '+b.out+(PO[b.k]&&partsStr(PO[b.k])?' ('+partsStr(PO[b.k])+')':'')+' / 사용 '+b.used+' / 반납 '+(cy.open?'–':b.inn+(PI[b.k]&&partsStr(PI[b.k])?' ('+partsStr(PI[b.k])+')':''))+' → '+(cy.open?'잔 '+(b.out-b.used):cy.decided?diffTxt(b.diff):'대기'))});
  L.push('사용 '+cy.used+'장 (시공 '+cy.sold+(cy.asFree?' / AS 무상 '+cy.asFree:'')+')');cy.jobs.forEach(r=>{L.push('  '+(r.isAs?'AS ':'')+r.addr+' — '+jobLabel(r)+(r.asFree&&r.defect&&r.prev.length?' (시공하자 → '+r.prev.join('·')+' −'+r.asFree+')':''))});
  L.push('합계: '+(cy.open?'반납 후 확정':cy.decided?diffTxt(cy.diff):'대조 대기'));
  if(!cy.open&&cy.decided)L.push(cy.crew.map(n=>n+': '+netTxt(cy.diff)).join(' / ')+' (공동작업 기준 · 로스 − / 자투리 +)');
  L.push('상태: '+stChip(cy)[1]);
  return L.join('\n');
}
function repCycle(){if(!REP)return null;const {cur,list}=latestOf(REP.plate);return REP.startTs?(list.find(c=>c.startTs===REP.startTs)||null):cur}
function renderReport(){const cy=repCycle();if(!cy){reportClose();return}ensureRep();$('cyRepIn').innerHTML=reportHTML(cy)}
function report(plate,startTs){
  const {cur}=latestOf(plate);if(!cur&&!startTs){X.toast('아직 출고 기록이 없어요');return}
  REP={plate,startTs:startTs?+startTs:0};ensureRep();renderReport();$('cyRep').classList.add('show');$('cyRep').scrollTop=0;
}
function reportClose(){REP=null;const d=$('cyRep');if(d)d.classList.remove('show')}
function reportCopy(){const cy=repCycle();if(!cy)return;const t=reportText(cy);
  const done=()=>X.toast('복사했어요 — 단톡방에 붙여넣기');
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done).catch(()=>{prompt('복사해서 쓰세요',t)});return}}catch(e){}
  prompt('복사해서 쓰세요',t);
}

/* ---------- 시작 ---------- */
try{db.ref(NODE).on('value',s=>{OV=s.val()||{};rerender()})}catch(e){console.warn('[iocycle] fb',e)}
window.ioCycle={ver:CY_VER,cardsHTML,cyclesOf,latestOf,cycleOn,openBy,reset,vehCrew,vehOv,crewFor,schedJobs,prodLabel,report,reportClose,reportCopy,person,pplToggle,relearn,ledgerAll,open:v=>{const {cur:c}=latestOf(v.plate);if(c)openBy(v.plate,c.startTs);else X.toast('아직 출고 기록이 없어요')},close,save:saveEdit,confirm:confirmCy,zero,hist,shareHTML,shareText,_t:{compute,parseQty,reportHTML,reportText,ledgerCalc,snapCutoff,snapBuild,snap:()=>SNAP,setSnap:v=>{SNAP=v},mrec:()=>MREC}};
})();
