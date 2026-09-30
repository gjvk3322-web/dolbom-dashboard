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
   ■ 자투리 입력·확정은 당번 모드. 담당 변경·시공 연결 수정은 누구나 */
(function(){
'use strict';
const X=window.__io;
if(!X||!X.util||!X.records){console.warn('[iocycle] iolog.js v27+ 필요');return}
const U=X.util,PRODUCTS=X.PRODUCTS,PART=X.PART,RK=X.RK,RN=X.RN;
const $=id=>document.getElementById(id),esc=U.esc;
const NODE=(X.beta?'io_cycle_beta/':'io_cycle/')+RK;
const CY_VER='2026.09.30e';
const CY_START='2026-09-30'; // 순환 시작일 — 이 날 이전 기록은 '반납→출고' 규칙 전이라 순환에서 제외 (옛 테스트 기록이 카드를 오염시키지 않게)
const NP=p=>U.normPlate(p)||'_';
const nn=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
let OV={};          // 오버라이드 {plateKey:{startTs:{...}}}
let AS={};          // asReports 캐시 {jobId: rec|null}
let asWait={};      // 불러오는 중
let SEL=null;       // 모달이 잡은 순환 {plate,startTs}
let HIST_OPEN={};   // 지난 순환 펼침 {plateKey:true}

/* ---------- 데이터 ---------- */
function admin(){try{return X.admin()}catch(e){return false}}
function vehicles(){try{return X.vehicles()}catch(e){return {}}}
function emps(){try{return X.employees()}catch(e){return []}}
function teamsArr(){try{return Array.isArray(teams)?teams:[]}catch(e){return []}}
function partnerOf(name){const t=teamsArr().find(t=>Array.isArray(t)&&t.indexOf(name)>=0);if(!t)return '';return t.filter(m=>m&&m!==name)[0]||''}
function teamNo(names){const T=teamsArr();for(let i=0;i<T.length;i++){if(Array.isArray(T[i])&&names.some(n=>n&&T[i].indexOf(n)>=0))return i+1}return 0}
function records(){try{return X.records().all||{}}catch(e){return {}}}
function jobs(){try{return X.jobs()}catch(e){return []}}
function parseQty(q){const s=String(q||'');if(/자투리/.test(s))return 0;const m=s.match(/\d+/);return m?+m[0]:0}
function recQty(r){return (r.items||[]).reduce((a,it)=>a+nn(it.total)+nn(it.tQty),0)}
function recByProd(r,into){(r.items||[]).forEach(it=>{const k=it.product||'?';into[k]=(into[k]||0)+nn(it.total)+nn(it.tQty)})}
function crewOf(r){if(Array.isArray(r.crew)&&r.crew.length)return r.crew.filter(Boolean).slice(0,2);const w=r.worker||'';return w?[w,partnerOf(w)].filter(Boolean):[]}
function asOf(id){ // AS보고서 — 없으면 한 번 불러오고 도착하면 다시 그림
  if(id in AS)return AS[id];
  if(asWait[id])return undefined;asWait[id]=1;
  try{db.ref('asReports/'+id).once('value').then(s=>{AS[id]=s.val()||null;delete asWait[id];rerender()}).catch(()=>{AS[id]=null;delete asWait[id]})}catch(e){AS[id]=null}
  return undefined;
}
function rerender(){try{if(window.ioAdmin&&ioAdmin.mount)ioAdmin.mount()}catch(e){}}
function ovOf(cy){return ((OV[NP(cy.plate)]||{})[String(cy.startTs)])||{}}
function save(cy,patch){
  const o=Object.assign({},patch,{by:(localStorage.getItem('io_admin_name')||X.myPlate&&vehicles()[X.myPlate()]||'').trim()||'',at:U.kstDT(new Date()),plate:cy.plate,ver:CY_VER});
  return db.ref(NODE+'/'+NP(cy.plate)+'/'+cy.startTs).update(o);
}

/* ---------- 순환 만들기 ---------- */
function cyclesOf(plate){
  const np=NP(plate);const today=U.kstDate(0);
  const recs=Object.values(records()).filter(r=>r&&r.status!=='void'&&NP(r.vehicle)===np&&r.ts&&String(r.date||'')>=CY_START).sort((a,b)=>a.ts-b.ts);
  const list=[];let cur=null;
  const mk=r=>({plate:r.vehicle||plate,startTs:r.ts,startAt:r.at,outs:[],ins:[],crew:crewOf(r)});
  recs.forEach(r=>{
    if(r.type==='in'){if(!cur)cur=Object.assign(mk(r),{orphan:true});cur.ins.push(r);return}
    if(cur&&cur.ins.length){list.push(cur);cur=null}
    if(!cur)cur=mk(r);cur.outs.push(r);
  });
  if(cur)list.push(cur);
  list.forEach(cy=>{
    const ov=ovOf(cy);
    cy.ov=ov;cy.open=!cy.ins.length;
    if(Array.isArray(ov.crew))cy.crew=ov.crew.filter(Boolean).slice(0,2);
    const wds=cy.outs.map(r=>r.wdate||r.date).filter(Boolean).sort();
    cy.fromW=wds[0]||U.kstDate(0,new Date(cy.startTs));
    const iws=cy.ins.map(r=>r.wdate||r.date).filter(Boolean).sort();
    cy.toW=cy.open?today:(iws[iws.length-1]||cy.fromW);
    if(cy.toW<cy.fromW)cy.toW=cy.fromW;
    cy.endAt=cy.open?'':cy.ins[cy.ins.length-1].at;
    cy.zero=!cy.open&&cy.ins.every(r=>r.zero||!recQty(r));
    compute(cy);
  });
  return list;
}
function jobMatches(j,cy){
  const jv=U.normPlate(j.vehicle);
  if(jv)return jv===NP(cy.plate);
  const s=String(j.sasu||'').trim();return !!s&&cy.crew.indexOf(s)>=0;
}
function jobOK(j){const t=String(j.time||'').trim();if(t==='실측')return false;if(/^(오전|오후)?\s*예약\s*[xX✕×](\s|$)/.test(String(j.addr||'').trim()))return false;return !!(j.addr&&j.addr.trim())}
function compute(cy){
  const ov=cy.ov||{};const add=ov.add||{},del=ov.del||{};
  const by={};const P=k=>by[k]||(by[k]={out:0,inn:0,sold:0,asFree:0,scrap:0});
  cy.outs.forEach(r=>{const t={};recByProd(r,t);Object.keys(t).forEach(k=>{P(k).out+=t[k]})});
  cy.ins.forEach(r=>{const t={};recByProd(r,t);Object.keys(t).forEach(k=>{P(k).inn+=t[k]})});
  Object.keys(ov.scrap||{}).forEach(k=>{P(k).scrap+=nn(ov.scrap[k])});
  const J=jobs();const linked=[],miss=[],asMiss=[];let asLoading=false;
  J.forEach(j=>{
    if(!j||!jobOK(j))return;
    const inWin=j.date>=cy.fromW&&j.date<=cy.toW;
    const auto=inWin&&jobMatches(j,cy);
    if(del[j.id])return;
    if(!auto&&!add[j.id])return;
    const isAs=/^AS$/i.test(String(j.time||'').trim());
    const pk=X.prodKeyOfCode(j.mat&&j.mat[0]&&j.mat[0].t)||'';
    const row={id:j.id,date:j.date,addr:String(j.addr||'').replace(/\(.*?\)/g,'').trim().slice(0,18),sasu:j.sasu||'',busasu:j.busasu||'',isAs,auto,sold:0,asFree:0,pk,st:''};
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
function latestOf(plate){const l=cyclesOf(plate);return {cur:l[l.length-1]||null,list:l}}
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
.cy-jobs .j.miss b{color:var(--dm-amber)}.cy-jobs .j.free b{color:var(--dm-blue)}
.cy-next .nh{font-weight:800;color:var(--dm-ink);font-size:12.5px;margin-bottom:2px}.cy-next .nh small{font-weight:600;color:var(--dm-muted)}
.cy-people{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cy-people span{display:inline-flex;gap:5px;align-items:center;padding:4px 9px;border-radius:7px;background:var(--dm-soft);font-size:12px;color:var(--dm-muted)}
.cy-people span b{color:var(--dm-ink)}
.cy-people span.bad b{color:var(--red)}
.cy-acts{display:grid;grid-template-columns:.7fr 1fr 1fr;gap:8px;margin-top:12px}
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
  return `<div class="cy-jobs">${cy.jobs.map(r=>`<div class="j ${r.st==='miss'||r.st==='asmiss'?'miss':r.asFree?'free':''}"><span>${esc(U.fmtMD(r.date))} ${r.isAs?'<span style="color:var(--red)">AS</span> ':''}${esc(r.addr)}${r.auto?'':' <span style="color:var(--dm-blue)">수동</span>'}</span><b>${lab(r)}</b></div>`).join('')}</div>`;
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
function upcomingHTML(v,cur,S){ // 갈 현장: 선택 날짜(S.from) 이후 이 차량의 첫 시공일 목록 — 순환에 이미 연결된 건 제외 (출고 전 실을 양 참고)
  const linked=new Set(cur?cur.jobs.map(r=>r.id):[]);const from=(S&&S.from)||U.kstDate(0);
  const crew=cur?cur.crew:[vehicles()[v.plate],partnerOf(vehicles()[v.plate]||'')].filter(Boolean);
  const fake={plate:v.plate,crew};
  const list=jobs().filter(j=>j&&jobOK(j)&&j.date>=from&&!linked.has(j.id)&&jobMatches(j,fake)).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:String(a.time).localeCompare(String(b.time)));
  if(!list.length)return '';
  const d=list[0].date;const day=list.filter(j=>j.date===d);
  const prod=j=>{const k=X.prodKeyOfCode(j.mat&&j.mat[0]&&j.mat[0].t);return k?k.replace('1M ','1M·'):''};
  return `<div class="cy-jobs cy-next"><div class="nh">${esc(U.fmtMD(d))} 갈 현장 ${day.length}곳${d===from?'':' <small>(다음 시공일)</small>'}</div>${day.map(j=>`<div class="j"><span>${esc(String(j.time||'').slice(0,2))} ${/^AS$/i.test(j.time)?'<span style="color:var(--red)">AS</span> ':''}${esc(String(j.addr||'').replace(/\(.*?\)/g,'').trim().slice(0,18))}</span><b>${esc(prod(j))}${j.py?' · '+esc(j.py)+'평':''}</b></div>`).join('')}</div>`;
}
function cardHTML(v){
  const S_=cardHTML.S||{};
  const {cur,list}=latestOf(v.plate);const who=cur?cur.crew:[vehicles()[v.plate],partnerOf(vehicles()[v.plate]||'')].filter(Boolean);
  const tn=teamNo(who);const chip=cur?stChip(cur):['','기록 없음'];
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
  h+=upcomingHTML(v,cur,S_);
  const open=!!(cur&&cur.open);
  h+=`<div class="cy-acts"><button type="button" class="ia-button quiet" ${cur?`onclick="ioCycle.openBy('${esc(v.plate)}',${cur.startTs})"`:'disabled'}>수정</button><button type="button" class="ia-button${open?'':' primary'}" onclick="ioOpen('out','${esc(v.plate)}')">출고</button><button type="button" class="ia-button${open?' primary':''}" onclick="ioOpen('in','${esc(v.plate)}')">반납</button>${open?`<button type="button" class="ia-button zero" onclick="ioCycle.zero('${esc(v.plate)}')">반납 0장 (다 써서 없음)</button>`:''}</div>`;
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
    const tn=teamNo(cys[cys.length-1].crew);
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
function cur(){if(!SEL)return null;return cyclesOf(SEL.plate).find(c=>c.startTs===SEL.startTs)||null}
function openBy(plate,startTs){SEL={plate,startTs:+startTs};render()}
function render(){
  const cy=cur();if(!cy){close();return}
  const E=emps();const opt=sel=>`<option value="">선택</option>${E.map(n=>`<option value="${esc(n)}"${sel===n?' selected':''}>${esc(n)}</option>`).join('')}${sel&&!E.includes(sel)?`<option value="${esc(sel)}" selected>${esc(sel)}</option>`:''}`;
  const chip=stChip(cy);const adm=admin();
  // 후보 시공: 기간 안 이 지역 시공 중 이 순환에 안 붙은 것(차량 다름) — 넣을 수 있게
  const linkedIds=new Set(cy.jobs.map(r=>r.id));
  const cand=jobs().filter(j=>j&&jobOK(j)&&j.date>=cy.fromW&&j.date<=cy.toW&&!linkedIds.has(j.id)&&!(cy.ov.del||{})[j.id]).slice(0,12);
  let h=`<h3>${esc(cy.plate)} · ${esc(cyLabel(cy))} <span class="ia-status ${chip[0]}">${chip[1]}</span></h3>
    <div class="ia-tiny">출고 ${cy.out} − 사용 ${cy.used}${cy.asFree?' (AS 무상 '+cy.asFree+')':''}${cy.scrap?' (자투리 −'+cy.scrap+')':''} − 반납 ${cy.open?'(전)':cy.inn} = ${cy.open?'잔량 '+cy.remain:'로스 '+sgn(cy.diff)}</div>
    <label>담당 2명 <span class="ia-tiny">(출고 때 자동 · 대타·팀 변경이면 여기서 고침)</span></label>
    <div class="row"><select id="cyC1">${opt(cy.crew[0]||'')}</select><select id="cyC2">${opt(cy.crew[1]||'')}</select></div>
    <label>연결된 시공 <span class="ia-tiny">(체크 해제 = 이 순환에서 뺌)</span></label>`;
  h+=cy.jobs.map(r=>`<div class="jl"><input type="checkbox" checked data-id="${esc(r.id)}"><span>${esc(U.fmtMD(r.date))} ${r.isAs?'AS ':''}${esc(r.addr)} <span class="ia-tiny">${esc([r.sasu,r.busasu].filter(Boolean).join('·'))}</span></span><b>${r.sold?r.sold+'장':r.asFree?'AS '+r.asFree:r.st==='miss'?'미입력':r.st==='asmiss'?'AS보고 없음':r.st==='future'?'예정':'0'}</b></div>`).join('')||'<div class="ia-tiny">없음</div>';
  if(cand.length)h+=`<label>같은 기간 다른 시공 <span class="ia-tiny">(체크 = 이 순환에 넣음)</span></label>`+cand.map(j=>`<div class="jl cand"><input type="checkbox" data-add="${esc(j.id)}"><span>${esc(U.fmtMD(j.date))} ${/^AS$/i.test(j.time)?'AS ':''}${esc(String(j.addr||'').slice(0,18))} <span class="ia-tiny">${esc([j.sasu,j.busasu].filter(Boolean).join('·'))}${j.vehicle?' · '+esc(j.vehicle):''}</span></span><b>${(+j.sold||0)?j.sold+'장':'—'}</b></div>`).join('');
  if(adm){h+=`<label>자투리 활용 (장) <span class="ia-tiny">(당번 · 별도로 가져간 기존 자투리로 판매한 장수 — 판매에서 뺌)</span></label>`;
    const ks=PRODUCTS.map(p=>p.k).filter(k=>cy.byProd.some(b=>b.k===k)||(cy.ov.scrap||{})[k]);
    h+=(ks.length?ks:PRODUCTS.slice(0,1).map(p=>p.k)).map(k=>`<div class="sc"><span>${esc(k)}</span><input type="number" min="0" inputmode="numeric" data-scrap="${esc(k)}" value="${nn((cy.ov.scrap||{})[k])||''}" placeholder="0"></div>`).join('')}
  h+=`<div class="cy-note">로스 = 출고 − (판매 − 자투리 + 무상 AS) − 반납. 시공보고가 나중에 들어오면 자동으로 다시 계산돼요.${cy.ov.at?'<br>마지막 수정 '+esc(cy.ov.by||'')+' '+esc(String(cy.ov.at||'').slice(5,16)):''}</div>`;
  h+=`<div class="bt"><button type="button" class="ia-btn" onclick="ioCycle.close()">닫기</button>${adm&&cy.decided?`<button type="button" class="ia-btn ${cy.confirmed?'':'ok'}" onclick="ioCycle.confirm(${cy.confirmed?0:1})">${cy.confirmed?'확정 해제':'로스 확정'}</button>`:''}<button type="button" class="ia-btn pri" onclick="ioCycle.save()">저장</button></div>`;
  md(h);
}
function saveEdit(){
  const cy=cur();if(!cy)return;
  const c1=($('cyC1')||{}).value||'',c2=($('cyC2')||{}).value||'';
  const crew=[c1,c2].filter(Boolean);if(!crew.length){X.toast('담당을 한 명 이상 골라주세요',true);return}
  const del=Object.assign({},cy.ov.del||{}),add=Object.assign({},cy.ov.add||{});
  document.querySelectorAll('#cyMdIn input[data-id]').forEach(el=>{const id=el.dataset.id;const row=cy.jobs.find(r=>r.id===id);if(!el.checked){if(row&&row.auto)del[id]=1;delete add[id]}else{delete del[id];if(row&&!row.auto)add[id]=1}});
  document.querySelectorAll('#cyMdIn input[data-add]').forEach(el=>{if(el.checked){add[el.dataset.add]=1;delete del[el.dataset.add]}});
  const patch={crew,add:Object.keys(add).length?add:null,del:Object.keys(del).length?del:null};
  if(admin()){const scrap={};document.querySelectorAll('#cyMdIn input[data-scrap]').forEach(el=>{const v=nn(el.value);if(v>0)scrap[el.dataset.scrap]=v});patch.scrap=Object.keys(scrap).length?scrap:null}
  if(cy.confirmed&&!confirm('확정된 순환이에요. 수정하면 확정이 풀리고 다시 계산돼요. 계속할까요?'))return;
  patch.confirm=null;
  save(cy,patch).then(()=>{X.toast('저장했어요');close();rerender()}).catch(e=>X.toast('저장 실패: '+String(e&&e.message||e),true));
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
  try{window.ioZeroReturn(plate)}catch(e){X.toast('반납 0장 기록을 못 만들었어요 (iolog.js 버전 확인)',true)}
}
function hist(k,open){HIST_OPEN[k]=!!open}

/* ---------- 공유 화면용 (그날 반납으로 닫힌 순환 + 열린 순환) ---------- */
function shareHTML(date,onlyPlate){
  const plates=Object.keys(vehicles()).filter(p=>!onlyPlate||NP(p)===NP(onlyPlate));
  let h='';
  plates.forEach(p=>{const {list}=latestOf(p);list.filter(c=>(c.open&&c.fromW<=date)||(!c.open&&c.toW===date)).forEach(c=>{
    const tn=teamNo(c.crew);const chip=stChip(c);
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
    const tn=teamNo(c.crew);
    out.push((tn?RN+' '+tn+'팀 · ':'')+p+' · 순환 정산 ('+cyLabel(c)+')\n담당: '+c.crew.join(' / ')+'\n출고 '+c.out+'장\n사용 '+c.used+'장 — 시공 '+c.sold+'장'+(c.asFree?' / AS 무상 '+c.asFree+'장':'')+(c.scrap?' / 자투리 −'+c.scrap:'')+'\n반납 '+(c.open?'(전) · 차 잔량 '+c.remain+'장':c.inn+'장')+(c.open?'':'\n로스 '+(c.decided?sgn(c.diff)+'장':'대조 대기'))+(c.decided?'\n'+c.crew.map(n=>n+': 공동작업 로스 '+c.diff).join('\n')+'\n회사 실제 재고 로스: '+c.diff+'장':'')+'\n상태: '+stChip(c)[1]);
  })});
  return out.join('\n\n');
}

/* ---------- 시작 ---------- */
try{db.ref(NODE).on('value',s=>{OV=s.val()||{};rerender()})}catch(e){console.warn('[iocycle] fb',e)}
window.ioCycle={ver:CY_VER,cardsHTML,cyclesOf,latestOf,openBy,open:v=>{const {cur:c}=latestOf(v.plate);if(c)openBy(v.plate,c.startTs);else X.toast('아직 출고 기록이 없어요')},close,save:saveEdit,confirm:confirmCy,zero,hist,shareHTML,shareText,_t:{compute,parseQty}};
})();
