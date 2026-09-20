/* ioadmin.js — 돌봄매트 📊 입출고 취합 (관리자용 · 부산·경기 공용)
   iolog.js의 [📊 취합] 버튼(당번 모드)에서만 불러옴. 직원 입력 화면과 io_logs 기록은 읽기만 하고 절대 고치지 않음.

   ■ 집계 기준 = 실제 이동일
     = 기록의 photoAt(짐을 찍은 사진의 촬영 시각 · 사진 스탬프에 찍히는 바로 그 시각, 한국 시간)의 날짜.
     · wdate(작업일 = 시공 예정일)나 date/at(작성일시)을 이동일 대신 쓰지 않음 → 저녁에 미리 실은 내일 작업분은 '실은 날'에 잡힘.
     · 지연 입력(late) / 사진 시각 없음 / 사진이 다른 날 찍힌 기록은 이동일을 알 수 없으므로 임의로 정하지 않고 집계에서 빼서 '확인 필요'로.
       담당자가 [이동일 지정]으로 날짜를 정하면 그때부터 그 날짜에 포함 (누가·언제 정했는지 io_admin/datefix 에 남김)
   ■ 수량: 기록에 저장된 cQty·sQty·kQty·tQty(제출 당시 환산된 장수)를 그대로 합산. 지금 기준으로 다시 계산하지 않음
     → 포장 기준이 나중에 바뀌어도 과거 수량은 안 바뀜. 박스·낱장·당시 박스당 장수(per/per10)는 개별 내역에 그대로 표시.
     박스×당시 기준+낱장 ≠ 장수 이거나 제품을 못 알아보는 기록은 집계에서 빼고 '확인 필요'로 (제외 건수 표시).
   ■ 제품 정의는 기존 것을 재사용: iolog.js PRODUCTS(박스당 장수·pid·색상) + stock.html PR의 두께(500=22T, 1000_22=22T, 1000_17=17T).
     10T — 500은 색상별. 1M 10T는 17T·22T 공용 품목이라 어느 제품 밑에 적었든 색상별 한 줄(1M · 색상 · 10T)로 합침 (입력 위치 때문에 둘로 갈라지지 않게).
   ■ 수정 이력: 이 시스템엔 '고쳐 쓰기'가 없고 취소(void) 후 재기록 방식 → 취소 기록은 집계 제외, 이력(사유·시각·누가)은 개별 내역에 계속 보임.
     임시저장은 직원 폰에만 있고 Firebase에 없으므로 애초에 집계 대상이 아님.
   ■ 저장 (새 노드만 씀 — io_logs / 입출고기록 시트는 안 건드림, Apps Script 수정 없음)
     io_admin/reflect/{bs|gg}/{날짜}/{키}   엑셀 반영 확인 이력 {type:'confirm'|'revoke', by, at, recs:{기록ID:버전}, recInfo, agg:[…], excluded, …}
     io_admin/nomove/{bs|gg}/{날짜}/{차량}   입출고 없음 확인 {by, at, plate}
     io_admin/datefix/{bs|gg}/{기록ID}       이동일 지정 {date, by, at, why}
   ■ 권한: 기존 당번 모드(isAdmin)로 화면과 쓰기 동작을 잠금. 화면 잠금일 뿐 데이터 접근 통제가 아님 — Firebase 규칙은 이 파일에서 확인·변경할 수 없음.
   v1 (2026-09-20) 첫 구현
   v2 (2026-09-20b) 화면을 카드형으로 전면 교체(상단바·부산/경기 토글·날짜 ‹ › 이동·알림 띠·차량 카드·패널 탭·'엑셀로 옮기기' 패널). 집계·복사·반영 확인 로직은 그대로.
     · 지역 토글 = 스케줄러 오른쪽 위 토글과 같은 방식(그 지역 스케줄러로 이동 + 보던 날짜의 취합 화면 자동으로 다시 엶) → 그 지역의 시공보고까지 같이 뜸. 지역 '전체' 보기는 뺌
     · 차량 카드에 사용량·로스: 사용 = 그날 시공보고 판매갯수 합(iolog.js jobsOf 재사용), 로스 = 출고 − 입고 − 사용 (입출고 목록의 대조와 같은 식·같은 판정). 작업일 기준 + 하루 보기에서만
     · 집계 기준 기본값 = 작업일(직원 화면·입출고 목록·샘플과 같은 기준, 사용량·로스가 이 기준이어야 계산됨). 실제 이동일(사진 시각) 기준은 상세 필터에 남김. 반영 확인 이력은 기준별로 따로 봄 */
(function(){
'use strict';
const X=window.__io;
if(!X||!X.util){console.warn('[ioadmin] iolog.js(window.__io)가 먼저 필요해요');return}
const U=X.util,PRODUCTS=X.PRODUCTS,PART=X.PART,TYPE=X.TYPE,LATE_MIN=X.LATE_MIN||30;
const IA_VER='2026.09.20b';
const HOME=X.RK==='gg'?'gg':'bs'; // 지금 연 스케줄러의 지역 — 취합 화면은 항상 이 지역(시공보고 J가 이 지역 것만 있으므로)
const $=id=>document.getElementById(id);
const esc=U.esc;
const REG={bs:{n:'부산',veh:'vehicles'},gg:{n:'경기',veh:'gg_vehicles'}};
const RKS=['bs','gg'];
const ROOT='io_admin';
const MAX_DAYS=31;
// 두께: stock.html PR 배지와 같은 값 (500매트 22T · 1000매트 22T · 1000매트 17T)
const PID_SPEC={'500':{size:'500',thick:'22T'},'1000_22':{size:'1M',thick:'22T'},'1000_17':{size:'1M',thick:'17T'}};
const COLOR_ORD=['모던','마블','코튼','베이지'];
const AGG_HEAD=['집계일','지역·창고','규격','제품명·색상','두께','부위','입고 장수','출고 장수','창고 증감'];
const AGG_HEAD_S=['날짜','지역','규격','색상','두께','부위','입고','출고','증감']; // 폰 화면용 짧은 머리글(복사되는 제목 행은 항상 AGG_HEAD)
const DET_HEAD=['기록 ID','실제 이동일시','시공 예정일','작성일시','지역·창고','차량','제출자','입고·출고','제품','부위','박스','낱장','박스당 장수','환산 장수','메모','사진','수정 여부'];

/* ---------- 상태 ---------- */
const S={open:false,mode:'day',from:'',to:'',region:HOME,vehicle:'',type:'all',merge:false,head:true,showOff:false,
  basis:'work',tab:'sum',kind:'agg',exportOpen:false,more:false,fullCols:false,copyErr:'',jsig:'',timer:0,
  drill:{},subs:[],data:{bs:{},gg:{}},extra:{bs:{},gg:{}},veh:{bs:{},gg:{}},reflect:{bs:{},gg:{}},nomove:{bs:{},gg:{}},datefix:{bs:{},gg:{}},
  loaded:{},err:'',copied:null,M:null,
  copySig:{},   // 마지막 '전체 집계 복사' 때의 날짜·지역별 기록 묶음 표식 — 복사 뒤에 기록이 바뀌었는데 반영 완료를 누르는 걸 막음
  sel:null};    // 모달이 잡고 있는 대상 {rk,id} | {rk,date} (화면이 새로 그려져도 엉뚱한 기록을 가리키지 않게)

/* ---------- 작은 도구 ---------- */
function nn(v){if(v==null||v==='')return 0;const x=Number(v);return Number.isFinite(x)?x:NaN}
function okInt(x){return Number.isInteger(x)&&x>=0}
function hash(str){let h=5381;for(let i=0;i<str.length;i++){h=((h<<5)+h+str.charCodeAt(i))>>>0}return h.toString(36)}
function shiftMin(dt,min){ // 'YYYY-MM-DD HH:mm:ss'(한국 벽시계) ± 분 → 같은 형식
  const m=/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(dt||''));if(!m)return '';
  const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)));d.setUTCMinutes(d.getUTCMinutes()+min);
  return d.toISOString().slice(0,19).replace('T',' ');
}
function fbKey(s){return String(s||'').replace(/[.#$\[\]\/]/g,'_')||'_'}
function dayList(a,b){const out=[];let d=a,i=0;while(d<=b&&i++<MAX_DAYS+2){out.push(d);d=U.addDays(d,1)}return out}
function scopeRks(){return [HOME]}
function inRange(d){return !!d&&d>=S.from&&d<=S.to}
function isDay(){return S.from===S.to}
function toast(m,err){try{X.toast(m,err)}catch(e){alert(m)}}
function me(){return (localStorage.getItem('io_admin_name')||'').trim()}
function askName(force){
  let n=me();
  if(!n||force){const v=prompt('담당자 이름을 적어주세요.\n(엑셀 반영 확인 · 입출고 없음 확인 · 이동일 지정 기록에 남아요)',n);if(v===null)return n&&!force?n:'';n=String(v).trim().slice(0,20);if(n)localStorage.setItem('io_admin_name',n)}
  return n;
}
function guard(){ // 쓰기 동작 공통 잠금 — 당번 모드 + 담당자 이름
  if(!X.admin()){toast('당번 모드(🔑)가 꺼져 있어요. 다시 켠 뒤에 해주세요',true);return ''}
  const n=askName(false);if(!n)toast('담당자 이름이 있어야 기록을 남길 수 있어요',true);return n;
}
function fbErr(e){const c=String(e&&(e.code||e.message)||e||'');return /permission/i.test(c)?'저장이 거부됐어요 — Firebase 규칙에서 io_admin 경로 쓰기가 막혀 있는지 확인이 필요해요':'저장 실패: '+c}

/* ---------- 제품 사양 · 집계 행 ---------- */
function specOf(product,pk){ // 입력 제품 + 부위 → 집계 행 {size,color,thick,part,ord,shared}
  const pi=PRODUCTS.findIndex(p=>p.k===product);if(pi<0)return null;
  const p=PRODUCTS[pi];const sp=PID_SPEC[p.pid];if(!sp)return null;
  const xi=PART.findIndex(t=>t.k===pk);if(xi<0)return null;
  if(pk==='t'){
    if(sp.size==='500')return {size:'500',color:p.col,thick:'10T',part:'10T',ord:pi*10+xi,shared:false};
    return {size:sp.size,color:p.col,thick:'10T',part:'10T',ord:(PRODUCTS.length+Math.max(0,COLOR_ORD.indexOf(p.col)))*10+xi,shared:true}; // 1M 10T = 17T·22T 공용 → 색상별 한 줄
  }
  return {size:sp.size,color:p.col,thick:sp.thick,part:PART[xi].n,ord:pi*10+xi,shared:false};
}
function curPer(product,pk){const p=PRODUCTS.find(x=>x.k===product);return p?(pk==='t'?p.per10:p.per):0}
function checkItem(it){ // → {hard:[집계 제외 사유], soft:[참고]}
  const hard=[],soft=[];
  if(!PRODUCTS.some(p=>p.k===it.product)){hard.push('제품을 알 수 없음('+(it.product||'빈칸')+')');}
  let sum=0;
  PART.forEach(pt=>{
    const box=nn(it[pt.k+'Box']),ea=nn(it[pt.k+'Ea']),qty=nn(it[pt.k+'Qty']);
    if(!okInt(box)||!okInt(ea)||!okInt(qty)){hard.push(pt.n+' 수량 값 이상');return}
    if(pt.k!=='t')sum+=qty;
    if(!box&&!ea&&!qty)return;
    let per=nn(pt.k==='t'?it.per10:it.per);const stored=okInt(per)&&per>0;
    if(!stored){per=curPer(it.product,pt.k);if(box>0)soft.push(pt.n+' 당시 박스당 장수 미기록(현재 기준으로 검산)')}
    if(box>0&&!per){hard.push(pt.n+' 환산 기준 없음');return}
    if(box*per+ea!==qty)hard.push(pt.n+' 환산 불일치('+box+'박스×'+per+'+'+ea+'≠'+qty+')');
  });
  if(it.total!=null&&it.total!==''&&nn(it.total)!==sum&&!hard.length)hard.push('합계 불일치');
  return {hard,soft};
}
function moveInfo(r,fix){ // 실제 이동일 — 사진 촬영 시각. 알 수 없으면 date:'' + 이유
  if(fix&&/^\d{4}-\d{2}-\d{2}$/.test(fix.date||''))return {date:fix.date,at:fix.date,src:'fix',by:fix.by||''};
  if(r.late)return {date:'',at:'',why:'지연 입력 — 실제 이동일을 알 수 없음'};
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(String(r.photoAt||'')))return {date:'',at:'',why:'사진 시각 없음 — 실제 이동일을 알 수 없음'};
  const gap=Number(r.photoGap)||0;
  if(gap>=LATE_MIN){const cap=shiftMin(r.photoAt,-gap);if(cap&&cap.slice(0,10)!==r.photoAt.slice(0,10))return {date:'',at:'',why:'사진이 다른 날('+cap.slice(0,10)+') 찍힌 것 — 실제 이동일 확인 필요'}}
  return {date:r.photoAt.slice(0,10),at:r.photoAt,src:'photo'};
}
function workInfo(r){ // 작업일 기준 — 기록의 작업일(옛 기록은 기록 날짜 · iolog.js wd()와 같은 규칙)
  const d=String(r.wdate||r.date||'');return /^\d{4}-\d{2}-\d{2}$/.test(d)?{date:d,at:String(r.photoAt||r.at||''),src:'work'}:{date:'',at:'',why:'작업일이 없는 기록'};
}
function itemsSig(r){return (r.items||[]).map(it=>[it.product,nn(it.cQty),nn(it.sQty),nn(it.kQty),nn(it.tQty)].join(':')).join(',')}
function normRec(r,rk){
  const fix=(S.datefix[rk]||{})[r.id]||null;const mv=S.basis==='work'?workInfo(r):moveInfo(r,fix);
  const why=[];const flags=[];
  if(!mv.date)why.push(mv.why);
  const items=Array.isArray(r.items)?r.items:[];
  if(!items.length)why.push('제품 내역 없음');
  items.forEach(it=>{const c=checkItem(it||{});c.hard.forEach(t=>why.push((it&&it.product?it.product+' ':'')+t));c.soft.forEach(t=>flags.push((it&&it.product?it.product+' ':'')+t))});
  const isVoid=r.status==='void';
  if(mv.src==='fix')flags.push('이동일을 담당자가 지정함('+(mv.by||'-')+')');
  const gap=Number(r.photoGap)||0;if((mv.src==='photo'||mv.src==='work')&&gap>=LATE_MIN)flags.push('사진이 제출 '+gap+'분 전에 찍힘');
  if(mv.src==='work'&&r.late)flags.push('지연 입력(지난 작업일을 나중에 기록)');
  if(r.status==='pending')flags.push('사진·시트 전송 대기 중(수량은 확정)');
  const plate=U.normPlate(r.vehicle);
  const reg=S.veh[rk]||{};if(plate&&S.loaded['v'+rk]&&!Object.keys(reg).some(p=>U.normPlate(p)===plate))flags.push('등록 안 된 차량번호');
  return {id:String(r.id),rk,region:REG[rk].n,raw:r,items,type:r.type==='in'?'in':'out',void:isVoid,plate,vehicle:String(r.vehicle||''),worker:String(r.worker||''),
    at:String(r.at||''),wdate:String(r.wdate||''),cdate:String(r.date||String(r.at||'').slice(0,10)),moveDate:mv.date,moveAt:mv.at,moveSrc:mv.src||'',
    excluded:why.join(' / '),flags,rerec:'',sig:hash([r.type==='in'?'in':'out',plate,mv.date,itemsSig(r)].join('|'))};
}
function markRepeats(list){ // 같은 지역·차량·구분·이동일에 같은 제품이 두 번 이상 → 참고 표시(집계는 그대로)
  const g={};list.forEach(x=>{const k=[x.rk,x.plate,x.type,x.moveDate].join('|');(g[k]=g[k]||[]).push(x)});
  Object.values(g).forEach(arr=>{if(arr.length<2)return;
    const byProd={};arr.forEach(x=>x.items.forEach(it=>{(byProd[it.product]=byProd[it.product]||new Set()).add(x.id)}));
    const ids=new Set();Object.values(byProd).forEach(s=>{if(s.size>1)s.forEach(id=>ids.add(id))});
    arr.forEach(x=>{if(!ids.has(x.id))return;const same=arr.some(y=>y.id!==x.id&&itemsSig(y.raw)===itemsSig(x.raw));
      x.flags.push(same?'같은 내용이 두 번 제출됨 — 중복 제출인지 확인':'같은 날 같은 제품을 두 번 제출 — 수정하려던 거면 앞 기록을 취소해야 함')})});
}
function markReRecorded(list,voids){ // 취소 후 재기록 추정 — 같은 지역·차량·구분에 같은 날(이동일 또는 작성일) 취소 기록이 있으면
  list.forEach(x=>{const v=voids.filter(y=>y.rk===x.rk&&y.plate===x.plate&&y.type===x.type&&((y.moveDate&&y.moveDate===x.moveDate)||y.cdate===x.cdate)&&String(y.at)<=String(x.at));
    if(v.length)x.rerec='취소 후 재기록(취소 '+v.length+'건: '+v.map(y=>y.id).join(', ')+')'});
}

/* ---------- 엑셀 반영 상태 ---------- */
function reflectAll(rk,date){const o=(S.reflect[rk]||{})[date];if(!o)return [];return Object.keys(o).sort().map(k=>({...o[k],_k:k}))}
function reflectEntries(rk,date){return reflectAll(rk,date).filter(e=>(e.basisKey||'move')===S.basis)} // 지금 보는 집계 기준의 이력만
function unitStatus(rk,date,full){
  const cur={};full.forEach(x=>{if(x.rk===rk&&x.moveDate===date)cur[fbKey(x.id)]=x.sig});
  const hist=reflectEntries(rk,date);const lastAny=hist[hist.length-1]||null;
  const last=lastAny&&lastAny.type==='confirm'?lastAny:null;
  const n=Object.keys(cur).length;
  const sig=hash(Object.keys(cur).sort().map(id=>id+':'+cur[id]).join(','));
  const other=reflectAll(rk,date).filter(e=>(e.basisKey||'move')!==S.basis&&e.type==='confirm').length; // 다른 기준으로 반영 확인된 적 있음 → 섞어 넣지 않게 경고
  if(!last)return {rk,date,state:n?'todo':'empty',cur,n,sig,other,last:null,hist,added:[],removed:[],changed:[]};
  const prev=last.recs||{};
  const added=Object.keys(cur).filter(id=>!(id in prev));
  const removed=Object.keys(prev).filter(id=>!(id in cur));
  const changed=Object.keys(cur).filter(id=>(id in prev)&&prev[id]!==cur[id]);
  return {rk,date,state:(added.length||removed.length||changed.length)?'stale':'done',cur,n,sig,other,last,hist,added,removed,changed};
}
function aggregate(list,merge){ // 집계 행 — 입고·출고 별도 열, 증감 = 입고 − 출고
  const map={};
  list.forEach(x=>{x.items.forEach(it=>{PART.forEach(pt=>{
    const q=nn(it[pt.k+'Qty']);if(!q)return;const sp=specOf(it.product,pt.k);if(!sp)return;
    const key=[x.moveDate,merge?'*':x.rk,sp.size,sp.color,sp.thick,sp.part].join('|');
    const row=map[key]||(map[key]={key,date:x.moveDate,rk:merge?'*':x.rk,region:merge?'부산+경기':x.region,size:sp.size,color:sp.color,thick:sp.thick,part:sp.part,ord:sp.ord,shared:sp.shared,in:0,out:0,src:[]});
    row[x.type]+=q;
    const per=nn(pt.k==='t'?it.per10:it.per);
    row.src.push({id:x.id,rk:x.rk,region:x.region,vehicle:x.vehicle,worker:x.worker,type:x.type,at:x.moveAt,q,box:nn(it[pt.k+'Box']),ea:nn(it[pt.k+'Ea']),per:okInt(per)&&per>0?per:0,product:it.product,part:pt.n});
  })})});
  const ro=k=>k==='*'?9:RKS.indexOf(k);
  return Object.values(map).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:ro(a.rk)-ro(b.rk)||a.ord-b.ord);
}
function detailRows(list){ // 개별 내역 — 기록 × 제품 × 부위(수량 있는 것만)
  const rows=[];
  list.slice().sort((a,b)=>(a.moveAt||a.at)<(b.moveAt||b.at)?-1:(a.moveAt||a.at)>(b.moveAt||b.at)?1:a.id<b.id?-1:1).forEach(x=>{
    let first=true;
    x.items.forEach(it=>{PART.forEach(pt=>{const qty=nn(it[pt.k+'Qty']),box=nn(it[pt.k+'Box']),ea=nn(it[pt.k+'Ea']);if(!qty&&!box&&!ea)return;
      const per=nn(pt.k==='t'?it.per10:it.per);
      rows.push({x,product:String(it.product||''),part:pt.n,box:box||0,ea:ea||0,per:okInt(per)&&per>0?per:'',qty:qty||0,first});first=false})});
    if(first)rows.push({x,product:'',part:'',box:0,ea:0,per:'',qty:0,first:true});
  });
  return rows;
}
function editText(x){
  if(x.void){const r=x.raw;return '취소됨'+(r.voidAt?' '+r.voidAt:'')+(r.voidBy?' · '+r.voidBy:'')+(r.voidReason?' · 사유: '+r.voidReason:'')}
  const t=[];if(x.rerec)t.push(x.rerec);if(x.moveSrc==='fix')t.push('이동일 담당자 지정');return t.join(' / ');
}

/* ---------- 모델 ---------- */
function reconOf(v,mine){ // 사용량·로스 — iolog.js dayRecon과 같은 식: 출고 − 입고 − 시공보고 판매갯수(그날 시공분). 값은 기존 jobsOf를 그대로 씀
  let jb;try{jb=X.jobsOf(v.plate,U.addDays(S.from,-1),S.from)}catch(e){return null}
  const hasIn=mine.some(x=>x.type==='in');const by={};const add=(k,f,n)=>{(by[k]=by[k]||{out:0,inn:0,sold:0})[f]+=n};
  mine.forEach(x=>x.items.forEach(it=>add(it.product||'?',x.type==='in'?'inn':'out',(nn(it.total)||0)+(nn(it.tQty)||0))));
  let unknown=false;jb.list.forEach(j=>{if(j.prod)add(j.prod,'sold',j.q);else unknown=true});
  const byProd=Object.keys(by).map(k=>({k,diff:by[k].out-by[k].inn-by[k].sold})).filter(z=>z.diff!==0);
  const diff=v.outQ-v.inQ-jb.sold;let st;
  if(jb.noSold)st='nosold';else if(!mine.length&&!jb.n&&!jb.miss)st='none';else if(jb.miss)st='miss';else if(!v.outQ&&(v.inQ||jb.sold))st='noout';else if(!hasIn)st='beforein';
  else if(diff===0)st=(!unknown&&byProd.length)?'prod':'ok';else st=diff>0?'loss':'carstock';
  return {sold:jb.sold,jobsN:jb.n,miss:jb.miss,diff,st,byProd,list:jb.list,decided:st==='ok'||st==='prod'||st==='loss'||st==='carstock'};
}
function build(){
  const rks=scopeRks();const all=[];
  rks.forEach(rk=>{const src=Object.assign({},S.extra[rk],S.data[rk]);
    Object.keys(src).forEach(id=>{const r=src[id];if(!r||typeof r!=='object')return;all.push(normRec(Object.assign({},r,{id:r.id||id}),rk))})});
  // 이동일이 있으면 이동일로, 없으면(확인 대상) 작성일로만 화면에 걸어 둠 — 집계에는 안 들어감
  const scoped=all.filter(x=>x.moveDate?inRange(x.moveDate):inRange(x.cdate));
  const voids=scoped.filter(x=>x.void);
  const live=scoped.filter(x=>!x.void);
  const excluded=live.filter(x=>x.excluded);
  const full=live.filter(x=>!x.excluded);             // 집계 포함 전체(지역·날짜만) — 반영 상태 판단은 항상 이것으로
  markRepeats(full);markReRecorded(full,voids);
  const vf=x=>(!S.vehicle||x.plate===S.vehicle)&&(S.type==='all'||x.type===S.type);
  const view=full.filter(vf);                         // 화면 집계·복사 대상(차량·구분 필터까지)
  const units=[];const unitMap={};
  rks.forEach(rk=>dayList(S.from,S.to).forEach(d=>{const u=unitStatus(rk,d,full);unitMap[rk+'|'+d]=u;if(u.state!=='empty'||u.hist.length)units.push(u)}));
  units.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:RKS.indexOf(a.rk)-RKS.indexOf(b.rk));
  const recState=x=>{const u=unitMap[x.rk+'|'+x.moveDate];if(!u||!u.last)return 'todo';const p=(u.last.recs||{})[fbKey(x.id)];return p==null?'todo':p===x.sig?'done':'changed'};
  // 차량별 현황
  const veh=[];
  rks.forEach(rk=>{const reg=S.veh[rk]||{};const seen={};const plates=[];
    Object.keys(reg).forEach(p=>{const k=U.normPlate(p);if(k&&!seen[k]){seen[k]=1;plates.push({plate:p,key:k,who:reg[p]||'',reg:true})}});
    scoped.filter(x=>x.rk===rk).forEach(x=>{if(x.plate&&!seen[x.plate]){seen[x.plate]=1;plates.push({plate:x.vehicle,key:x.plate,who:x.worker,reg:false})}});
    plates.forEach(v=>{
      const mine=full.filter(x=>x.rk===rk&&x.plate===v.key);const sum=t=>mine.filter(x=>x.type===t);
      const q=arr=>arr.reduce((a,x)=>a+x.items.reduce((b,it)=>b+PART.reduce((c,pt)=>c+(nn(it[pt.k+'Qty'])||0),0),0),0);
      const ex=excluded.filter(x=>x.rk===rk&&x.plate===v.key);const vd=voids.filter(x=>x.rk===rk&&x.plate===v.key);
      const last=scoped.filter(x=>x.rk===rk&&x.plate===v.key&&!x.void).map(x=>x.at).sort().pop()||'';
      const fl=mine.filter(x=>x.flags.length).length;
      const st={done:0,todo:0,changed:0,removed:0};mine.forEach(x=>st[recState(x)]++);
      units.filter(u=>u.rk===rk&&u.last).forEach(u=>u.removed.forEach(id=>{const info=String((u.last.recInfo||{})[id]||'');if(info.split('|')[0]===v.key)st.removed++}));
      const nm=isDay()?(((S.nomove[rk]||{})[S.from]||{})[fbKey(v.key)]||null):null;
      const row={rk,region:REG[rk].n,plate:v.plate,key:v.key,who:v.who,reg:v.reg,inN:sum('in').length,inQ:q(sum('in')),outN:sum('out').length,outQ:q(sum('out')),exN:ex.length,voidN:vd.length,flN:fl,last,st,nomove:nm};
      row.state=mine.length?'done':nm?'nomove':isDay()?'wait':'none';
      row.recon=(S.basis==='work'&&isDay())?reconOf(row,mine):null;
      veh.push(row);
    })});
  const flagged=excluded.concat(full.filter(x=>x.flags.length));
  return {all,scoped,voids,excluded,full,view,units,unitMap,veh,flagged,agg:aggregate(view,false),det:detailRows(view),detOff:detailRows(excluded.concat(voids).filter(vf))};
}

/* ---------- 구독 (Firebase) ---------- */
function unsubAll(){S.subs.forEach(s=>{try{s.ref.off('value',s.cb)}catch(e){}});S.subs=[]}
function sub(ref,cb){const onErr=e=>{S.err='데이터를 읽지 못했어요: '+String(e&&(e.code||e.message)||e);renderBody()};try{ref.on('value',cb,onErr);S.subs.push({ref,cb})}catch(e){onErr(e)}}
function resub(){
  unsubAll();S.loaded={};S.err='';S.drill={};S.copied=null;
  RKS.forEach(rk=>{S.data[rk]={};S.extra[rk]={};S.reflect[rk]={};S.nomove[rk]={}});
  // 작성일(date) 색인으로 읽음. 작업일 기준: 토요일 저녁에 실은 월요일 것(−2일)·다음 날 아침 입고(+1일)·지연 입력까지 넉넉히 / 이동일 기준: 자정 걸친 제출 대비 하루씩
  const qa=U.addDays(S.from,S.basis==='work'?-4:-1),qb=U.addDays(S.to,S.basis==='work'?7:1);
  scopeRks().forEach(rk=>{
    sub(db.ref('io_logs/'+rk).orderByChild('date').startAt(qa).endAt(qb),snap=>{const o={};snap.forEach(ch=>{o[ch.key]=ch.val()});S.data[rk]=o;S.loaded['d'+rk]=1;renderBody()});
    sub(db.ref(REG[rk].veh),snap=>{S.veh[rk]=snap.val()||{};S.loaded['v'+rk]=1;renderFilters();renderBody()});
    sub(db.ref(ROOT+'/reflect/'+rk).orderByKey().startAt(S.from).endAt(S.to),snap=>{S.reflect[rk]=snap.val()||{};renderBody()});
    sub(db.ref(ROOT+'/nomove/'+rk).orderByKey().startAt(S.from).endAt(S.to),snap=>{S.nomove[rk]=snap.val()||{};renderBody()});
    sub(db.ref(ROOT+'/datefix/'+rk),snap=>{S.datefix[rk]=snap.val()||{};fetchExtras(rk);renderBody()});
  });
}
function fetchExtras(rk){ // 이동일 지정으로 이 기간에 들어온 기록 중 작성일 창 밖에 있는 것
  Object.keys(S.datefix[rk]||{}).forEach(id=>{const f=S.datefix[rk][id];if(!f||!inRange(f.date)||S.data[rk][id]||S.extra[rk][id])return;
    try{db.ref('io_logs/'+rk+'/'+id).once('value').then(s=>{const v=s.val();if(v){S.extra[rk][id]=v;renderBody()}}).catch(()=>{})}catch(e){}});
}

/* ---------- 껍데기 · CSS (v2 — 카드형 화면) ---------- */
const IC={ // lucide 선 아이콘 (인라인)
  house:'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  truck:'<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  table:'<path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>',
  copy:'<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  left:'<path d="m15 18-6-6 6-6"/>',right:'<path d="m9 18 6-6-6-6"/>',x:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  cal:'<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  alert:'<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  ok:'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  checks:'<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  inbox:'<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  sliders:'<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>'
};
function ic(n){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IC[n]||'')+'</svg>'}
const CSS=`
.ia-ov,.ia-md{--dm-bg:#14171c;--dm-panel:#20242b;--dm-ink:#f1f4f7;--dm-muted:#a5afbd;--dm-line:#363d48;--dm-soft:#292f38;--dm-brand:#ff8b7e;--dm-brandbg:#462e2c;--dm-green:#70d6ad;--dm-greenbg:#203b32;--dm-blue:#8bbcff;--dm-bluebg:#26364f;--dm-amber:#f2c574;--dm-amberbg:#403522;--dm-redbg:#4a2a2a;--dm-solid:#d4efe3;--dm-on-solid:#172d24;
  --bg:var(--dm-bg);--card:var(--dm-panel);--card2:var(--dm-soft);--text:var(--dm-ink);--dim:var(--dm-muted);--sub:var(--dm-muted);--border:var(--dm-line);--blue:var(--dm-blue);--green:var(--dm-green);--cyan:var(--dm-blue);--orange:var(--dm-amber);--yellow:var(--dm-amber);--red:#ff8b7e}
.ia-ov{display:none;position:fixed;inset:0;background:var(--dm-bg);z-index:993;overflow:auto;-webkit-overflow-scrolling:touch;color:var(--dm-ink);font-family:var(--font);font-size:14px;line-height:1.5}
.ia-ov.show{display:block}
.ia-ov *,.ia-md *{box-sizing:border-box}
.ia-ov svg,.ia-md svg{width:18px;height:18px;flex-shrink:0}
.ia-ov button,.ia-md button{font-family:var(--font);color:inherit;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ia-ov button:disabled,.ia-md button:disabled{opacity:.42;cursor:not-allowed}
.ia-ov h2,.ia-ov h3,.ia-ov p{margin:0}
.ia-stick{position:sticky;top:0;z-index:4;background:var(--dm-panel);padding-top:env(safe-area-inset-top)}
.ia-wrap{max-width:1180px;margin:0 auto}
.ia-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 26px 6px}
.ia-brand{display:flex;align-items:center;gap:9px;white-space:nowrap}
.ia-brand strong{font-size:19px;font-weight:800;letter-spacing:-.8px}
.ia-mark{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:var(--dm-brandbg);color:var(--dm-brand)}
.ia-appname{font-size:13px;padding-left:12px;margin-left:4px;border-left:1px solid var(--dm-line);color:var(--dm-muted)}
.ia-who{font-size:12px;color:var(--dm-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.ia-who b{color:var(--dm-ink);font-weight:700}.ia-who u{cursor:pointer;color:var(--dm-blue);text-decoration:none;margin-left:5px}
.ia-navline{border-bottom:1px solid var(--dm-line)}
.ia-nav{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 26px}
.ia-navtabs{display:flex;gap:24px}
.ia-navtab{border:0;border-bottom:3px solid transparent;background:none;display:flex;align-items:center;gap:7px;min-height:50px;padding:4px 0;font-size:14px;font-weight:700;color:var(--dm-muted)}
.ia-navtab.on{border-bottom-color:var(--dm-brand);color:var(--dm-ink)}
.ia-regions{display:flex;gap:2px;background:var(--dm-soft);padding:3px;border-radius:9px}
.ia-regions button{border:0;background:none;border-radius:6px;padding:5px 14px;min-height:32px;color:var(--dm-muted);font-size:12.5px;font-weight:700}
.ia-regions button.on{background:var(--dm-bg);color:var(--dm-ink);box-shadow:0 1px 3px #0000002a}
.ia-page{padding:28px 26px 90px}
.ia-titlebar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:23px}
.ia-eyebrow{font-size:11px;letter-spacing:1.6px;font-weight:700;color:var(--dm-muted);margin-bottom:5px}
.ia-titlebar h2{font-size:26px;letter-spacing:-1px;font-weight:800}
.ia-subtitle{color:var(--dm-muted);margin-top:5px;font-size:13px}
.ia-button{display:inline-flex;gap:7px;align-items:center;justify-content:center;min-height:43px;border:1px solid var(--dm-line);background:var(--dm-panel);padding:10px 14px;border-radius:10px;font-size:14px;font-weight:700;white-space:nowrap}
.ia-button.primary{background:var(--dm-solid);color:var(--dm-on-solid);border-color:var(--dm-solid)}
.ia-button.quiet{background:transparent;border-color:transparent;color:var(--dm-muted)}
.ia-button.small,.ia-btn.sm{min-height:34px;padding:6px 10px;font-size:12px}
.ia-button.on{background:var(--dm-soft);color:var(--dm-ink)}
.ia-btn{display:inline-flex;gap:6px;align-items:center;justify-content:center;min-height:38px;border:1px solid var(--dm-line);background:var(--dm-panel);padding:8px 12px;border-radius:9px;font-size:13px;font-weight:700;white-space:nowrap}
.ia-btn.pri{background:var(--dm-bluebg);border-color:transparent;color:var(--dm-blue)}
.ia-btn.ok{background:var(--dm-solid);border-color:var(--dm-solid);color:var(--dm-on-solid)}
.ia-filterbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.ia-dategroup{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.ia-iconbtn{width:36px;height:40px;border:1px solid var(--dm-line);background:var(--dm-panel);border-radius:9px;display:grid;place-items:center;padding:0}
.ia-ov input[type=date],.ia-ov select,.ia-md input[type=date]{height:40px;border:1px solid var(--dm-line);border-radius:9px;background:var(--dm-panel);color:var(--dm-ink);padding:6px 10px;font-weight:600;font-size:14px;font-family:var(--font);color-scheme:dark;flex:none;width:auto;max-width:100%}
.ia-datebasis{font-size:12px;color:var(--dm-muted);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ia-more{display:flex;gap:10px 18px;flex-wrap:wrap;align-items:center;background:var(--dm-panel);border:1px solid var(--dm-line);border-radius:12px;padding:12px 14px;margin:-6px 0 18px;font-size:12px;color:var(--dm-muted)}
.ia-more .g{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ia-more label{font-weight:700}
.ia-seg{display:inline-flex;background:var(--dm-soft);border-radius:9px;padding:3px;gap:2px}
.ia-seg button{padding:5px 11px;min-height:30px;border-radius:6px;border:none;background:transparent;color:var(--dm-muted);font-size:12.5px;font-weight:700;white-space:nowrap}
.ia-seg button.on{background:var(--dm-bg);color:var(--dm-ink)}
.ia-status,.ia-tag{display:inline-flex;gap:5px;align-items:center;font-size:11px;font-weight:700;border-radius:6px;padding:3px 7px;background:var(--dm-soft);color:var(--dm-muted);white-space:nowrap;vertical-align:1px}
.ia-status.ok,.ia-tag.ok,.ia-tag.out{background:var(--dm-greenbg);color:var(--dm-green)}
.ia-status.wait,.ia-tag.nt,.ia-tag.st{background:var(--dm-amberbg);color:var(--dm-amber)}
.ia-status.blue,.ia-tag.in{background:var(--dm-bluebg);color:var(--dm-blue)}
.ia-status.bad,.ia-tag.ex{background:var(--dm-redbg);color:var(--red)}
.ia-tag.dim{background:var(--dm-soft);color:var(--dm-muted)}
.ia-notice{background:var(--dm-amberbg);color:var(--dm-amber);border-radius:12px;padding:13px 15px;display:flex;gap:10px;align-items:center;margin-bottom:12px;font-size:13px}
.ia-notice .c{flex:1;min-width:0}.ia-notice strong{font-weight:800;color:var(--dm-ink)}
.ia-notice.ok{background:var(--dm-greenbg);color:var(--dm-green)}.ia-notice.ok strong{color:var(--dm-green)}
.ia-notice.bad{background:var(--dm-redbg);color:var(--red)}
.ia-notice .ia-button{color:var(--dm-ink)}
.ia-teams{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:4px 0 23px}
.ia-team{background:var(--dm-panel);border:1px solid var(--dm-line);border-radius:12px;padding:13px;text-align:left;min-width:0;display:block;width:100%}
.ia-team.sel{border-color:var(--dm-green);box-shadow:inset 0 0 0 1px var(--dm-green)}
.ia-teamtop{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px}
.ia-teamname{font-size:15px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ia-teamplate{font-size:12px;color:var(--dm-muted)}
.ia-teamcounts{font-size:12.5px;color:var(--dm-muted);display:flex;gap:4px 10px;flex-wrap:wrap;margin-top:5px}
.ia-teamcounts b{color:var(--dm-ink);font-weight:700;font-variant-numeric:tabular-nums}
.ia-teamuse{border-top:1px dashed var(--dm-line);margin-top:9px;padding-top:8px}
.ia-loss{color:var(--red)!important}.ia-fit{color:var(--dm-green)!important}.ia-hold{color:var(--dm-amber)}
.ia-panel{background:var(--dm-panel);border:1px solid var(--dm-line);border-radius:14px;overflow:hidden}
.ia-panelhead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:19px 20px 15px;flex-wrap:wrap}
.ia-panelhead h3{font-size:16px;letter-spacing:-.3px;font-weight:800}
.ia-totals{display:flex;gap:6px 16px;color:var(--dm-muted);font-size:12px;flex-wrap:wrap}
.ia-totals b{font-size:16px;font-weight:800;margin-left:5px;color:var(--dm-ink);font-variant-numeric:tabular-nums}
.ia-tabs{display:flex;align-items:center;gap:5px;border-bottom:1px solid var(--dm-line);padding:0 20px 12px;flex-wrap:wrap}
.ia-tabs>button.t{border:0;border-radius:7px;min-height:33px;padding:6px 11px;font-size:12.5px;background:transparent;color:var(--dm-muted);font-weight:700}
.ia-tabs>button.t.on{background:var(--dm-soft);color:var(--dm-ink)}
.ia-tabs .sp{flex:1}
.ia-tabs label{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--dm-muted);font-weight:600;cursor:pointer;white-space:nowrap}
.ia-ov input[type=checkbox]{width:15px;height:15px;flex:none;accent-color:var(--dm-green)}
.ia-tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
.ia-tb{border-collapse:collapse;width:100%;text-align:left;font-size:13px;white-space:nowrap}
.ia-tb th{color:var(--dm-muted);background:var(--dm-soft);font-size:11px;font-weight:700;padding:11px 15px;text-align:left}
.ia-tb td{padding:12px 15px;border-bottom:1px solid var(--dm-line);vertical-align:top}
.ia-tb tr:last-child td{border-bottom:0}
.ia-tb th:first-child,.ia-tb td:first-child{padding-left:20px}
.ia-tb .r{text-align:right;font-variant-numeric:tabular-nums}
.ia-tb .dim{color:var(--dm-muted)}
.ia-tb .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;color:var(--dm-muted)}
.ia-tb .pn{font-weight:700}.ia-tb .pn small{display:block;font-weight:500;color:var(--dm-muted);font-size:11px}
.ia-tb tr.grp td{border-top:1px solid var(--dm-line)}
.ia-tb tr.off td{opacity:.55}
.ia-tb.det th,.ia-tb.det td{padding:9px 7px}.ia-tb.det th:first-child,.ia-tb.det td:first-child{padding-left:14px}
.ia-tb .w{white-space:normal;min-width:190px;line-height:1.6}
.ia-num{background:none;border:none;font-size:14px;font-weight:800;padding:2px 5px;border-radius:6px;font-variant-numeric:tabular-nums}
.ia-num.in{color:var(--dm-blue)}.ia-num.out{color:var(--dm-green)}
.ia-num.z{color:var(--dm-muted);font-weight:500;cursor:default;opacity:.6}
.ia-num.on{background:var(--dm-soft)}
.ia-dl{background:var(--dm-bg);border-radius:10px;padding:9px 12px;font-size:12.5px;line-height:1.7;white-space:normal}
.ia-dl div{display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;padding:2px 0}
.ia-dl .q{font-weight:800;min-width:48px;text-align:right}
.ia-tablefoot{padding:13px 20px;border-top:1px solid var(--dm-line);display:flex;align-items:center;gap:10px;justify-content:space-between;font-size:12px;color:var(--dm-muted);flex-wrap:wrap}
.ia-bottom{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px}
.ia-bottom .u{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ia-unit{display:inline-flex;align-items:center;gap:7px;background:var(--dm-panel);border:1px solid var(--dm-line);border-radius:9px;padding:6px 10px;font-size:12px;font-weight:600}
.ia-unit.stale{border-color:var(--dm-amber)}
.ia-unit small{color:var(--dm-muted);font-size:11px;font-weight:500}
.ia-tiny{font-size:12px;color:var(--dm-muted)}
.ia-empty{text-align:center;padding:40px 15px;color:var(--dm-muted)}
.ia-empty svg{width:28px;height:28px}
.ia-empty strong{display:block;color:var(--dm-ink);font-size:15px;margin:12px 0 5px}
.ia-wi{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid var(--dm-line);font-size:12.5px;line-height:1.6}
.ia-wi:last-child{border-bottom:0}
.ia-wi .t{flex:1;min-width:220px}.ia-wi .t b{font-weight:800}
.ia-wi .a{display:flex;gap:5px;flex-wrap:wrap}
.ia-export{padding:20px;background:var(--dm-panel);border:1px solid var(--dm-green);border-radius:14px;margin-top:16px}
.ia-export h3{font-size:17px;font-weight:800}
.ia-exhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.ia-exopt{display:flex;justify-content:space-between;align-items:center;gap:10px 12px;flex-wrap:wrap;margin:10px 0 13px;font-size:12px;color:var(--dm-muted)}
.ia-exopt .o{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ia-exopt label{display:flex;align-items:center;gap:6px;min-height:32px;cursor:pointer}
.ia-export textarea,.ia-md-in textarea{width:100%;min-height:132px;resize:vertical;border:1px solid var(--dm-line);border-radius:8px;padding:12px;background:var(--dm-bg);color:var(--dm-ink);font-size:12px;line-height:1.8;white-space:pre;tab-size:10;font-family:ui-monospace,Menlo,Consolas,monospace;overflow:auto}
.ia-exact{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:13px}
.ia-exnote{font-size:12px;color:var(--dm-muted);margin:10px 0 0;line-height:1.6}
.ia-statusline{min-height:20px;font-size:12.5px;color:var(--dm-green);margin-top:10px;line-height:1.6}
.ia-statusline.warn{color:var(--dm-amber)}.ia-statusline.bad{color:var(--red)}
.ia-err{background:var(--dm-redbg);color:var(--red);border-radius:10px;padding:10px 12px;font-size:13px;font-weight:700;margin-bottom:12px}
.ia-note{font-size:11.5px;color:var(--dm-muted);line-height:1.6;margin-top:18px}
.ia-md{display:none;position:fixed;inset:0;background:rgba(0,0,0,.66);z-index:994;align-items:center;justify-content:center;padding:14px;font-family:var(--font)}
.ia-md.show{display:flex}
.ia-md-in{background:var(--dm-panel);border:1px solid var(--dm-line);border-radius:16px;width:100%;max-width:640px;max-height:88vh;overflow:auto;padding:18px 18px 15px;font-size:13px;line-height:1.6;color:var(--dm-ink)}
.ia-md-in h3{font-size:16px;font-weight:800;margin:0 0 8px}
.ia-md-in .bt{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
.ia-md-in .kv{display:grid;grid-template-columns:96px 1fr;gap:4px 10px;font-size:12.5px}
.ia-md-in .kv span:nth-child(odd){color:var(--dm-muted);font-weight:700}
.ia-md-in .kv span{word-break:break-all}
.ia-md-in .box{background:var(--dm-bg);border-radius:10px;padding:9px 11px;margin-top:8px;font-size:12.5px}
@media(max-width:900px){.ia-teams{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){
  .ia-topbar{padding:12px 13px 4px}.ia-brand strong{font-size:17px}.ia-nav{padding:0 12px;gap:6px}.ia-navtabs{gap:15px}.ia-navtab{font-size:12.5px;gap:4px;min-height:46px}.ia-navtab svg{width:15px;height:15px}
  .ia-regions button{padding:5px 10px}.ia-page{padding:20px 12px 90px}
  .ia-titlebar{flex-wrap:wrap;gap:12px;margin-bottom:18px;align-items:flex-start}.ia-titlebar h2{font-size:22px}.ia-titlebar>.ia-button{width:100%}
  .ia-teams{gap:7px}.ia-team{padding:11px}.ia-teamtop{flex-wrap:wrap;gap:5px;margin-bottom:5px}
  .ia-notice{align-items:flex-start;padding:12px;font-size:12px}
  .ia-panelhead{padding:16px 13px;align-items:flex-start;flex-direction:column;gap:10px}.ia-tabs{padding:0 13px 10px}
  .ia-tb th,.ia-tb td{padding:11px 9px;font-size:12.5px}.ia-tb th:first-child,.ia-tb td:first-child{padding-left:13px}
  .ia-tb.det{min-width:1180px}.ia-tablefoot{padding:12px 13px}.ia-wi{padding:12px 13px}.ia-export{padding:15px 13px}
}
`;
function ensureShell(){
  if($('iaOv'))return;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  const ov=document.createElement('div');ov.className='ia-ov';ov.id='iaOv';
  ov.innerHTML=`<div class="ia-stick"><div class="ia-wrap"><header class="ia-topbar"><div class="ia-brand"><span class="ia-mark">${ic('house')}</span><strong>돌봄매트</strong><span class="ia-appname">입출고</span></div><span class="ia-who" id="iaWho"></span></header></div>
    <div class="ia-navline"><div class="ia-wrap"><div class="ia-nav"><div class="ia-navtabs"><button type="button" class="ia-navtab" onclick="ioAdmin.close()">${ic('truck')}현장 입력</button><button type="button" class="ia-navtab on">${ic('table')}입출고 취합</button></div>
    <div class="ia-regions" aria-label="지역 선택">${RKS.map(rk=>`<button type="button" class="${rk===HOME?'on':''}" onclick="ioAdmin.region('${rk}')">${REG[rk].n}</button>`).join('')}</div></div></div></div></div>
    <div class="ia-wrap"><main class="ia-page"><div id="iaFilters"></div><div id="iaBody"></div></main></div>`;
  document.body.appendChild(ov);
  const md=document.createElement('div');md.className='ia-md';md.id='iaMd';md.setAttribute('onclick','if(event.target===this)ioAdmin.mdClose()');
  md.innerHTML='<div class="ia-md-in" id="iaMdIn"></div>';document.body.appendChild(md);
  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!S.open)return;if($('iaMd').classList.contains('show'))mdClose();else close()});
}
function regionUrl(rk){return (rk==='gg'?'./scheduler-gg.html':'./scheduler.html')+'#ioadmin='+S.from}
function goRegion(rk){ // 지역 토글 = 스케줄러 오른쪽 위 토글과 같은 방식(그 지역 스케줄러로 이동) → 그 지역 시공보고(사용량·로스)까지 같이 뜸. 보던 날짜의 취합 화면을 바로 다시 엶
  if(rk===HOME||!REG[rk])return;try{localStorage.setItem('dolbom_region',rk)}catch(e){}location.href=regionUrl(rk);
}

/* ---------- 필터 ---------- */
function setMode(m){ // 'today' | 'yest' | 'day' | 'range'
  const t=U.kstDate(0);
  if(m==='today'){S.mode='day';S.from=S.to=t}else if(m==='yest'){S.mode='day';S.from=S.to=U.kstDate(-1)}
  else if(m==='range'){S.mode='range';if(!S.from)S.from=t;if(!S.to||S.to<S.from)S.to=S.from}
  else{S.mode='day';S.from=S.from||t;S.to=S.from}
  resub();renderFilters();renderBody();
}
function shiftDate(n){const span=dayList(S.from,S.to).length-1;S.from=U.addDays(S.from,n);S.to=S.mode==='range'?U.addDays(S.from,span):S.from;resub();renderFilters();renderBody()}
function setDate(which,v){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return;
  if(S.mode!=='range'){S.from=S.to=v}
  else{if(which==='from'){S.from=v;if(S.to<v)S.to=v}else{S.to=v;if(S.from>v)S.from=v}
    if(dayList(S.from,S.to).length>MAX_DAYS){S.to=U.addDays(S.from,MAX_DAYS-1);toast('기간은 최대 '+MAX_DAYS+'일까지 볼 수 있어요',true)}}
  resub();renderFilters();renderBody();
}
function setF(k,v){
  if(k==='basis'){if(v!=='work'&&v!=='move'||S.basis===v)return;S.basis=v;S.copySig={};S.tab='sum';resub();renderFilters();renderBody();return}
  if(k==='type')S.type=v;else if(k==='vehicle')S.vehicle=S.vehicle===v?'':v;else if(k==='head')S.head=!!v;else if(k==='showOff')S.showOff=!!v;else if(k==='full')S.fullCols=!!v;
  else if(k==='more')S.more=!S.more;else if(k==='tab')S.tab=v;else if(k==='kind')S.kind=v;
  if(k!=='tab'&&k!=='showOff'&&k!=='full'&&k!=='more'){S.drill={};S.copied=null;S.copyErr=''}
  if(k==='type'||k==='more')renderFilters();renderBody();
}
function basisName(){return S.basis==='work'?'작업일 기준':'실제 이동일 기준'}
function renderFilters(){
  const el=$('iaFilters');if(!el)return;
  const t=U.kstDate(0),y=U.kstDate(-1);const day=S.mode!=='range';
  const seg=(key,cur,opts)=>`<div class="ia-seg">${opts.map(o=>`<button type="button" class="${cur===o[0]?'on':''}" onclick="ioAdmin.f('${key}','${o[0]}')">${o[1]}</button>`).join('')}</div>`;
  el.innerHTML=`<div class="ia-titlebar"><div><div class="ia-eyebrow">DAILY OPERATIONS</div><h2>하루의 입출고를 한눈에.</h2><p class="ia-subtitle">제출 확인부터 엑셀 정리까지, 한곳에서.</p></div><button type="button" class="ia-button primary" id="iaExportBtn" onclick="ioAdmin.exportOpen()">${ic('copy')} 엑셀용 복사</button></div>
  <div class="ia-filterbar"><div class="ia-dategroup"><button type="button" class="ia-iconbtn" onclick="ioAdmin.shift(-1)" aria-label="이전 날짜">${ic('left')}</button>
      <input type="date" id="iaDate" aria-label="취합 날짜" value="${S.from}" onchange="ioAdmin.date('from',this.value)">${day?'':`<span class="ia-tiny">~</span><input type="date" aria-label="기간 끝" value="${S.to}" onchange="ioAdmin.date('to',this.value)">`}
      <button type="button" class="ia-iconbtn" onclick="ioAdmin.shift(1)" aria-label="다음 날짜">${ic('right')}</button>
      <button type="button" class="ia-button quiet small${day&&S.from===t?' on':''}" onclick="ioAdmin.mode('today')">오늘</button><button type="button" class="ia-button quiet small${day&&S.from===y?' on':''}" onclick="ioAdmin.mode('yest')">어제</button>
      <button type="button" class="ia-button quiet small${S.more?' on':''}" onclick="ioAdmin.f('more')">${ic('sliders')}상세 필터</button></div>
    <div class="ia-datebasis">${ic('cal')}${basisName()} <span class="ia-status">${esc(REG[HOME].n)} 창고</span></div></div>
  ${S.more?`<div class="ia-more"><div class="g"><label>보기</label><div class="ia-seg"><button type="button" class="${day?'on':''}" onclick="ioAdmin.mode('day')">하루</button><button type="button" class="${day?'':'on'}" onclick="ioAdmin.mode('range')">기간</button></div></div>
    <div class="g"><label>구분</label>${seg('type',S.type,[['all','전체'],['in','입고'],['out','출고']])}</div>
    <div class="g"><label>집계 기준</label>${seg('basis',S.basis,[['work','작업일'],['move','실제 이동일(사진 시각)']])}</div>
    <div style="flex-basis:100%">${S.basis==='work'?'작업일 = 그 짐이 쓰이는 시공일(직원 화면·입출고 목록과 같은 기준). 저녁에 실은 내일 것은 내일로, 아침에 내린 어제 것은 어제로 묶여요. 사용량·로스는 이 기준에서만 계산돼요.':'실제 이동일 = 짐 사진이 찍힌 날. 저녁에 실은 내일 작업분도 실은 날로 잡혀요. 지연 입력처럼 이동일을 알 수 없는 기록은 집계에서 빠져 확인 필요로 가요. 이 기준에서는 사용량·로스를 계산하지 않아요.'} <b style="color:var(--dm-amber)">엑셀에는 한 가지 기준으로만 넣어주세요</b>(섞으면 같은 짐이 두 날짜에 들어가요).</div></div>`:''}`;
  const w=$('iaWho');if(w)w.innerHTML='담당자 <b>'+esc(me()||'미지정')+'</b><u onclick="ioAdmin.name()">변경</u>';
}

/* ---------- 본문 ---------- */
function typeTag(t){return `<span class="ia-tag ${t}">${TYPE[t].n}</span>`}
function rangeLabel(){return isDay()?S.from+' ('+U.dowOf(S.from)+')':S.from+' ~ '+S.to+' ('+dayList(S.from,S.to).length+'일)'}
function vehName(k){const v=S.M&&S.M.veh.find(z=>z.key===k);return v?(v.who?v.who+' · ':'')+v.plate:k}
function filterLabel(){return REG[HOME].n+' · '+(S.vehicle?vehName(S.vehicle):'전체 차량')+(S.type==='all'?'':' · '+TYPE[S.type].n+'만')}
function unitLabel(u){return U.fmtMD(u.date)+' '+REG[u.rk].n}
function unitTag(u){
  if(u.state==='done')return '<span class="ia-tag ok">엑셀 반영 완료</span>';
  if(u.state==='stale')return '<span class="ia-tag st">재반영 필요</span>';
  if(u.state==='todo')return '<span class="ia-tag nt">엑셀 미반영</span>';
  return '<span class="ia-tag dim">기록 없음</span>';
}
function rowName(r){return r.size==='500'?'500 '+r.color:r.thick==='10T'?'1M '+r.color:'1M '+r.thick+' '+r.color}
function viewSig(M){return hash(M.view.map(x=>x.id+':'+x.sig).sort().join(',')+'|'+S.kind+'|'+(S.head?1:0)+'|'+S.basis)} // 지금 화면(=복사 대상)의 기록 묶음 표식
function recLine(x){return `${typeTag(x.type)} <b>${esc(x.vehicle||'-')}</b> ${esc(x.worker)} · 작성 ${esc(x.at.slice(5,16))}${x.wdate?' · 작업일 '+esc(U.fmtMD(x.wdate)):''} · <span style="color:var(--dm-muted)">${esc(x.items.map(it=>it.product+' '+((nn(it.total)||0)+(nn(it.tQty)||0))+'장').join(', '))}</span>`}
function useLine(v){ // 카드의 사용량·로스 줄 — 기존 입출고 대조와 같은 식(출고 − 입고 − 시공보고 판매갯수)
  const R=v.recon;if(!R||R.st==='none')return '';
  const use=`<span title="그날 시공보고의 판매갯수 합">사용 <b>${R.sold}</b></span>`;let t='';
  if(R.st==='nosold')t='<span class="ia-hold">사용량을 못 읽었어요(스케줄 새로고침 필요)</span>';
  else if(R.st==='miss')t=use+`<span class="ia-hold">시공보고 미입력 ${R.miss}건</span>`;
  else if(R.st==='noout')t=use+'<span class="ia-hold">출고 기록 없음</span>';
  else if(R.st==='beforein')t=use+'<span class="ia-hold">입고 전 · 로스 대기</span>';
  else if(R.st==='ok')t=use+'<span>로스 <b class="ia-fit">0 ✓</b></span>';
  else if(R.st==='prod')t=use+'<span>로스 <b>0</b></span><span class="ia-hold">제품 불일치</span>';
  else if(R.st==='loss')t=use+`<span>로스 <b class="ia-loss">${R.diff}</b></span>`;
  else t=use+`<span class="ia-hold">차 재고 ${-R.diff}장 사용</span>`;
  return `<div class="ia-teamcounts ia-teamuse">${t}</div>`;
}
function renderBody(){
  const el=$('iaBody');if(!el||!S.open)return;
  const M=build();S.M=M;
  if(S.vehicle&&!M.veh.some(v=>v.key===S.vehicle))S.vehicle='';
  if(S.tab==='flag'&&!M.flagged.length)S.tab='sum';
  const loading=!S.loaded['d'+HOME];const day=isDay();
  let h='';
  if(S.err)h+=`<div class="ia-err">${esc(S.err)}</div>`;
  // 알림 띠
  if(day&&M.veh.length){const wait=M.veh.filter(v=>v.state==='wait');
    h+=wait.length?`<div class="ia-notice">${ic('alert')}<div class="c"><strong>${wait.length}개 차량 확인 대기</strong><br><span>현재 ${M.veh.length-wait.length} / ${M.veh.length}개 차량이 제출했거나 '이동 없음'으로 확인됐어요. 미제출은 0장으로 치지 않고 확인을 기다려요.</span></div><button type="button" class="ia-button quiet small" onclick="ioAdmin.pending()">확인하기</button></div>`
      :`<div class="ia-notice ok">${ic('ok')}<div class="c"><strong>전체 차량 확인 완료</strong> · 추가 입출고가 없는지 확인한 뒤 엑셀에 반영해주세요.</div></div>`}
  if(M.flagged.length)h+=`<div class="ia-notice${M.excluded.length?' bad':''}">${ic('alert')}<div class="c"><strong>확인 필요 ${M.flagged.length}건</strong> · 집계에서 빠진 기록 ${M.excluded.length}건 · 참고 ${M.flagged.length-M.excluded.length}건</div><button type="button" class="ia-button quiet small" onclick="ioAdmin.f('tab','flag')">보기</button></div>`;
  // 차량 카드
  if(M.veh.length)h+=`<div class="ia-teams">${M.veh.map(v=>{const any=v.inN+v.outN>0;
    const stt=any?['ok','제출됨']:v.nomove?['ok','이동 없음']:day?['wait','확인 대기']:['','기록 없음'];
    return `<button type="button" class="ia-team${S.vehicle===v.key?' sel':''}" onclick="ioAdmin.f('vehicle','${esc(v.key)}')" aria-pressed="${S.vehicle===v.key}"><div class="ia-teamtop"><span class="ia-teamname">${esc(v.who||'담당 미지정')}</span><span class="ia-status ${stt[0]}">${stt[1]}</span></div>
      <div class="ia-teamplate">차량 ${esc(v.plate)}${v.reg?'':' · 미등록'}${v.exN?` · <span style="color:var(--red)">집계 제외 ${v.exN}</span>`:''}</div>
      <div class="ia-teamcounts">${any?`<span>입고 <b>${v.inQ}</b></span><span>출고 <b>${v.outQ}</b></span>`:v.nomove?'입출고 없음 확인':day?'아직 제출된 기록이 없어요':'이 기간 기록 없음'}</div>${useLine(v)}</button>`}).join('')}</div>`;
  else if(S.loaded['v'+HOME])h+=`<div class="ia-notice">${ic('alert')}<div class="c">등록된 차량이 없어요. 차량 탭에서 차량을 먼저 등록해주세요.</div></div>`;
  h+=panelHTML(M,loading)+bottomHTML(M)+(S.exportOpen?exportHTML(M):'');
  h+=`<div class="ia-note">취합 ${IA_VER} · 입출고 ${esc(X.ver||'')} · 이 화면은 직원 기록을 읽기만 해요(수정·취소는 차량 탭 목록에서). 반영 확인·이동 없음 확인·이동일 지정만 io_admin에 따로 남겨요. 사용 = 그날 시공보고의 판매갯수 합, 로스 = 출고 − 입고 − 사용(입출고 목록의 대조와 같은 식).</div>`;
  el.innerHTML=h;
  const ta=$('iaTsv');if(ta)ta.value=currentTSV(M);
}
function panelHTML(M,loading){
  const rows=M.agg;const tin=rows.reduce((a,r)=>a+r.in,0),tout=rows.reduce((a,r)=>a+r.out,0);
  const sel=S.vehicle?M.veh.find(v=>v.key===S.vehicle):null;
  let use='';if(S.basis==='work'&&isDay()){const list=(sel?[sel]:M.veh).filter(v=>v.recon&&v.recon.st!=='none'&&v.recon.st!=='nosold');
    if(list.length){const sold=list.reduce((a,v)=>a+v.recon.sold,0);const dec=list.filter(v=>v.recon.decided);const loss=dec.reduce((a,v)=>a+Math.max(0,v.recon.diff),0);
      use=`<span>사용<b>${sold}</b>장</span><span>로스<b class="${loss?'ia-loss':''}">${dec.length?loss:'–'}</b>${dec.length?'장':''}${dec.length<list.length?` <span class="ia-hold">(${list.length-dec.length}대 대기)</span>`:''}</span>`}}
  let h=`<div class="ia-panel" id="iaPanel"><div class="ia-panelhead"><div><h3>${sel?esc((sel.who?sel.who+' · ':'')+'차량 '+sel.plate):'전체 제품별 집계'}</h3></div><div class="ia-totals"><span>입고<b>${tin}</b>장</span><span>출고<b>${tout}</b>장</span>${use}</div></div>
    <div class="ia-tabs"><button type="button" class="t${S.tab==='sum'?' on':''}" onclick="ioAdmin.f('tab','sum')">제품별 합계</button><button type="button" class="t${S.tab==='rec'?' on':''}" onclick="ioAdmin.f('tab','rec')">제출 원본 ${M.view.length}</button>${M.flagged.length?`<button type="button" class="t${S.tab==='flag'?' on':''}" onclick="ioAdmin.f('tab','flag')">확인 필요 ${M.flagged.length}</button>`:''}
      ${S.vehicle?`<button type="button" class="ia-button quiet small" onclick="ioAdmin.f('vehicle','${esc(S.vehicle)}')">전체 보기</button>`:''}<span class="sp"></span>
      ${S.tab==='rec'?`<label><input type="checkbox" ${S.showOff?'checked':''} onchange="ioAdmin.f('showOff',this.checked)">취소·제외도 보기 (${M.excluded.length+M.voids.length})</label><label><input type="checkbox" ${S.fullCols?'checked':''} onchange="ioAdmin.f('full',this.checked)">전체 열</label>`:''}</div>`;
  if(S.tab==='flag')h+=flaggedHTML(M);
  else if(S.tab==='rec')h+=(M.view.length||(S.showOff&&M.detOff.length))?(S.fullCols?fullTable(M):recTable(M)):emptyHTML(M,sel,loading);
  else h+=rows.length?sumTable(M):emptyHTML(M,sel,loading);
  h+=`<div class="ia-tablefoot"><span>${M.view.length}건의 제출 · ${rows.length}개 품목·부위${M.excluded.length?` · <span style="color:var(--red)">집계 제외 ${M.excluded.length}건</span>`:''}${M.voids.length?` · 취소 ${M.voids.length}건`:''}</span><span>단위: 장 · 증감 = 입고 − 출고 (재고·로스 아님)</span></div></div>`;
  return h;
}
function emptyHTML(M,sel,loading){
  if(loading)return `<div class="ia-empty">${ic('inbox')}<strong>불러오는 중…</strong></div>`;
  const day=isDay();const wait=sel&&sel.state==='wait';
  if(sel&&sel.nomove)return `<div class="ia-empty">${ic('ok')}<strong>입출고 없음으로 확인됨</strong><p class="ia-tiny">${esc(sel.nomove.by||'')} · ${esc(String(sel.nomove.at||'').slice(5,16))}</p><div style="margin-top:16px"><button type="button" class="ia-button small" onclick="ioAdmin.nomove(0)">확인 해제</button></div></div>`;
  return `<div class="ia-empty">${ic('inbox')}<strong>${wait?'아직 제출된 기록이 없어요':'집계할 입출고가 없어요'}</strong><p class="ia-tiny">${wait?'0장으로 처리하지 않고 확인을 기다립니다. 직원에게 확인한 뒤 눌러주세요.':'다른 날짜나 차량을 선택해 보세요.'}</p>${wait&&day?`<div style="margin-top:16px"><button type="button" class="ia-button small" onclick="ioAdmin.nomove(1)">입출고 없음 확인</button></div>`:''}</div>`;
}
function sumTable(M){
  const day=isDay();const cols=day?5:6;
  let h=`<div class="ia-tw"><table class="ia-tb agg"><thead><tr>${day?'':'<th>날짜</th>'}<th>제품</th><th>부위</th><th class="r">입고</th><th class="r">출고</th><th class="r">증감</th></tr></thead><tbody>`;
  M.agg.forEach((r,i)=>{const d=r.in-r.out;const open=S.drill[r.key];
    const nb=(col,v)=>v?`<button type="button" class="ia-num ${col}${open===col?' on':''}" onclick="ioAdmin.drill(${i},'${col}')" title="어떤 기록이 들어갔는지 보기">${v}</button>`:'<span class="ia-num z">0</span>';
    h+=`<tr>${day?'':`<td>${esc(U.fmtMD(r.date))} <span class="dim">${esc(U.dowOf(r.date))}</span></td>`}<td class="pn">${esc(rowName(r))}${r.shared?'<small>17T·22T 공용</small>':''}</td><td>${esc(r.part)}</td><td class="r">${nb('in',r.in)}</td><td class="r">${nb('out',r.out)}</td><td class="r">${d>0?'+':''}${d}</td></tr>`;
    if(open){const src=r.src.filter(s=>s.type===open);
      h+=`<tr><td colspan="${cols}" style="padding-top:0"><div class="ia-dl"><span class="ia-tiny">${TYPE[open].n} ${r[open]}장 · 제출 근거 ${src.length}건</span>${src.map(s=>`<div><span class="q">${s.q}장</span><span><b>${esc(s.vehicle)}</b> ${esc(s.worker)}</span><span class="ia-tiny">${esc(String(s.at).slice(5,16))} · ${s.box}박스 + ${s.ea}장${s.per?' (당시 1박스='+s.per+'장)':''}${r.shared?' · '+esc(s.product)+' 밑에 입력':''}</span><span class="mono" style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--dm-muted)">${esc(s.id)}</span></div>`).join('')}</div></td></tr>`}
  });
  return h+'</tbody></table></div>';
}
function recTable(M){ // 제출 원본 — 한 제출에 한 줄(읽기 편한 모양). 엑셀 내역과 같은 17열은 '전체 열'
  const vf=x=>(!S.vehicle||x.plate===S.vehicle)&&(S.type==='all'||x.type===S.type);
  const list=M.view.slice().sort((a,b)=>(a.moveAt||a.at)<(b.moveAt||b.at)?-1:1).map(x=>({x,off:false})).concat(S.showOff?M.excluded.concat(M.voids).filter(vf).map(x=>({x,off:true})):[]);
  let h=`<div class="ia-tw"><table class="ia-tb rec"><thead><tr><th>구분 · 기록시각</th><th>차량</th><th>제품</th><th class="r">수량</th><th>작업일 · 사진 시각</th><th></th></tr></thead><tbody>`;
  list.forEach(o=>{const x=o.x;const i=M.all.indexOf(x);const tot=x.items.reduce((a,it)=>a+(nn(it.total)||0)+(nn(it.tQty)||0),0);
    const tags=[x.void?'<span class="ia-tag dim">취소됨</span>':'',o.off&&!x.void?'<span class="ia-tag ex">집계 제외</span>':'',x.rerec?'<span class="ia-tag st">재기록</span>':'',x.moveSrc==='fix'?'<span class="ia-tag nt">이동일 지정</span>':'',!o.off&&x.flags.length?'<span class="ia-tag nt">참고</span>':''].filter(Boolean).join(' ');
    h+=`<tr class="${o.off?'off':''}"><td>${typeTag(x.type)} <span class="ia-tiny">${esc(isDay()?x.at.slice(11,16):x.at.slice(5,16))}</span>${tags?'<br>'+tags:''}</td><td><b>${esc(x.vehicle)}</b><br><span class="ia-tiny">${esc(x.worker)}</span></td>
      <td class="pn w">${x.items.map(it=>`${esc(it.product||'(제품 없음)')}<small>${PART.map(pt=>{const q=nn(it[pt.k+'Qty']);return q?pt.n+' '+q:''}).filter(Boolean).join(' · ')}</small>`).join('')}</td><td class="r"><b>${tot}</b>장</td>
      <td>${x.wdate?esc(U.fmtMD(x.wdate))+' <span class="dim">'+esc(U.dowOf(x.wdate))+'</span>':'<span class="dim">—</span>'}<br><span class="ia-tiny">${x.raw.photoAt?'사진 '+esc(String(x.raw.photoAt).slice(5,16)):'사진 시각 없음'}</span></td>
      <td>${photoBtn(x)} <button type="button" class="ia-btn sm" onclick="ioAdmin.detail(${i})">상세보기</button></td></tr>`});
  return h+'</tbody></table></div>';
}
function fullTable(M){ // 엑셀 '제출 내역' 복사와 같은 17열
  const list=M.det.map(r=>({r,off:false})).concat(S.showOff?M.detOff.map(r=>({r,off:true})):[]);
  const sid=id=>id.length>12?'…'+id.slice(-9):id;const mdhm=t=>t?t.slice(5,16):'';
  let h=`<div class="ia-tw"><table class="ia-tb det"><thead><tr><th>기록 ID</th><th>실제 이동일시</th><th>시공 예정일</th><th>작성일시</th><th>지역</th><th>차량</th><th>제출자</th><th>구분</th><th>제품</th><th>부위</th><th class="r">박스</th><th class="r">낱장</th><th class="r">박스당</th><th class="r">환산 장수</th><th>메모</th><th>사진 · 상세</th><th>수정 여부</th></tr></thead><tbody>`;
  list.forEach(o=>{const r=o.r,x=r.x;const i=M.all.indexOf(x);const f=r.first;const memo=String(x.raw.note||'');const ed=editText(x);
    const edTag=x.void?'<span class="ia-tag dim">취소됨</span>':[x.rerec?'<span class="ia-tag st">재기록</span>':'',x.moveSrc==='fix'?'<span class="ia-tag nt">이동일 지정</span>':''].join(' ').trim();
    h+=`<tr class="${f?'grp':''}${o.off?' off':''}">`+
      (f?`<td class="mono" title="${esc(x.id)}">${esc(sid(x.id))}${o.off&&!x.void?'<br><span class="ia-tag ex">집계 제외</span>':''}</td><td>${x.moveSrc==='fix'?esc(U.fmtMD(x.moveDate))+' <span class="ia-tag nt">지정</span>':x.raw.photoAt?esc(mdhm(String(x.raw.photoAt))):'<span class="ia-tag ex">알 수 없음</span>'}</td><td>${x.wdate?esc(U.fmtMD(x.wdate))+' <span class="dim">'+esc(U.dowOf(x.wdate))+'</span>':'<span class="dim">—</span>'}</td><td>${esc(mdhm(x.at))}</td><td>${esc(x.region)}</td><td><b>${esc(x.vehicle)}</b></td><td>${esc(x.worker)}</td><td>${typeTag(x.type)}</td>`
        :`<td class="dim mono" style="opacity:.35">〃</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>`)+
      `<td>${esc(r.product)}</td><td>${esc(r.part)}</td><td class="r">${r.box}</td><td class="r">${r.ea}</td><td class="r dim">${r.per||'—'}</td><td class="r"><b>${r.qty}</b></td>`+
      (f?`<td title="${esc(memo)}">${memo?esc(memo.length>14?memo.slice(0,14)+'…':memo):'<span class="dim">—</span>'}</td><td>${photoBtn(x)||'<span class="dim" style="font-size:11.5px">사진 전송 중</span>'} <button type="button" class="ia-btn sm" onclick="ioAdmin.detail(${i})">상세보기</button></td><td title="${esc(ed)}">${edTag||'<span class="dim">—</span>'}</td>`:`<td></td><td></td><td></td>`)+`</tr>`});
  return h+'</tbody></table></div>';
}
function flaggedHTML(M){
  const idx=x=>M.all.indexOf(x);let h='';
  M.flagged.forEach(x=>{const ex=!!x.excluded;const canFix=ex&&!x.moveDate&&S.basis==='move';
    h+=`<div class="ia-wi"><div class="t">${ex?'<span class="ia-tag ex">집계 제외</span>':'<span class="ia-tag nt">참고</span>'} ${recLine(x)}<br><b style="color:${ex?'var(--red)':'var(--dm-amber)'}">${esc(ex?x.excluded:x.flags.join(' · '))}</b>${ex&&x.flags.length?'<br><span class="ia-tiny">'+esc(x.flags.join(' · '))+'</span>':''}${ex&&!canFix?'<br><span class="ia-tiny">해당 직원에게 확인한 뒤 차량 탭 목록에서 취소하고 다시 기록하게 해주세요.</span>':''}</div>
      <div class="a">${canFix?`<button type="button" class="ia-btn sm pri" onclick="ioAdmin.fix(${idx(x)})">이동일 지정</button>`:''}${x.moveSrc==='fix'?`<button type="button" class="ia-btn sm" onclick="ioAdmin.unfix(${idx(x)})">지정 취소</button>`:''}<button type="button" class="ia-btn sm" onclick="ioAdmin.detail(${idx(x)})">상세보기</button>${photoBtn(x)}</div></div>`});
  return h;
}
function bottomHTML(M){
  const hint=S.vehicle||S.type!=='all'?'현재 선택한 차량·구분만 표시 중 — 반영 완료 표시는 전체 보기에서':'같은 날짜·지역의 엑셀 범위를 교체해 붙여넣기';
  const chips=M.units.length?M.units.map((u,i)=>`<button type="button" class="ia-unit ${u.state}" onclick="ioAdmin.unit(${i})">${isDay()?'':'<b>'+esc(U.fmtMD(u.date))+'</b>'}${unitTag(u)}<small>${u.state==='stale'?`새 ${u.added.length} · 변경 ${u.changed.length} · 빠짐 ${u.removed.length}`:u.last?esc((u.last.by||'')+' '+String(u.last.at||'').slice(5,16)):`기록 ${u.n}건`}</small>${u.other?'<small style="color:var(--dm-amber)">⚠ 다른 기준 반영 이력</small>':''}</button>`).join(''):'<span class="ia-unit"><span class="ia-tag dim">기록 없음</span></span>';
  return `<div class="ia-bottom"><div class="u">${chips}</div><span class="ia-tiny">${hint}</span></div>`;
}
function currentTSV(M){return S.kind==='det'?detTSV(M.det,S.head):aggTSV(M.agg,S.head)}
function exportHTML(M){
  const n=S.kind==='det'?M.det.length:M.agg.length;const wait=isDay()?M.veh.filter(v=>v.state==='wait').length:0;
  const canReflect=!S.vehicle&&S.type==='all';const todo=reflectTodo(M);
  let st='';
  if(S.copyErr)st=`<div class="ia-statusline bad"><b>자동 복사가 안 됐어요 — 복사되지 않은 상태예요.</b> 위 칸을 눌러 전체 선택(Ctrl+A) → 복사(Ctrl+C)한 뒤 엑셀에 붙여넣어 주세요.</div>`;
  else if(S.copied&&S.copied.sig!==viewSig(M))st=`<div class="ia-statusline warn"><b>⚠ 복사한 뒤에 기록이나 복사 옵션이 바뀌었어요.</b> ${esc(S.copied.at)}에 복사한 내용은 지금과 달라요 — 엑셀에 넣기 전에 다시 복사해 주세요.</div>`;
  else if(S.copied)st=`<div class="ia-statusline"><b>📋 클립보드에 복사됨</b> — ${esc(S.copied.desc)} · ${esc(S.copied.at)}. 엑셀에서 첫 칸을 누르고 Ctrl+V. 붙여넣기까지 끝났으면 [붙여넣기 완료 표시]를 따로 눌러주세요.</div>`;
  else st='<div class="ia-statusline"></div>';
  return `<section class="ia-export" id="iaExport"><div class="ia-exhead"><h3>엑셀로 옮기기</h3><button type="button" class="ia-button quiet small" onclick="ioAdmin.exportClose()">${ic('x')} 닫기</button></div>
    <div class="ia-exopt"><span>${esc(rangeLabel())} · ${esc(filterLabel())} · ${basisName()} · <b style="color:var(--dm-ink)">${n}행</b>${S.head?' + 제목 1행':''}</span><div class="o"><div class="ia-seg"><button type="button" class="${S.kind==='agg'?'on':''}" onclick="ioAdmin.f('kind','agg')">제품별 집계</button><button type="button" class="${S.kind==='det'?'on':''}" onclick="ioAdmin.f('kind','det')">제출 내역</button></div><label><input type="checkbox" ${S.head?'checked':''} onchange="ioAdmin.f('head',this.checked)"> 제목 행 포함</label></div></div>
    ${wait?`<div class="ia-notice">${ic('alert')}<span>확인 대기 차량이 ${wait}대 있어 부분 집계예요.</span></div>`:''}${M.excluded.length?`<div class="ia-notice bad">${ic('alert')}<span>집계에서 빠진 확인 필요 기록 ${M.excluded.length}건은 복사에 들어가지 않아요.</span></div>`:''}
    <textarea id="iaTsv" readonly aria-label="엑셀 붙여넣기용 데이터" onclick="this.select()"></textarea>
    <p class="ia-exnote">복사한 뒤 기존 엑셀의 <b>같은 범위에 전체를 붙여넣어 교체</b>해주세요(추가분만 따로 복사하지 않아요). ${S.kind==='det'?'제출 내역은 집계에 포함된 기록만 들어가요(집계표와 합이 맞아요).':''}</p>
    <div class="ia-exact"><button type="button" class="ia-button primary" ${n?'':'disabled'} onclick="ioAdmin.copy()">${ic('copy')} ${n}행 복사</button><button type="button" class="ia-button" ${canReflect&&todo.length?'':'disabled'} onclick="ioAdmin.reflect()">${ic('checks')} 붙여넣기 완료 표시${todo.length>1?' ('+todo.length+'일)':''}</button></div>${st}
    <p class="ia-exnote">${canReflect?'완료 표시는 <b>담당자가 확인한 상태</b>이며, 엑셀과 자동 연동되지는 않아요. 표시한 뒤에 새 제출·취소가 생기면 자동으로 \'재반영 필요\'로 바뀌어요.':'차량·구분을 고른 상태의 복사예요. 날짜 전체의 반영 완료는 전체 보기에서 표시해 주세요.'} '우리 엑셀 양식으로 복사'(열·제품 행 순서 맞춤)는 실제 엑셀 파일을 확인해야 만들 수 있어서 아직 없어요.</p></section>`;
}
function exportOpen(){S.exportOpen=true;S.copyErr='';renderBody();const e=$('iaExport');if(e&&e.scrollIntoView)try{e.scrollIntoView({behavior:'smooth',block:'start'})}catch(x){e.scrollIntoView()}}
function exportClose(){S.exportOpen=false;S.copyErr='';renderBody()}
function pendingGo(){const M=S.M;if(!M)return;const w=M.veh.find(v=>v.state==='wait');if(!w)return;S.vehicle=w.key;S.tab='sum';renderBody();const p=$('iaPanel');if(p&&p.scrollIntoView)try{p.scrollIntoView({behavior:'smooth',block:'center'})}catch(x){}}

/* ---------- 엑셀용 TSV ---------- */
function tText(v){ // 글자 칸 — 탭·줄바꿈 제거, 수식으로 실행될 수 있는 첫 글자(= + - @) 앞에 ' , 큰따옴표는 표준 방식으로 감쌈
  let t=String(v==null?'':v).replace(/[\t\r\n\v\f\u2028\u2029]+/g,' ').replace(/ {2,}/g,' ').trim();
  if(/^[=+\-@]/.test(t))t="'"+t;
  if(t.indexOf('"')>=0)t='"'+t.replace(/"/g,'""')+'"';
  return t;
}
function tId(v){ // 식별자 칸 — 숫자·날짜처럼 보여서 엑셀이 바꿔 버릴 값이면 앞에 ' (예: 직접 입력한 차량번호 '0123')
  const raw=String(v==null?'':v).replace(/[\t\r\n\v\f\u2028\u2029]+/g,' ').trim();
  if(raw&&/^[\d\s.,:\/\-+eE]+$/.test(raw)&&/\d/.test(raw))return "'"+raw;
  return tText(raw);
}
function tNum(v){const n=Number(v);return Number.isFinite(n)?String(Math.trunc(n)):'0'}
function aggTSV(rows,head){
  const out=[];if(head)out.push(AGG_HEAD.join('\t'));
  rows.forEach(r=>out.push([r.date,tText(r.region),tText(r.size),tText(r.color),tText(r.thick),tText(r.part),tNum(r.in),tNum(r.out),tNum(r.in-r.out)].join('\t')));
  return out.join('\r\n');
}
function detTSV(rows,head){
  const out=[];if(head)out.push(DET_HEAD.join('\t'));
  rows.forEach(r=>{const x=r.x;out.push([tId(x.id),x.moveSrc==='fix'?x.moveDate:String(x.raw.photoAt||''),x.wdate,x.at,tText(x.region),tId(x.vehicle),tText(x.worker),TYPE[x.type].n,tText(r.product),tText(r.part),tNum(r.box),tNum(r.ea),r.per?tNum(r.per):'',tNum(r.qty),tText(x.raw.note||''),x.raw.photoId?U.viewUrl(x.raw.photoId):'',tText(editText(x))].join('\t'))});
  return out.join('\r\n');
}
async function writeClipboard(text){ // 성공했을 때만 true
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);return true}}catch(e){console.warn('[ioadmin] clipboard',e)}
  try{const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0;font-size:16px';document.body.appendChild(ta);ta.focus();ta.select();try{ta.setSelectionRange(0,text.length)}catch(e){}
    let ok=false;try{ok=document.execCommand('copy')}catch(e){}document.body.removeChild(ta);return !!ok}catch(e){return false}
}
async function copy(){
  const M=S.M;if(!M)return;const kind=S.kind;const rows=kind==='det'?M.det:M.agg;if(!rows.length){toast('복사할 행이 없어요',true);return}
  const text=currentTSV(M);
  const desc=(kind==='agg'?'제품별 집계 ':'제출 내역 ')+rows.length+'행'+(S.head?' + 제목 1행':'')+' · '+rangeLabel()+' · '+filterLabel();
  const ok=await writeClipboard(text);
  if(ok){
    if(kind==='agg'&&!S.vehicle&&S.type==='all')M.units.forEach(u=>{S.copySig[u.rk+'|'+u.date]=u.sig}); // 이 시점의 기록 묶음을 기억
    S.copyErr='';S.copied={kind,desc,at:U.kstDT(new Date()).slice(11,16),sig:viewSig(M)};renderBody();toast('📋 복사됨 · 엑셀에 붙여넣은 뒤 완료 표시는 따로 눌러주세요');return}
  S.copied=null;S.copyErr='1';renderBody(); // 성공 표시 없이 안내만 — 칸을 선택해 둠
  const ta=$('iaTsv');if(ta){try{ta.focus();ta.select()}catch(e){}}
}

/* ---------- 모달 · 상세 ---------- */
function md(html){$('iaMdIn').innerHTML=html;$('iaMd').classList.add('show')}
function mdClose(){$('iaMd').classList.remove('show');$('iaMdIn').innerHTML='';S.sel=null}
function recAt(i){return S.M&&S.M.all[i]||null}
function selRec(){const t=S.sel;if(!t||!t.id||!S.M)return null;return S.M.all.find(x=>x.rk===t.rk&&x.id===t.id)||null} // 모달이 잡은 기록을 최신 데이터에서 다시 찾음
function selUnit(){const t=S.sel;if(!t||!t.date||!S.M)return null;return S.M.units.find(u=>u.rk===t.rk&&u.date===t.date)||null}
function photoBtn(x){const pid=String(x.raw.photoId||'');return /^[\w-]+$/.test(pid)?`<button type="button" class="ia-btn sm" onclick="ioAdmin.photoId('${pid}')">사진 보기</button>`:''}
function detail(i){
  const x=recAt(i);if(!x)return;const r=x.raw;
  const items=x.items.map(it=>`<div class="box"><b>${esc(it.product||'(제품 없음)')}</b> · 합계 ${nn(it.total)||0}장${nn(it.tQty)?' + 10T '+nn(it.tQty)+'장':''}<br>${PART.map(pt=>{const q=nn(it[pt.k+'Qty']),b=nn(it[pt.k+'Box']),e=nn(it[pt.k+'Ea']);if(!q&&!b&&!e)return '';const per=nn(pt.k==='t'?it.per10:it.per);return `<span style="display:inline-block;min-width:46px;color:var(--dim)">${pt.n}</span> ${b}박스 + ${e}장 ${per?'<span style="color:var(--dim)">(당시 1박스='+per+'장)</span>':''} = <b>${q}장</b>`}).filter(Boolean).join('<br>')}</div>`).join('');
  md(`<h3>${typeTag(x.type)} ${esc(x.vehicle)} ${esc(x.worker)} <span style="font-size:12px;color:var(--dim);font-weight:600">${esc(x.region)}</span></h3>
    <div class="kv"><span>기록 ID</span><span style="font-family:ui-monospace,Menlo,monospace">${esc(x.id)}</span>
    <span>실제 이동일시</span><span>${x.moveSrc==='fix'?esc(x.moveDate)+' (담당자 지정)':x.moveAt?esc(x.moveAt)+' (사진 촬영 시각)':'<b style="color:var(--red)">알 수 없음</b>'}</span>
    <span>시공 예정일</span><span>${esc(x.wdate||'기록에 없음')}</span><span>작성일시</span><span>${esc(x.at)}</span>
    <span>사진 시각</span><span>${esc(r.photoAt||'없음')}${Number(r.photoGap)?' · 제출 '+Number(r.photoGap)+'분 전 촬영':''}${r.late?' · 지연 입력':''}</span>
    <span>상태</span><span>${x.void?'취소됨':r.status==='pending'?'전송 대기':'정상'}${x.void?' · '+esc(r.voidAt||'')+' · '+esc(r.voidBy||'')+' · 사유: '+esc(r.voidReason||'-'):''}</span>
    <span>집계</span><span>${x.void?'제외(취소)':x.excluded?'<b style="color:var(--red)">제외</b> — '+esc(x.excluded):'포함'}</span>
    ${x.flags.length?`<span>참고</span><span>${esc(x.flags.join(' · '))}</span>`:''}${x.rerec?`<span>수정 이력</span><span>${esc(x.rerec)}</span>`:''}
    <span>메모</span><span style="white-space:pre-wrap">${esc(r.note||'—')}</span>
    <span>버전 표식</span><span style="font-family:ui-monospace,Menlo,monospace;color:var(--dim)">${esc(x.sig)} · 앱 ${esc(r.ver||'-')}</span></div>
    ${items}<div class="bt">${photoBtn(x)}<button type="button" class="ia-btn" onclick="ioAdmin.mdClose()">닫기</button></div>`);
}
function photo(i){const x=recAt(i);if(!x||!x.raw.photoId){toast('사진이 아직 전송 중이에요',true);return}photoId(String(x.raw.photoId))}
function photoId(pid){if(!/^[\w-]+$/.test(String(pid||'')))return;try{X.view(pid)}catch(e){window.open(U.viewUrl(pid),'_blank','noopener')}}
function drill(i,col){const r=S.M&&S.M.agg[i];if(!r)return;S.drill[r.key]=S.drill[r.key]===col?'':col;renderBody()}

/* ---------- 쓰기: 입출고 없음 · 이동일 지정 · 반영 확인 (전부 io_admin 아래에만) ---------- */
function nomove(on){
  const v=S.M&&S.M.veh.find(z=>z.key===S.vehicle);if(!v||!isDay())return;const by=guard();if(!by)return;
  const ref=db.ref(ROOT+'/nomove/'+v.rk+'/'+S.from+'/'+fbKey(v.key));
  const p=on?ref.set({by,at:U.kstDT(new Date()),plate:v.plate,who:v.who||'',basisKey:S.basis}):ref.remove();
  Promise.resolve(p).then(()=>toast(on?'입출고 없음으로 확인했어요':'확인을 해제했어요')).catch(e=>toast(fbErr(e),true));
}
function fix(i){
  const x=recAt(i);if(!x)return;if(!X.admin()){toast('당번 모드(🔑)가 꺼져 있어요',true);return}
  md(`<h3>이동일 지정</h3><div>${recLine(x)}<br><b style="color:var(--red)">${esc(x.excluded)}</b></div>
    <div class="box">이 기록의 짐이 <b>실제로 움직인 날짜</b>를 직원에게 확인한 뒤 정해주세요. 정한 날짜의 집계에 들어가고, 누가 언제 정했는지 남아요. (직원이 고른 작업일 ${esc(x.wdate||'-')} · 작성일 ${esc(x.cdate)})</div>
    <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><input type="date" id="iaFixDate" value="" max="${U.kstDate(0)}"><span style="color:var(--dim);font-size:12px">날짜를 직접 골라주세요(자동으로 채우지 않아요)</span></div>
    <div class="bt"><button type="button" class="ia-btn" onclick="ioAdmin.mdClose()">닫기</button><button type="button" class="ia-btn pri" onclick="ioAdmin.fixSave()">이 날짜로 집계에 포함</button></div>`);
  S.sel={rk:x.rk,id:x.id};
}
function fixSave(){
  const x=selRec();const el=$('iaFixDate');if(!x||!el){toast('기록을 다시 골라주세요',true);return}const d=el.value;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){toast('날짜를 골라주세요',true);return}if(d>U.kstDate(0)){toast('오늘 이후 날짜는 안 돼요',true);return}
  const by=guard();if(!by)return;
  Promise.resolve(db.ref(ROOT+'/datefix/'+x.rk+'/'+fbKey(x.id)).set({date:d,by,at:U.kstDT(new Date()),why:String(x.excluded||'').slice(0,160)})).then(()=>{mdClose();toast(U.fmtMD(d)+' 이동으로 지정했어요'+(inRange(d)?'':' · 그 날짜를 열면 보여요'))}).catch(e=>toast(fbErr(e),true));
}
function unfix(i){const x=recAt(i);if(!x)return;const by=guard();if(!by)return;if(!confirm('이동일 지정을 취소할까요? 이 기록은 다시 집계에서 빠져요.'))return;
  Promise.resolve(db.ref(ROOT+'/datefix/'+x.rk+'/'+fbKey(x.id)).remove()).then(()=>toast('지정을 취소했어요')).catch(e=>toast(fbErr(e),true))}
function unitAgg(u,M){return aggregate(M.full.filter(x=>x.rk===u.rk&&x.moveDate===u.date),false)}
function aggLines(rows){return rows.map(r=>[r.size,r.color,r.thick,r.part,r.in,r.out])}
function reflectTodo(M){return M.units.filter(u=>u.state==='todo'||u.state==='stale')}
function movedSinceCopy(list){return list.filter(u=>{const c=S.copySig[u.rk+'|'+u.date];return c!=null&&c!==u.sig})} // 이 화면에서 복사한 뒤 기록이 달라진 곳
function reflect(){
  const M=S.M;if(!M)return;if(S.vehicle||S.type!=='all'){toast("차량·구분을 '전체'로 둔 뒤에 해주세요",true);return}
  if(!X.admin()){toast('당번 모드(🔑)가 꺼져 있어요',true);return}
  const todo=reflectTodo(M);if(!todo.length){toast('새로 반영할 곳이 없어요');return}
  const moved=movedSinceCopy(todo);
  if(moved.length){md(`<h3 style="color:var(--yellow)">복사한 뒤에 기록이 바뀌었어요</h3><div><b>${moved.map(u=>esc(unitLabel(u))).join(', ')}</b> — 방금 복사한 내용과 지금 집계가 달라요(새 제출·취소가 들어옴). 이대로 완료 처리하면 엑셀과 어긋나요.<br><b>② 집계를 다시 복사해서 엑셀의 같은 범위를 교체한 뒤</b> 눌러주세요.</div><div class="bt"><button type="button" class="ia-btn" onclick="ioAdmin.mdClose()">확인</button></div>`);return}
  md(`<h3>엑셀 반영 완료로 표시</h3><div>아래 날짜·지역의 <b>최신 전체 집계</b>를 엑셀의 같은 범위에 붙여넣어 교체하는 것까지 끝냈을 때만 눌러주세요. 프로그램은 엑셀을 볼 수 없어서, <b>담당자가 확인했다</b>는 기록으로 남아요.</div>
    <div class="box">${todo.map(u=>`<div><b>${esc(u.date)} · ${esc(REG[u.rk].n)}</b> — 기록 ${u.n}건 · 집계 ${unitAgg(u,M).length}행 ${u.state==='stale'?'<span class="ia-tag st">재반영</span>':''}${S.copySig[u.rk+'|'+u.date]==null?' <span style="color:var(--dim);font-size:11.5px">(이 화면에서 복사한 적 없음)</span>':''}</div>`).join('')}</div>
    ${M.excluded.length?`<div style="margin-top:8px;color:var(--orange)">집계에서 빠져 있는 확인 필요 기록 ${M.excluded.length}건은 이번 반영에 <b>포함되지 않아요</b>. 나중에 풀리면 '재반영 필요'로 바뀌어요.</div>`:''}
    <div class="bt"><button type="button" class="ia-btn" onclick="ioAdmin.mdClose()">아직이에요</button><button type="button" class="ia-btn ok" onclick="ioAdmin.reflectSave()">붙여넣기까지 끝냈어요 · 반영 완료</button></div>`);
  S.sel={confirm:todo.map(u=>({rk:u.rk,date:u.date,sig:u.sig}))}; // 확인 창을 띄운 시점의 묶음 — 저장 직전에 다시 대조
}
function reflectSave(){
  const M=S.M;const want=S.sel&&S.sel.confirm;if(!M||!want)return;const by=guard();if(!by)return;
  const todo=[];let drift=false;
  want.forEach(w=>{const u=M.units.find(z=>z.rk===w.rk&&z.date===w.date);if(!u||u.sig!==w.sig)drift=true;else if(u.state==='todo'||u.state==='stale')todo.push(u)});
  if(drift){md(`<h3 style="color:var(--yellow)">확인하는 사이에 기록이 바뀌었어요</h3><div>완료 처리하지 않았어요. ② 집계를 다시 복사해서 엑셀을 교체한 뒤 다시 눌러주세요.</div><div class="bt"><button type="button" class="ia-btn" onclick="ioAdmin.mdClose()">확인</button></div>`);return}
  if(!todo.length){mdClose();return}
  const now=new Date();const at=U.kstDT(now);
  const jobs=todo.map(u=>{const recs={},info={};M.full.filter(x=>x.rk===u.rk&&x.moveDate===u.date).forEach(x=>{recs[fbKey(x.id)]=x.sig;info[fbKey(x.id)]=[x.plate,x.type,x.at.slice(11,16),x.vehicle].join('|')});
    const ex={};M.excluded.filter(x=>x.rk===u.rk&&(x.moveDate||x.cdate)===u.date).forEach(x=>{ex[fbKey(x.id)]=x.excluded.slice(0,120)});
    const rec={type:'confirm',by,at,ts:now.getTime(),date:u.date,region:REG[u.rk].n,basisKey:S.basis,basis:S.basis==='work'?'작업일':'실제 이동일(사진 촬영 시각)',recs,recInfo:info,agg:aggLines(unitAgg(u,M)),n:Object.keys(recs).length,ver:IA_VER};
    if(Object.keys(ex).length)rec.excluded=ex;
    return Promise.resolve(db.ref(ROOT+'/reflect/'+u.rk+'/'+u.date+'/c'+now.getTime()+'_'+Math.random().toString(36).slice(2,6)).set(rec)).then(()=>({u,ok:true})).catch(e=>({u,ok:false,e}))});
  Promise.all(jobs).then(res=>{const bad=res.filter(r=>!r.ok);
    if(bad.length){md(`<h3 style="color:var(--red)">반영 완료 표시가 저장되지 않았어요</h3><div>${bad.map(r=>esc(unitLabel(r.u))).join(', ')} — ${esc(fbErr(bad[0].e))}<br><b>이 곳들은 '반영 완료'로 바뀌지 않았어요.</b></div><div class="bt"><button type="button" class="ia-btn" onclick="ioAdmin.mdClose()">닫기</button></div>`);return}
    mdClose();toast('✅ '+res.length+'곳 반영 완료로 표시했어요')});
}
function unit(i){
  const M=S.M;const u=M&&M.units[i];if(!u)return;
  const name=id=>{const x=M.full.find(y=>fbKey(y.id)===id);if(x)return `${typeTag(x.type)} <b>${esc(x.vehicle)}</b> ${esc(x.worker)} ${esc(x.at.slice(11,16))} <span style="color:var(--dim);font-family:ui-monospace,Menlo,monospace;font-size:11px">${esc(x.id)}</span>`;
    const inf=String(((u.last||{}).recInfo||{})[id]||'').split('|');return `${inf[1]?typeTag(inf[1]==='in'?'in':'out'):''} <b>${esc(inf[3]||inf[0]||'')}</b> ${esc(inf[2]||'')} <span style="color:var(--dim);font-family:ui-monospace,Menlo,monospace;font-size:11px">${esc(id)}</span>`};
  let diff='';
  if(u.state==='stale'){
    const was={};(u.last.agg||[]).forEach(a=>{was[a.slice(0,4).join('|')]={in:a[4]||0,out:a[5]||0}});const nowA={};aggLines(unitAgg(u,M)).forEach(a=>{nowA[a.slice(0,4).join('|')]={in:a[4]||0,out:a[5]||0}});
    const keys=Array.from(new Set(Object.keys(was).concat(Object.keys(nowA)))).filter(k=>{const a=was[k]||{in:0,out:0},b=nowA[k]||{in:0,out:0};return a.in!==b.in||a.out!==b.out});
    diff=`<div class="box"><b style="color:var(--yellow)">지난 반영 뒤에 바뀐 것</b>${u.added.length?'<br>새 기록: '+u.added.map(name).join(' / '):''}${u.changed.length?'<br>내용 변경: '+u.changed.map(name).join(' / '):''}${u.removed.length?'<br>취소·삭제·제외: '+u.removed.map(name).join(' / '):''}
      ${keys.length?'<br><span style="color:var(--dim)">집계 변화</span><br>'+keys.map(k=>{const a=was[k]||{in:0,out:0},b=nowA[k]||{in:0,out:0};return esc(k.split('|').join(' · '))+' — 입고 '+a.in+'→<b>'+b.in+'</b> · 출고 '+a.out+'→<b>'+b.out+'</b>'}).join('<br>'):''}
      <br><span style="color:var(--dim)">전체 집계를 다시 복사해서 엑셀의 같은 범위를 교체한 뒤 [엑셀 반영 완료로 표시]를 눌러주세요.</span></div>`;
  }
  const hist=u.hist.slice().reverse().map(e=>`<div>${e.type==='confirm'?'<span class="ia-tag ok">반영 확인</span>':'<span class="ia-tag dim">표시 취소</span>'} <b>${esc(e.by||'-')}</b> · ${esc(e.at||'')}${e.type==='confirm'?' · 기록 '+(e.n||0)+'건 · 집계 '+((e.agg||[]).length)+'행':''}</div>`).join('');
  md(`<h3>${esc(u.date)} · ${esc(REG[u.rk].n)} ${unitTag(u)}</h3><div>지금 집계 포함 기록 <b>${u.n}</b>건.${u.last?` 마지막 반영 확인: <b>${esc(u.last.by||'-')}</b> · ${esc(u.last.at||'')}`:' 아직 반영 확인이 없어요.'}</div>${diff}
    ${u.other?`<div class="box" style="color:var(--dm-amber)">⚠ 이 날짜는 <b>다른 집계 기준</b>(${S.basis==='work'?'실제 이동일':'작업일'})으로 반영 확인된 이력이 ${u.other}건 있어요. 기준을 섞어 붙여넣으면 같은 짐이 엑셀에 두 번 들어갈 수 있어요.</div>`:''}
    <div class="box"><b>이력 (${basisName()})</b>${hist||'<br><span style="color:var(--dim)">없음</span>'}</div>
    <div class="bt">${u.last?`<button type="button" class="ia-btn" onclick="ioAdmin.revoke()">반영 완료 표시 취소</button>`:''}<button type="button" class="ia-btn" onclick="ioAdmin.mdClose()">닫기</button></div>`);
  S.sel={rk:u.rk,date:u.date};
}
function revoke(){
  const u=selUnit();if(!u||!u.last)return;const by=guard();if(!by)return;if(!confirm(unitLabel(u)+' 반영 완료 표시를 취소할까요? (이력은 남아요)'))return;
  const now=new Date();
  Promise.resolve(db.ref(ROOT+'/reflect/'+u.rk+'/'+u.date+'/c'+now.getTime()+'_'+Math.random().toString(36).slice(2,6)).set({type:'revoke',by,at:U.kstDT(now),ts:now.getTime(),date:u.date,region:REG[u.rk].n,basisKey:S.basis})).then(()=>{mdClose();toast('반영 완료 표시를 취소했어요')}).catch(e=>toast(fbErr(e),true));
}

/* ---------- 열기·닫기 ---------- */
function jobsSig(){try{if(typeof J==='undefined'||!Array.isArray(J))return '';let n=0;for(const j of J)n+=(+j.sold||0);return J.length+':'+n}catch(e){return ''}} // 시공보고가 새로 들어오면(판매갯수 변화) 사용량·로스를 다시 그림
function open(){
  if(!X.admin()){toast('당번 모드(🔑)를 켠 뒤에 열 수 있어요',true);return}
  ensureShell();S.open=true;$('iaOv').classList.add('show');$('iaOv').scrollTop=0;
  const t=U.kstDate(0);const want=window.__ioAdminDate;try{delete window.__ioAdminDate}catch(e){}
  if(/^\d{4}-\d{2}-\d{2}$/.test(want||'')){S.mode='day';S.from=S.to=want}else if(!S.from){S.mode='day';S.from=S.to=t}
  resub();renderFilters();renderBody();
  clearInterval(S.timer);S.jsig=jobsSig();S.timer=setInterval(()=>{if(!S.open)return;const g=jobsSig();if(g!==S.jsig){S.jsig=g;renderBody()}},4000);
}
function close(){S.open=false;clearInterval(S.timer);unsubAll();const o=$('iaOv');if(o)o.classList.remove('show');const m=$('iaMd');if(m)m.classList.remove('show')}

window.ioAdmin={open,close,mode:setMode,date:setDate,shift:shiftDate,f:setF,region:goRegion,copy,exportOpen,exportClose,pending:pendingGo,drill,detail,photo,photoId,nomove,fix,fixSave,unfix,reflect,reflectSave,unit,revoke,mdClose,name:()=>{askName(true);renderFilters()},
  _t:{S,build,aggTSV,detTSV,tText,tId,specOf,checkItem,moveInfo,regionUrl}}; // _t = 테스트용 내부 참조
})();
