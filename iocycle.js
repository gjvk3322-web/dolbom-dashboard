/* iocycle.js — 돌봄매트 입출고 '순환' 기준 팀 카드 (부산·경기 공용) · v1 2026-09-30
   iolog.js(window.__io) 다음, ioadmin.js 다음에 불러옴 (iolog.js loadBoard가 순서대로 붙임).

   ■ 순환(cycle) = 차량 기준으로 "출고를 찍은 순간 ~ 반납(입고)을 찍은 순간"
     · 출고를 여러 번 찍어도 반납 전이면 같은 순환에 누적 (차 잔량 = 누적 출고 − 사용)
     · 반납을 찍으면 순환이 닫힘. 규칙: 남은 매트는 무조건 반납 후 다시 출고 (이월·인계 없음). 다 써서 0장이면 [반납 0장]으로 닫음
     · 반납 뒤 새 출고가 오면 새 순환 시작. 반납이 여러 번이면(부분 반납) 다음 출고 전까지 전부 같은 순환
   ■ 사용(자동) = 순환 기간(첫 출고 작업일 ~ 마지막 반납 작업일, 열려 있으면 오늘)에 이 차량으로 잡힌 시공보고 판매갯수(시공스케줄 Y열)
     + AS보고서(Firebase asReports)의 '들어간 장수' — 결제 무료면 A(무상 AS), 유상이면 판매로. '자투리사용'은 0장
     시공 연결: 시트 L열 차량번호 우선, 없으면 그 순환 담당 2명 중 한 명이 사수인 건. 틀리면 카드에서 빼고 넣을 수 있음
   ■ 로스 = 출고 − (판매 − 자투리 활용 + 무상 AS) − 반납   (제품·색상 합계 기준, 형태는 안 봄)
     양수 = 부족(안 돌아옴), 음수 = 초과(원인 확인). 시공보고 미입력·AS보고 미제출·반납 전이면 확정 안 함
   ■ 개인 적용 = 그 순환의 담당 2명(출고 때 자동, 카드에서 변경) 각각에 같은 로스·자투리를 '공동작업 기준'으로 표시. 회사 집계는 1번
   ■ 저장 (원본 io_logs는 안 건드림): Firebase io_cycle/{bs|gg}/{차량키}/{시작ts} = {crew:[a,b], add:{jobId:1}, del:{jobId:1}, scrap:{제품:장}, confirm:{by,at}, by, at}
     차량 기준 설정: io_cycle/{bs|gg}/{차량키}/_veh = {crew:[..], crewByDate:{날짜:[..]}, add:{jobId:1}, del:{jobId:1}} — 갈 현장 넣기·빼기, 특정 날짜 담당 고정
   ■ 담당(그날 실제 팀)은 스케줄에서 자동: 그 날짜에 이 차량(시트 L열 차량번호, 없으면 차량 탭 사수)으로 잡힌 시공의 사수·부사수.
     우선순위: 순환별 수정 > 날짜별 수정(_veh.crewByDate) > 스케줄 > 출고 때 적은 담당 > 차량 기본(_veh.crew > 차량 탭 사수 + 팀설정 짝)
   ■ 시공 연결은 차량번호 기준(없으면 사수=차량 탭 사수). 닫힌 순환에 쓰인 시공은 다음 순환에 다시 안 붙고, 다른 차량 카드에서 수동으로 가져간 시공은 이 차량에서 빠짐
   ■ 자투리 입력·확정은 당번 모드. 담당 변경·시공 연결 수정은 누구나 */
(function(){
'use strict';
const X=window.__io;
if(!X||!X.util||!X.records){console.warn('[iocycle] iolog.js v27+ 필요');return}
const U=X.util,PRODUCTS=X.PRODUCTS,PART=X.PART,RK=X.RK,RN=X.RN;
const $=id=>document.getElementById(id),esc=U.esc;
const NODE=(X.beta?'io_cycle_beta/':'io_cycle/')+RK;
const CY_VER='2026.10.01m';
const CY_START='2026-09-30'; // 순환 시작일 — 이 날 이전 기록은 '반납→출고' 규칙 전이라 순환에서 제외 (옛 테스트 기록이 카드를 오염시키지 않게)
const NP=p=>U.normPlate(p)||'_';
const nn=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
let OV={};          // 오버라이드 {plateKey:{startTs:{...}}}
let AS={};          // asReports 캐시 {jobId: rec|null}
let asWait={};      // 불러오는 중
let SEL=null;       // 모달이 잡은 순환 {plate,startTs}
let HIST_OPEN={};   // 지난 순환 펼침 {plateKey:true}
let REP=null;       // 보고 화면 {plate,startTs}

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
function cyclesOf(plate){
  const np=NP(plate);const today=U.kstDate(0);
  const recs=Object.values(records()).filter(r=>r&&r.status!=='void'&&NP(r.vehicle)===np&&r.ts&&String(r.date||'')>=CY_START).sort((a,b)=>a.ts-b.ts);
  const list=[];let cur=null;const consumed=new Set();
  const mk=r=>({plate:r.vehicle||plate,startTs:r.ts,startAt:r.at,outs:[],ins:[],seed:crewOf(r),crew:[]});
  recs.forEach(r=>{
    if(r.type==='in'){if(!cur)cur=Object.assign(mk(r),{orphan:true});cur.ins.push(r);return}
    if(cur&&cur.ins.length){list.push(cur);cur=null}
    if(!cur)cur=mk(r);cur.outs.push(r);
  });
  if(cur)list.push(cur);
  list.forEach(cy=>{
    const ov=ovOf(cy);
    cy.ov=ov;cy.open=!cy.ins.length;
    const wds=cy.outs.map(r=>r.wdate||r.date).filter(Boolean).sort();
    cy.fromW=wds[0]||U.kstDate(0,new Date(cy.startTs));cy.lastW=wds[wds.length-1]||cy.fromW;
    const iws=cy.ins.map(r=>r.wdate||r.date).filter(Boolean).sort();
    cy.toW=cy.open?today:(iws[iws.length-1]||cy.fromW);
    if(cy.toW<cy.fromW)cy.toW=cy.fromW;
    cy.endAt=cy.open?'':cy.ins[cy.ins.length-1].at;
    cy.zero=!cy.open&&cy.ins.every(r=>r.zero||!recQty(r));
    compute(cy,consumed);
    if(!cy.open)cy.jobs.forEach(r=>consumed.add(r.id)); // 닫힌 순환에 쓰인 시공은 다음 순환에 다시 안 붙음
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
function compute(cy,consumed){
  const ov=cy.ov||{};const vo=vehOv(cy.plate);const add=Object.assign({},vo.add||{},ov.add||{}),del=Object.assign({},vo.del||{},ov.del||{});
  Object.keys(ov.add||{}).forEach(k=>{delete del[k]});Object.keys(ov.del||{}).forEach(k=>{delete add[k]}); // 순환별 결정이 차량 설정보다 우선
  const by={};const P=k=>by[k]||(by[k]={out:0,inn:0,sold:0,asFree:0,scrap:0});
  cy.outs.forEach(r=>{const t={};recByProd(r,t);Object.keys(t).forEach(k=>{P(k).out+=t[k]})});
  cy.ins.forEach(r=>{const t={};recByProd(r,t);Object.keys(t).forEach(k=>{P(k).inn+=t[k]})});
  Object.keys(ov.scrap||{}).forEach(k=>{P(k).scrap+=nn(ov.scrap[k])});
  const J=jobs();const linked=[],miss=[],asMiss=[];let asLoading=false;
  J.forEach(j=>{
    if(!j||!jobOK(j))return;
    if(consumed&&consumed.has(j.id))return; // 앞 순환에서 이미 정산된 시공
    const inWin=j.date>=cy.fromW&&j.date<=cy.toW;
    const auto=inWin&&jobMatches(j,cy.plate);
    if(del[j.id])return;
    if(!auto&&!add[j.id])return;
    if(!(ov.add||{})[j.id]&&claimedElsewhere(j.id,cy.plate))return; // 다른 차량 카드가 가져간 시공
    const isAs=/^AS$/i.test(String(j.time||'').trim());
    const pk=X.prodKeyOfCode(j.mat&&j.mat[0]&&j.mat[0].t)||'';
    const row={id:j.id,date:j.date,addr:String(j.addr||'').replace(/\(.*?\)/g,'').trim().slice(0,20),time:String(j.time||'').slice(0,2),py:String(j.py||'').trim(),prod:prodLabel(j),sasu:j.sasu||'',busasu:j.busasu||'',isAs,auto,sold:0,asFree:0,pk,st:''};
    const sold=+j.sold||0;
    if(sold>0){row.sold=sold;P(pk||'?').sold+=sold;row.st='ok'}
    else if(isAs){
      const a=asOf(j.id);
      if(a===undefined){row.st='load';asLoading=true}
      else if(!a){row.st='asmiss';asMiss.push(row)}
      else{const q=parseQty(a.qty);const k=X.prodKeyOfCode(a.color)||pk||'?';
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
  cy.byProd=prods.map(k=>{const b=by[k];const used=b.sold-b.scrap+b.asFree;return {k,out:b.out,inn:b.inn,sold:b.sold,asFree:b.asFree,scrap:b.scrap,used,diff:b.out-used-b.inn}});
  const T=cy.byProd.reduce((t,b)=>{['out','inn','sold','asFree','scrap','used','diff'].forEach(f=>t[f]+=b[f]);return t},{out:0,inn:0,sold:0,asFree:0,scrap:0,used:0,diff:0});
  Object.assign(cy,T,{jobs:linked,miss,asMiss,asLoading,jobsN:linked.filter(r=>r.sold||r.asFree).length});
  cy.confirmed=!!(ov.confirm&&ov.confirm.at);
  if(cy.open)cy.st='open';
  else if(!cy.outs.length)cy.st='noout';
  else if(asLoading)cy.st='load';
  else if(miss.length||asMiss.length)cy.st='wait';
  else if(cy.diff===0)cy.st='fit';
  else if(cy.diff>0)cy.st='loss';
  else cy.st='over';
  cy.decided=cy.st==='fit'||cy.st==='loss'||cy.st==='over';
  cy.remain=cy.out-cy.used; // 열린 순환의 차 잔량
}
function latestOf(plate){const l=cyclesOf(plate);return {cur:l[l.length-1]||null,list:l,consumed:l.consumed}}
function cyLabel(cy){return U.fmtMD(cy.fromW)+(cy.toW!==cy.fromW?'~'+U.fmtMD(cy.toW):'')}
function stChip(cy){
  return ({open:['blue','진행중 · 반납 전'],noout:['wait','출고 기록 없음'],load:['','AS보고 확인 중'],wait:['wait','대조 대기'],fit:['ok',cy.confirmed?'확정 · 일치':'일치'],loss:['bad',(cy.confirmed?'확정 · ':'')+'로스 +'+cy.diff],over:['wait','초과 '+cy.diff+' · 확인 필요']})[cy.st]||['','']
}
function sgn(n){return (n>0?'+':'')+n}

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
`;
function ensureCss(){if(!$('cyCss')){const s=document.createElement('style');s.id='cyCss';s.textContent=CSS;document.head.appendChild(s)}}
function prodLines(cy){
  if(!cy.byProd.length)return '';
  return `<div class="ia-prods">${cy.byProd.map(b=>`<div class="ia-prodsec"><div class="p"><b><span>${esc(b.k)}</span><span>${cy.open?'잔량 '+(b.out-b.used):sgn(b.diff)}</span></b><span>출고 ${b.out} · 사용 ${b.used}${b.asFree?' (AS '+b.asFree+')':''}${b.scrap?' (자투리 −'+b.scrap+')':''} · 반납 ${b.inn}</span></div></div>`).join('')}</div>`;
}
function jobLines(cy){
  if(!cy.jobs.length)return `<div class="cy-jobs">연결된 시공 없음${cy.open?' · 시공보고가 들어오면 자동으로 붙어요':''}</div>`;
  const lab=r=>r.st==='miss'?'미입력':r.st==='asmiss'?'AS보고 없음':r.st==='load'?'확인 중':r.st==='future'?'예정':r.st==='zero'?'0장':r.asFree?'AS 무상 '+r.asFree:r.sold+'장';
  return `<div class="cy-jobs">${cy.jobs.map(r=>`<div class="j ${r.st==='miss'||r.st==='asmiss'?'miss':r.asFree?'free':''}"><span>${esc(U.fmtMD(r.date))} ${r.isAs?'<span style="color:var(--red)">AS</span> ':''}${esc(r.addr)}${r.auto?'':' <span style="color:var(--dm-blue)">수동</span>'}<small>${esc(r.prod||'')}${r.py?' · '+esc(r.py)+'평':''}</small></span><b>${lab(r)}</b></div>`).join('')}</div>`;
}
function peopleLines(cy){
  if(!cy.crew.length)return '';
  const on=cy.decided;
  return `<div class="cy-people">${cy.crew.map(n=>`<span class="${on&&cy.diff>0?'bad':''}">${esc(n)} <b>${on?(cy.diff>0?'로스 '+cy.diff:cy.diff<0?'초과 '+(-cy.diff):'로스 0'):'—'}</b>${cy.scrap?` · 자투리 ${cy.scrap}`:''}</span>`).join('')}<span class="ia-tiny">공동작업 기준 · 회사 로스는 1번</span></div>`;
}
function metrics(cy){
  const m=(lab,val,cls)=>`<div><span>${lab}</span><b class="${cls||''}">${val}</b><small>장</small></div>`;
  if(cy.open)return m('출고 누적',cy.out)+m('사용 (자동)',cy.used)+m('차 잔량',cy.remain,cy.remain<0?'ia-loss':'')+m('반납','–','dimv');
  return m('출고',cy.out)+m('사용',cy.used)+m('반납',cy.inn)+m('로스',cy.decided?sgn(cy.diff):'–',cy.decided?(cy.diff>0?'ia-loss':cy.diff===0?'ia-fit':'ia-hold'):'dimv');
}
function histHTML(plate,list){
  const past=list.slice(0,-1).slice(-6).reverse();if(!past.length)return '';
  const k=NP(plate);
  return `<details class="cy-hist" ${HIST_OPEN[k]?'open':''} ontoggle="ioCycle.hist('${esc(k)}',this.open)"><summary>지난 순환 ${past.length}건</summary>${past.map(c=>`<div class="h" onclick="ioCycle.openBy('${esc(plate)}',${c.startTs})"><span>${esc(cyLabel(c))} · ${esc(c.crew.join('·'))}</span><b class="${c.decided?(c.diff>0?'bad':c.diff===0?'ok':''):''}">${c.decided?(c.diff===0?'일치':sgn(c.diff)):stChip(c)[1]}</b></div>`).join('')}</details>`;
}
function prodLabel(j){const k=X.prodKeyOfCode(j.mat&&j.mat[0]&&j.mat[0].t);if(k)return k.replace('1M ','1M·');return /이전설치/.test(String(j.category||'')+String(j.time||''))?'이전설치':'제품 미정'}
function upcomingHTML(v,up,from){ // 갈 현장: 선택 날짜 이후 이 차량의 첫 시공일 목록 (출고 전 실을 양 참고)
  if(!up.date)return '';const add=vehOv(v.plate).add||{};
  return `<div class="cy-jobs cy-next"><div class="nh">${esc(U.fmtMD(up.date))} 갈 현장 ${up.list.length}곳${up.date===from?'':' <small>다음 시공일</small>'}</div>${up.list.map(j=>`<div class="j"><span>${/^AS$/i.test(j.time)?'<span style="color:var(--red)">AS</span>':esc(String(j.time||'').slice(0,2))} ${esc(String(j.addr||'').replace(/\(.*?\)/g,'').trim().slice(0,18))}${add[j.id]?' <span style="color:var(--dm-blue)">수동</span>':''}</span><b>${esc(prodLabel(j))}${j.py?' · '+esc(j.py)+'평':''}</b></div>`).join('')}</div>`;
}
function cardHTML(v){
  const S_=cardHTML.S||{};
  const {cur,list,consumed}=latestOf(v.plate);const from=S_.from||U.kstDate(0);
  const open=!!(cur&&cur.open);
  const up=open?{date:'',list:[]}:upcomingOf(v.plate,from,consumed); // 열린 순환이 있으면 연결된 시공 목록이 곧 갈 현장
  const who=open?cur.crew:(up.date?crewFor(v.plate,up.date):vehCrew(v.plate)); // 그날 실제 팀은 스케줄 기준
  const tn=teamNo(who,v.plate);const chip=cur?stChip(cur):['','기록 없음'];
  const outW=open?cur.lastW:(up.date||from),inW=open?cur.lastW:from; // 출고 작업일 = 카드에 보이는 갈 현장 날짜(순환 중이면 그 순환 날짜), 반납 = 그 순환 날짜
  let mine=false;try{mine=!!X.myPlate&&U.normPlate(X.myPlate())===NP(v.plate)}catch(e){}
  let h=`<div class="ia-team cy-card${mine?' mine':''}"><div class="ia-teamtop"><span class="ia-teamname">${tn?tn+'팀 · ':''}${esc(who.join('·')||'담당 미지정')}<small>${esc(v.plate)}</small></span><span class="ia-status ${chip[0]}">${chip[1]}</span></div>`;
  if(cur||mine)h+=`<div class="cy-crew">${cur?`<span class="ia-tiny">${esc(cyLabel(cur))} · ${cur.open?'출고 '+esc(String(cur.startAt||'').slice(5,16)):'반납 '+esc(String(cur.endAt||'').slice(5,16))}</span>`:''}${mine?' <span style="color:var(--dm-blue)">내 차량</span>':''}</div>`;
  if(cur){h+=`<div class="ia-metrics">${metrics(cur)}</div>${prodLines(cur)}${jobLines(cur)}${!cur.open?peopleLines(cur):''}`;
    const foot=[];
    if(cur.miss.length)foot.push(`시공보고 미입력 <b>${cur.miss.length}건</b> — 들어오면 자동 반영`);
    if(cur.asMiss.length)foot.push(`AS보고서 미제출 <b>${cur.asMiss.length}건</b>`);
    if(cur.st==='over')foot.push('출고보다 사용·반납이 많아요 — 자투리 활용이면 카드 수정에서 입력');
    if(cur.zero&&!cur.open)foot.push('반납 0장(다 씀)으로 닫힘');
    if(cur.ov.confirm)foot.push(`확정 ${esc(cur.ov.confirm.by||'')} ${esc(String(cur.ov.confirm.at||'').slice(5,16))}`);
    if(foot.length)h+=`<div class="ia-teamfoot">${foot.join('<br>')}</div>`;
  }else h+=`<div class="ia-tiny" style="margin-top:6px">아직 출고 기록이 없어요. 차에 실으면 [출고]를 눌러주세요.</div>`;
  h+=upcomingHTML(v,up,from);
  h+=`<div class="cy-acts"><button type="button" class="ia-button quiet" onclick="ioCycle.openBy('${esc(v.plate)}',${cur?cur.startTs:0})">수정</button><button type="button" class="ia-button${open?'':' primary'}" onclick="ioOpen('out','${esc(v.plate)}','${esc(outW)}')">출고</button><button type="button" class="ia-button${open?' primary':''}" onclick="ioOpen('in','${esc(v.plate)}','${esc(inW)}')">반납</button><button type="button" class="ia-button quiet" ${cur?`onclick="ioCycle.report('${esc(v.plate)}')"`:'disabled'}>보고</button>${open?`<button type="button" class="ia-button zero" onclick="ioCycle.zero('${esc(v.plate)}')">반납 0장 (다 써서 없음)</button>`:''}</div>`;
  h+=histHTML(v.plate,list);
  return h+'</div>';
}
function monthHTML(vehs,from,to){
  let h='';const tot={out:0,used:0,inn:0,diff:0,n:0,und:0};const per={};
  vehs.forEach(v=>{
    const {list}=latestOf(v.plate);const cys=list.filter(c=>!c.open&&c.toW>=from&&c.toW<=to);
    if(!cys.length)return;
    const t={out:0,used:0,inn:0,diff:0,n:0,und:0,scrap:0};
    cys.forEach(c=>{if(c.decided){t.n++;t.out+=c.out;t.used+=c.used;t.inn+=c.inn;t.diff+=c.diff;t.scrap+=c.scrap;c.crew.forEach(n=>{per[n]=per[n]||{n:0,loss:0,scrap:0};per[n].n++;per[n].loss+=c.diff;per[n].scrap+=c.scrap})}else t.und++});
    ['out','used','inn','diff','n','und'].forEach(f=>tot[f]+=t[f]);
    const tn=teamNo(cys[cys.length-1].crew,v.plate);
    h+=`<div class="ia-team cy-card"><div class="ia-teamtop"><span class="ia-teamname">${tn?tn+'팀':''}<small>${esc(v.plate)}</small></span><span class="ia-status ${t.diff>0?'bad':t.n?'ok':''}">${t.n?'확정 '+t.n+'회'+(t.und?' · 대기 '+t.und:''):'대기 '+t.und}</span></div>
      <div class="ia-metrics"><div><span>출고</span><b>${t.out}</b><small>장</small></div><div><span>사용</span><b>${t.used}</b><small>장</small></div><div><span>반납</span><b>${t.inn}</b><small>장</small></div><div><span>로스 합계</span><b class="${t.diff>0?'ia-loss':t.n?'ia-fit':'dimv'}">${t.n?sgn(t.diff):'–'}</b><small>장</small></div></div>
      ${t.scrap?`<div class="ia-tiny" style="margin-top:6px">자투리 활용 ${t.scrap}장</div>`:''}</div>`;
  });
  const people=Object.keys(per).sort((a,b)=>per[b].loss-per[a].loss);
  if(people.length)h+=`<div class="ia-team cy-card"><div class="ia-teamname">개인별 <small>공동작업 기준 · 합계는 회사 로스와 다름</small></div><div class="cy-people">${people.map(n=>`<span class="${per[n].loss>0?'bad':''}">${esc(n)} <b>${sgn(per[n].loss)}</b> · ${per[n].n}회${per[n].scrap?' · 자투리 '+per[n].scrap:''}</span>`).join('')}</div></div>`;
  h+=`<div class="ia-tiny" style="margin:4px 2px 12px">회사 실제 로스 <b style="color:${tot.diff>0?'var(--red)':'var(--dm-ink)'}">${sgn(tot.diff)}장</b> (확정 순환 ${tot.n}회${tot.und?' · 대조 대기 '+tot.und+'회 제외':''}) · 반납일이 이 달인 순환만</div>`;
  return h||`<div class="ia-empty">이 달에 닫힌 순환이 없어요</div>`;
}
function cardsHTML(M,S){
  ensureCss();
  if(S.mode==='month')return `<div class="ia-teams">${monthHTML(M.veh,S.from,S.to)}</div>`;
  cardHTML.S=S;
  return `<div class="ia-teams">${M.veh.map(cardHTML).join('')}</div>`;
}

/* ---------- 수정 모달 ---------- */
function md(html){let m=$('cyMd');if(!m){m=document.createElement('div');m.className='ia-md';m.id='cyMd';m.setAttribute('onclick','if(event.target===this)ioCycle.close()');m.innerHTML='<div class="ia-md-in cy-md" id="cyMdIn"></div>';document.body.appendChild(m)}$('cyMdIn').innerHTML=html;m.classList.add('show')}
function close(){const m=$('cyMd');if(m)m.classList.remove('show');SEL=null}
function cur(){if(!SEL||!SEL.startTs)return null;return cyclesOf(SEL.plate).find(c=>c.startTs===SEL.startTs)||null}
function openBy(plate,startTs){SEL={plate,startTs:+startTs};render()}
function upcomingFor(plate,cy){ // 모달용 갈 현장 후보: 그 날짜의 이 지역 시공 전부 (이 차량 것은 체크됨). 열린 순환이 있으면 순환 기간 다음 날부터
  const S=cardHTML.S||{};let from=S.from||U.kstDate(0);
  const {consumed}=latestOf(plate);const linked=new Set(cy?cy.jobs.map(r=>r.id):[]);
  if(cy&&cy.open&&cy.toW>=from)from=U.addDays(cy.toW,1);
  const up=upcomingOf(plate,from,consumed);
  let d=up.date;
  if(!d){const all=jobs().filter(j=>j&&jobOK(j)&&j.date>=from&&!linked.has(j.id)&&!(consumed&&consumed.has(j.id))).map(j=>j.date).sort();d=all[0]||''}
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
    <div class="ia-tiny">출고 ${cy.out} − 사용 ${cy.used}${cy.asFree?' (AS 무상 '+cy.asFree+')':''}${cy.scrap?' (자투리 −'+cy.scrap+')':''} − 반납 ${cy.open?'(전)':cy.inn} = ${cy.open?'잔량 '+cy.remain:'로스 '+sgn(cy.diff)}</div>`;
  }else h=`<h3>${esc(plate)} <span class="ia-status">${up.date?esc(U.fmtMD(up.date))+' 준비':'기록 없음'}</span></h3>`;
  const nSel=crew.length>=3?3:2;
  h+=`<label>담당${cy?'':up.date?' · '+esc(U.fmtMD(up.date)):' · 기본'}</label>
    <div class="row">${Array.from({length:nSel},(_,i)=>`<select id="cyC${i+1}">${opt(crew[i]||'')}</select>`).join('')}</div>`;
  if(cy){
  // 후보 시공: 기간 안 이 지역 시공 중 이 순환에 안 붙은 것(차량 다름) — 넣을 수 있게
  const linkedIds=new Set(cy.jobs.map(r=>r.id));
  const cand=jobs().filter(j=>j&&jobOK(j)&&j.date>=cy.fromW&&j.date<=cy.toW&&!linkedIds.has(j.id)&&!(cy.ov.del||{})[j.id]).slice(0,12);
  h+=`<label>연결된 시공</label>`;
  h+=cy.jobs.map(r=>`<div class="jl"><input type="checkbox" checked data-id="${esc(r.id)}"><span>${esc(U.fmtMD(r.date))} ${r.isAs?'AS ':''}${esc(r.addr)} <span class="ia-tiny">${esc([r.sasu,r.busasu].filter(Boolean).join('·'))}</span></span><b>${r.sold?r.sold+'장':r.asFree?'AS '+r.asFree:r.st==='miss'?'미입력':r.st==='asmiss'?'AS보고 없음':r.st==='future'?'예정':'0'}</b></div>`).join('')||'<div class="ia-tiny">없음</div>';
  if(cand.length)h+=`<label>같은 기간 다른 시공</label>`+cand.map(j=>`<div class="jl cand"><input type="checkbox" data-add="${esc(j.id)}"><span>${esc(U.fmtMD(j.date))} ${/^AS$/i.test(j.time)?'AS ':''}${esc(String(j.addr||'').slice(0,18))} <span class="ia-tiny">${esc([j.sasu,j.busasu].filter(Boolean).join('·'))}${j.vehicle?' · '+esc(j.vehicle):''}</span></span><b>${(+j.sold||0)?j.sold+'장':'—'}</b></div>`).join('');
  }
  if(up.list.length)h+=`<label>${esc(U.fmtMD(up.date))} 갈 현장</label>`+up.list.map(x=>`<div class="jl${x.on?'':' cand'}"><input type="checkbox" ${x.on?'checked':''} data-up="${esc(x.j.id)}" data-auto="${x.auto?1:0}"><span>${/^AS$/i.test(x.j.time)?'AS ':esc(String(x.j.time||'').slice(0,2))+' '}${esc(String(x.j.addr||'').replace(/\(.*?\)/g,'').slice(0,18))} <span class="ia-tiny">${esc([x.j.sasu,x.j.busasu].filter(Boolean).join('·'))}${x.j.vehicle?' · '+esc(x.j.vehicle):''}</span></span><b>${esc(prodLabel(x.j))}${x.j.py?' · '+esc(x.j.py)+'평':''}</b></div>`).join('');
  if(adm&&cy){h+=`<label>자투리 활용 · 장</label>`;
    const ks=PRODUCTS.map(p=>p.k).filter(k=>cy.byProd.some(b=>b.k===k)||(cy.ov.scrap||{})[k]);
    h+=(ks.length?ks:PRODUCTS.slice(0,1).map(p=>p.k)).map(k=>`<div class="sc"><span>${esc(k)}</span><input type="number" min="0" inputmode="numeric" data-scrap="${esc(k)}" value="${nn((cy.ov.scrap||{})[k])||''}" placeholder="0"></div>`).join('')}
  const last=(cy&&cy.ov.at)?cy.ov:vehOv(plate);
  if(last.at)h+=`<div class="cy-note">마지막 수정 ${esc(last.by||'')} ${esc(String(last.at||'').slice(5,16))}</div>`;
  h+=`<div class="bt"><button type="button" class="ia-btn" onclick="ioCycle.close()">닫기</button>${adm&&cy&&cy.decided?`<button type="button" class="ia-btn ${cy.confirmed?'':'ok'}" onclick="ioCycle.confirm(${cy.confirmed?0:1})">${cy.confirmed?'확정 해제':'로스 확정'}</button>`:''}<button type="button" class="ia-btn pri" onclick="ioCycle.save()">저장</button></div>`;
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
  document.querySelectorAll('#cyMdIn input[data-add]').forEach(el=>{if(el.checked){add[el.dataset.add]=1;delete del[el.dataset.add]}});
  const patch={crew,add:Object.keys(add).length?add:null,del:Object.keys(del).length?del:null};
  if(admin()){const scrap={};document.querySelectorAll('#cyMdIn input[data-scrap]').forEach(el=>{const v=nn(el.value);if(v>0)scrap[el.dataset.scrap]=v});patch.scrap=Object.keys(scrap).length?scrap:null}
  if(cy.confirmed&&!confirm('확정된 순환이에요. 수정하면 확정이 풀리고 다시 계산돼요. 계속할까요?'))return;
  patch.confirm=null;
  Promise.all([save(cy,patch),saveVeh(plate,vpatch)]).then(()=>{X.toast('저장했어요');close();rerender()}).catch(e=>X.toast('저장 실패: '+String(e&&e.message||e),true));
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
      <div class="io-sh-rc"><span>출고 <b>${c.out}</b> − 사용 <b>${c.used}</b>${c.asFree?' (AS '+c.asFree+')':''} − 반납 <b>${c.open?'–':c.inn}</b>${c.open?' → 차 잔량 <b>'+c.remain+'</b>':' → '+(c.decided?'로스 <b>'+sgn(c.diff)+'</b>':'대조 대기')}</span><span class="io-veh-diff ${chip[0]==='bad'?'plus':chip[0]==='ok'?'ok':chip[0]==='wait'?'warn':'dim'}">${chip[1]}</span></div>
      ${c.byProd.length?`<div class="io-rc-prod">${c.byProd.map(b=>esc(b.k)+' '+(c.open?'잔 '+(b.out-b.used):sgn(b.diff))).join(' · ')}</div>`:''}
      ${!c.open&&c.crew.length?`<div class="io-rc-prod">${c.crew.map(n=>esc(n)+' '+(c.decided?'로스 '+c.diff:'—')).join(' · ')} <span style="opacity:.7">(공동작업 기준)</span></div>`:''}</div>`;
  })});
  return h?`<div class="io-sh-nx" style="margin-top:0;margin-bottom:10px"><div class="io-sh-nxh">📦 순환 정산 · ${esc(U.fmtD(date))}</div>${h}</div>`:'';
}
function shareText(date,onlyPlate){
  const plates=Object.keys(vehicles()).filter(p=>!onlyPlate||NP(p)===NP(onlyPlate));const out=[];
  plates.forEach(p=>{const {list}=latestOf(p);list.filter(c=>(c.open&&c.fromW<=date)||(!c.open&&c.toW===date)).forEach(c=>{
    const tn=teamNo(c.crew,p);
    out.push((tn?RN+' '+tn+'팀 · ':'')+p+' · 순환 정산 ('+cyLabel(c)+')\n담당: '+c.crew.join(' / ')+'\n출고 '+c.out+'장\n사용 '+c.used+'장 — 시공 '+c.sold+'장'+(c.asFree?' / AS 무상 '+c.asFree+'장':'')+(c.scrap?' / 자투리 −'+c.scrap:'')+'\n반납 '+(c.open?'(전) · 차 잔량 '+c.remain+'장':c.inn+'장')+(c.open?'':'\n로스 '+(c.decided?sgn(c.diff)+'장':'대조 대기'))+(c.decided?'\n'+c.crew.map(n=>n+': 공동작업 로스 '+c.diff).join('\n')+'\n회사 실제 재고 로스: '+c.diff+'장':'')+'\n상태: '+stChip(c)[1]);
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
.cyr-ft{position:fixed;left:0;right:0;bottom:0;padding:10px 16px;padding-bottom:max(14px,env(safe-area-inset-bottom));display:flex;justify-content:center;gap:10px;pointer-events:none;z-index:6}
.cyr-ft button{pointer-events:auto;padding:11px 26px;border-radius:22px;border:1px solid rgba(255,255,255,.12);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer;background:rgba(40,42,50,.92);color:var(--text);backdrop-filter:blur(8px)}
.cyr-ft button.lnk{background:transparent;border-color:transparent;color:var(--dim);font-size:12px;font-weight:700;padding:11px 8px}
`;
function ensureRep(){
  if(!$('cyRepCss')){const st=document.createElement('style');st.id='cyRepCss';st.textContent=REP_CSS;document.head.appendChild(st)}
  if(!$('cyRep')){const d=document.createElement('div');d.id='cyRep';d.innerHTML='<div class="cyr-in" id="cyRepIn"></div><div class="cyr-ft"><button type="button" onclick="ioCycle.reportClose()">✕ 닫기</button><button type="button" class="lnk" onclick="ioCycle.reportCopy()">텍스트로 복사</button></div>';document.body.appendChild(d)}
}
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
  return `<div class="cyr-row"><div class="b"><div><b>${esc(U.hm(r.at))}</b> ${r.type==='in'?'반납':'출고'} <b>${q}장</b>${r.zero?' <span class="l">다 써서 없음</span>':''}${r.late?' <span class="cyr-chip warn" style="padding:1px 6px">지연 입력</span>':''}${r.wdate&&r.wdate!==r.date?` <span class="l">${esc(U.fmtMD(r.wdate))} 것</span>`:''}</div>${recLines(r)}${r.note&&!r.zero?`<div class="l">${esc(String(r.note).slice(0,60))}</div>`:''}</div>${recThumb(r)}</div>`;
}
function jobLabel(r){return r.st==='miss'?'미입력':r.st==='asmiss'?'AS보고 없음':r.st==='load'?'확인 중':r.st==='future'?'예정':r.st==='zero'?'0장':r.asFree?'AS 무상 '+r.asFree:(r.sold||0)+'장'}
function reportHTML(cy){
  const tn=teamNo(cy.crew,cy.plate);const chip=stChip(cy);
  const chipCls=chip[0]==='bad'?'bad':chip[0]==='ok'?'ok':chip[0]==='wait'?'warn':chip[0]==='blue'?'blue':'';
  let h=`<div class="cyr-hd"><div><div class="cyr-t">📦 출고·반납 보고</div><div class="cyr-s">${esc(RN)} ${tn?tn+'팀 · ':''}${esc(cy.crew.join('·'))} · ${esc(cy.plate)}<br>${esc(U.fmtD(cy.fromW))}${!cy.open&&cy.toW!==cy.fromW?' ~ '+esc(U.fmtD(cy.toW)):''}${cy.open?' · 반납 전':' · 반납 '+esc(String(cy.endAt||'').slice(5,16))}</div></div><span class="cyr-chip ${chipCls}">${chip[1]}</span></div>`;
  // 출고
  h+=`<div class="cyr-sec"><div class="cyr-sh"><span>출고 ${cy.out}장</span><small>${cy.outs.length}회${cy.outs.length?' · 마지막 '+esc(String(cy.outs[cy.outs.length-1].at||'').slice(5,16)):''}</small></div>${cy.outs.map(recRow).join('')||'<div class="cyr-j"><span>출고 기록 없음</span></div>'}</div>`;
  // 사용
  const useSub=[`시공 ${cy.sold}`].concat(cy.asFree?['AS 무상 '+cy.asFree]:[]).concat(cy.scrap?['자투리 −'+cy.scrap]:[]).join(' · ');
  h+=`<div class="cyr-sec"><div class="cyr-sh"><span>사용 ${cy.used}장</span><small>${esc(useSub)}</small></div>${cy.jobs.map(r=>`<div class="cyr-j"><span>${r.isAs?'<span style="color:var(--red)">AS</span> ':esc(r.time||'')+' '}${esc(r.addr)}${r.prod?' <span style="opacity:.75">· '+esc(r.prod)+'</span>':''}</span><b class="${r.st==='miss'||r.st==='asmiss'?'miss':r.asFree?'free':''}">${jobLabel(r)}</b></div>`).join('')||'<div class="cyr-j"><span>연결된 시공 없음</span></div>'}</div>`;
  // 반납
  h+=`<div class="cyr-sec"><div class="cyr-sh"><span>반납 ${cy.open?'전':cy.inn+'장'}</span><small>${cy.open?'차 잔량 '+cy.remain+'장':cy.zero?'다 써서 없음':cy.ins.length+'회'}</small></div>${cy.open?`<div class="cyr-j"><span>아직 반납 전 — 남은 매트를 사무실에 내리면 반납을 찍어주세요</span></div>`:cy.ins.map(recRow).join('')}</div>`;
  // 로스
  const totCls=cy.decided?(cy.diff>0?'bad':cy.diff===0?'ok':'warn'):'warn';
  const totTxt=cy.open?'반납 후 확정':cy.decided?(cy.diff===0?'일치 · 로스 0':cy.diff>0?'로스 +'+cy.diff+'장':'초과 '+cy.diff+'장 · 확인 필요'):'대조 대기';
  const waitWhy=[].concat(cy.miss.length?['시공보고 미입력 '+cy.miss.length]:[]).concat(cy.asMiss.length?['AS보고 없음 '+cy.asMiss.length]:[]).join(' · ');
  h+=`<div class="cyr-sec"><div class="cyr-sh"><span>로스</span><small>출고 − 사용 − 반납 · 제품별</small></div>
    <div class="cyr-grid">${cy.byProd.map(b=>`<div><span>${esc(b.k)}</span><b class="${cy.open||!cy.decided?'':b.diff>0?'bad':b.diff===0?'ok':''}">${cy.open?'잔 '+(b.out-b.used):cy.decided?sgn(b.diff):'—'}</b></div>`).join('')}</div>
    <div class="cyr-tot"><span>${cy.open?'차 잔량':'합계'}</span><span class="${cy.open?'':totCls}">${cy.open?cy.remain+'장':totTxt}${waitWhy&&!cy.open?' <small style="font-weight:600;color:var(--sub)">('+esc(waitWhy)+')</small>':''}</span></div>
    ${!cy.open&&cy.crew.length?`<div class="cyr-people">${cy.crew.map(n=>`<span>${esc(n)} <b class="${cy.decided&&cy.diff>0?'bad':''}">${cy.decided?(cy.diff>0?'로스 '+cy.diff:cy.diff<0?'초과 '+(-cy.diff):'0'):'—'}</b></span>`).join('')}<span>공동작업 기준</span></div>`:''}
    ${cy.ov&&cy.ov.confirm?`<div class="cyr-note">확정 ${esc(cy.ov.confirm.by||'')} ${esc(String(cy.ov.confirm.at||'').slice(5,16))}</div>`:''}</div>`;
  h+=`<div class="cyr-note">${esc(U.kstDT(new Date()).slice(0,16))} 기준 · 시공보고가 들어오면 자동 갱신</div>`;
  return h;
}
function reportText(cy){
  const tn=teamNo(cy.crew,cy.plate);const L=[];
  L.push(`[${RN}${tn?' '+tn+'팀':''} · ${cy.plate}] 출고·반납 보고 ${cy.open?U.fmtMD(cy.fromW):cyLabel(cy)}`);
  L.push('담당: '+cy.crew.join(' / '));
  L.push('출고 '+cy.out+'장');cy.outs.forEach(r=>{L.push('  '+U.hm(r.at)+' '+recQty(r)+'장: '+(r.items||[]).filter(it=>nn(it.total)||nn(it.tQty)).map(it=>it.product+' '+(nn(it.total)+nn(it.tQty))).join(', '))});
  L.push('사용 '+cy.used+'장 (시공 '+cy.sold+(cy.asFree?' / AS 무상 '+cy.asFree:'')+(cy.scrap?' / 자투리 −'+cy.scrap:'')+')');cy.jobs.forEach(r=>{L.push('  '+(r.isAs?'AS ':'')+r.addr+' — '+jobLabel(r))});
  if(cy.open)L.push('반납 전 · 차 잔량 '+cy.remain+'장');else{L.push('반납 '+cy.inn+'장'+(cy.zero?' (다 써서 없음)':''));cy.ins.forEach(r=>{if(recQty(r))L.push('  '+U.hm(r.at)+' '+recQty(r)+'장: '+(r.items||[]).filter(it=>nn(it.total)||nn(it.tQty)).map(it=>it.product+' '+(nn(it.total)+nn(it.tQty))).join(', '))})}
  L.push('로스: '+(cy.open?'반납 후 확정':cy.decided?(cy.diff===0?'일치 0':sgn(cy.diff)+'장'):'대조 대기')+((cy.open||cy.decided)&&cy.byProd.length?' ('+cy.byProd.map(b=>b.k+' '+(cy.open?'잔 '+(b.out-b.used):sgn(b.diff))).join(', ')+')':''));
  if(!cy.open&&cy.decided)L.push(cy.crew.map(n=>n+': 공동작업 로스 '+cy.diff).join(' / ')+' · 회사 로스 '+cy.diff+'장');
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
window.ioCycle={ver:CY_VER,cardsHTML,cyclesOf,latestOf,openBy,vehCrew,vehOv,crewFor,schedJobs,prodLabel,report,reportClose,reportCopy,open:v=>{const {cur:c}=latestOf(v.plate);if(c)openBy(v.plate,c.startTs);else X.toast('아직 출고 기록이 없어요')},close,save:saveEdit,confirm:confirmCy,zero,hist,shareHTML,shareText,_t:{compute,parseQty,reportHTML,reportText}};
})();
