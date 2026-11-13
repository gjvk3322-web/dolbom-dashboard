/* ============================================================
   info.js — ℹ️ 정보 탭 (회사 공용 정보: 직원 연락처·계좌·업체·사고 대응·인증서 등)
   scheduler.html · scheduler-gg.html 공용 (둘 다 이 파일 하나를 불러옴)

   ■ 내용은 전부 Firebase /info 에 저장 → 이 파일(공개 레포)에는 실제 연락처·계좌가 들어가지 않음.
     추가·수정·삭제·순서 변경은 앱 안 [편집]에서 (배포 불필요). 부산·경기가 같은 내용을 봄.
   ■ 권한
     · 보기 = auth.js 로그인 게이트를 통과한 승인 직원
     · 편집 = 관리자(auth.js ADMIN_EMAILS)만 — window.dolbomAuth.isAdmin
     · 화면에서 버튼을 숨기는 것만으로는 막을 수 없으므로 실제 잠금은 Firebase 보안 규칙의 "info" 블록이 함.
       규칙이 아직 없으면(= 로그인 없이도 읽고 쓸 수 있는 상태) 관리자 화면에 안내 카드가 뜨고 편집이 열리지 않음.
   ■ 읽기·쓰기는 auth.js가 만든 "로그인된" Firebase 앱(dolbomGate)의 database로 함.
     페이지 기본 db는 비로그인 연결이라 규칙을 잠그면 info를 못 읽음 — 그 점을 이용해 잠금 여부를 확인(probe).
   ■ 데이터 구조
     info/meta                          {seeded:true, at:수정시각}
     info/secs/{분류id}                  {t:이름, ic:아이콘, urgent:빨간 강조, o:순서, items:{…}}
     info/secs/{분류id}/items/{항목id}    {t:제목, o:순서, rows:[{k:종류, l:이름, v:값}]}
       k = tel 전화 · acct 계좌 · addr 주소 · link 링크 · text 메모 · steps 순서 · warn 주의
   ■ 값이 비어 있는 줄·항목·분류는 직원 화면에 안 보임 (편집 화면에서만 '미입력'으로 보임)
   ■ 코드를 고치면 scheduler.html·scheduler-gg.html의 info.js?v= 값도 같이 올릴 것 (캐시)
   ============================================================ */
(function(){
'use strict';

const IN_VER='2026.11.13a';
const GATE_APP='dolbomGate';   // auth.js가 만든 로그인된 Firebase 앱 이름
const NODE='info';
const LS_OPEN='dolbom_info_open';

const KINDS={
  tel:{n:'전화',ph:'010-0000-0000',lp:'이름'},
  acct:{n:'계좌',ph:'은행 · 계좌번호 · 예금주',lp:'항목 (예: 입금 계좌)'},
  addr:{n:'주소',ph:'주소',lp:'항목 (예: 주소)'},
  link:{n:'링크',ph:'https://',lp:'링크 이름'},
  text:{n:'메모',ph:'내용',lp:'항목 (비워도 됨)'},
  steps:{n:'순서',ph:'한 줄에 하나씩',lp:'항목 (비워도 됨)'},
  warn:{n:'주의',ph:'한 줄에 하나씩',lp:'항목 (비워도 됨)'}
};
const MULTI={text:1,steps:1,warn:1};
const ICONS=['🚨','👥','📞','💳','🏭','🚜','📜','🚗','🏢','📍','🔗','📦','🧰','📝','⚠️','📁'];

let gdb=null,subbed=false;          // 로그인된 database · 구독 여부
let D=null,loaded=false,loadErr=''; // /info 내용
let edit=false,q='';
let lock='?',lockBusy=null;         // 'open' 로그인 없이도 읽힘(규칙 없음) · 'locked' 규칙 적용됨 · '?' 확인 못 함
let seeding=false,saving=false;
let TEAM=null,teamAt=0;              // 팀설정 명단 {bs:[…],gg:[…]} — 편집 화면에서만 읽음
let REG=[];                         // 화면에 그린 값(복사·열기용) — 버튼은 번호만 들고 있음
let ctx=null,draft=null,draft0='';  // 편집 창 상태
const open=new Set();
try{JSON.parse(localStorage.getItem(LS_OPEN)||'[]').forEach(x=>open.add(String(x)))}catch(e){}

/* ---------- CSS ---------- */
const CSS=`
#infoView{padding-top:2px}
.in-top{display:flex;gap:8px;align-items:center;margin-bottom:10px}
.in-search{flex:1;min-width:0;height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:16px;font-family:var(--font);outline:none;-webkit-appearance:none;appearance:none}
.in-search::placeholder{color:var(--dim)}
.in-search:focus{border-color:var(--blue)}
.in-editbtn{flex-shrink:0;height:46px;padding:0 14px;border-radius:12px;border:none;background:var(--card2);color:var(--sub);font-size:13px;font-weight:700;font-family:var(--font);cursor:pointer;white-space:nowrap}
.in-editbtn.on{background:var(--green);color:#000}
.in-sec{background:var(--card);border-radius:16px;margin-bottom:8px;overflow:hidden;border:1px solid transparent}
.in-sec.urgent{border-color:rgba(255,69,58,.3)}
.in-sec-hd{display:flex;align-items:center;gap:10px;padding:15px 16px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.in-sec-hd:active{background:rgba(255,255,255,.03)}
.in-ic{flex-shrink:0;width:24px;text-align:center;font-size:18px;line-height:1}
.in-sec-t{flex:1;min-width:0;font-size:15px;font-weight:800;letter-spacing:-.2px;line-height:1.3;word-break:keep-all}
.in-sec.urgent .in-sec-t{color:var(--red)}
.in-chev{flex-shrink:0;color:var(--dim);font-size:11px;transition:transform .15s}
.in-sec.open .in-chev{transform:rotate(180deg)}
.in-sec-body{display:none;padding:0 10px 10px}
.in-sec.open .in-sec-body{display:block}
.in-item{background:var(--card2);border-radius:12px;padding:2px 12px;margin-top:8px}
.in-sec-body>.in-item:first-child{margin-top:0}
.in-item-hd{display:flex;align-items:center;gap:6px;padding:10px 0 2px}
.in-item-t{flex:1;min-width:0;font-size:12px;font-weight:700;color:var(--dim);word-break:keep-all}
.in-row{display:flex;align-items:center;gap:8px;padding:9px 0}
.in-row.blk{display:block}
.in-rows>.in-row+.in-row{border-top:1px solid rgba(255,255,255,.06)}
.in-main{flex:1;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
.in-l{flex:1 1 auto;min-width:0;font-size:14px;font-weight:700;color:var(--text);line-height:1.4;word-break:keep-all;overflow-wrap:anywhere}
.in-l.cap{flex:1 1 100%;font-size:12px;font-weight:600;color:var(--dim)}
.in-row.blk>.in-l.cap{display:block;margin-bottom:5px}
.in-v{min-width:0;font-size:14.5px;font-weight:500;color:var(--text);line-height:1.5;word-break:keep-all;overflow-wrap:anywhere}
.in-v.pre{white-space:pre-wrap;font-size:14px;color:var(--sub)}
.in-v.url{font-size:12px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 100%}
.in-tel{flex-shrink:0;display:inline-block;padding:7px 12px;border-radius:10px;background:rgba(90,200,250,.12);color:var(--blue);font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.in-tel:active{transform:scale(.97)}
.in-acts{flex-shrink:0;display:flex;gap:6px}
.in-chip{padding:8px 10px;border-radius:10px;border:none;background:rgba(255,255,255,.07);color:var(--sub);font-size:12px;font-weight:700;font-family:var(--font);cursor:pointer;white-space:nowrap}
.in-chip.go{background:rgba(90,200,250,.12);color:var(--blue)}
.in-chip:active{transform:scale(.96)}
.in-none{font-size:12px;color:var(--dim);font-weight:500}
.in-none.pad{padding:8px 0 10px}
.in-steps{list-style:none;margin:0;padding:0}
.in-steps li{display:flex;gap:10px;padding:5px 0;font-size:14.5px;line-height:1.55;word-break:keep-all}
.in-n{flex-shrink:0;width:23px;height:23px;border-radius:50%;background:var(--card);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:1px;color:var(--blue)}
.in-warn{padding:10px 12px;border-radius:10px;background:rgba(255,69,58,.09)}
.in-warn b{display:block;font-size:12px;font-weight:800;color:var(--red);margin-bottom:4px}
.in-warn div{font-size:13.5px;line-height:1.55;padding-left:16px;position:relative;word-break:keep-all}
.in-warn div::before{content:'✕';position:absolute;left:0;color:var(--red);font-weight:800}
.in-mini{flex-shrink:0;min-width:30px;height:30px;padding:0 8px;border-radius:8px;border:none;background:rgba(255,255,255,.08);color:var(--sub);font-size:11px;font-weight:700;font-family:var(--font);cursor:pointer}
.in-mini:disabled{opacity:.28;cursor:default}
.in-mini.del{color:var(--red)}
.in-add{display:block;width:100%;padding:13px;border-radius:14px;border:1px dashed rgba(90,200,250,.4);background:rgba(90,200,250,.06);color:var(--blue);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer;margin:8px 0 16px}
.in-add.sm{padding:10px;font-size:13px;border-radius:12px;margin:8px 0 0}
.in-hint{font-size:12px;line-height:1.5;color:var(--orange);background:rgba(255,159,10,.08);border-radius:10px;padding:9px 12px;margin-bottom:8px;word-break:keep-all}
.in-empty{text-align:center;color:var(--dim);padding:36px 0;font-size:13px;line-height:1.6}
.in-lock{background:rgba(255,159,10,.08);border:1px solid rgba(255,159,10,.32);border-radius:14px;padding:14px;margin-bottom:10px}
.in-lock>b{display:block;font-size:14px;font-weight:800;color:var(--orange);margin-bottom:6px}
.in-lock p,.in-lock li{font-size:12.5px;line-height:1.6;color:var(--sub);word-break:keep-all}
.in-lock ol{margin:8px 0 8px 18px;padding:0}
.in-lock code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11.5px;background:rgba(255,255,255,.08);padding:1px 5px;border-radius:5px;color:var(--text);white-space:nowrap}
.in-lock pre{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10.5px;line-height:1.5;background:var(--bg);color:var(--sub);padding:10px;border-radius:10px;overflow-x:auto;white-space:pre;margin:8px 0}
.in-lock-btns{display:flex;gap:6px;flex-wrap:wrap}
.in-lock-btns button{flex:1 1 auto;padding:11px 10px;border-radius:10px;border:none;font-size:12.5px;font-weight:800;font-family:var(--font);cursor:pointer;background:var(--card2);color:var(--text);white-space:nowrap}
.in-lock-btns button.pri{background:var(--orange);color:#000}
.in-ov{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);z-index:998;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;padding-top:max(16px,env(safe-area-inset-top));padding-bottom:120px;max-width:600px;margin:0 auto}
.in-ov.show{display:block}
.in-ov-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.in-ov-hd b{font-size:17px;font-weight:900}
.in-ov-hd span{font-size:18px;color:var(--dim);cursor:pointer;padding:4px 8px}
.in-f label{display:block;font-size:12px;font-weight:700;color:var(--sub);margin:16px 0 6px}
.in-f label small{font-weight:400;color:var(--dim);margin-left:4px}
.in-f input,.in-f textarea,.in-f select{width:100%;min-width:0;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:16px;font-family:var(--font);-webkit-appearance:none;appearance:none}
.in-f textarea{min-height:92px;line-height:1.5;resize:vertical;display:block}
.in-f input:focus,.in-f textarea:focus,.in-f select:focus{outline:none;border-color:var(--blue)}
.in-f select{padding-right:26px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%238e8e93' stroke-width='2'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center}
.in-er{background:var(--card);border-radius:12px;padding:8px;margin-bottom:8px}
.in-er-top{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.in-er-top select{flex:0 0 76px;width:76px;font-size:14px;font-weight:700;padding-left:10px}
.in-er-top input{flex:1}
.in-er-top .in-mini{height:42px}
.in-addrow{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.in-addrow button{padding:10px 12px;border-radius:10px;border:1px dashed rgba(90,200,250,.4);background:rgba(90,200,250,.06);color:var(--blue);font-size:13px;font-weight:800;font-family:var(--font);cursor:pointer}
.in-btn2{display:block;width:100%;margin-top:8px;padding:12px;border-radius:10px;border:none;background:var(--card2);color:var(--text);font-size:13px;font-weight:800;font-family:var(--font);cursor:pointer}
.in-icrow{display:flex;gap:8px;align-items:center}
.in-icrow input{flex:0 0 64px;width:64px;text-align:center;font-size:20px;padding:8px 4px}
.in-picks{flex:1;display:flex;flex-wrap:wrap;gap:4px}
.in-picks button{width:36px;height:36px;border-radius:9px;border:none;background:var(--card2);font-size:17px;cursor:pointer;padding:0}
.in-tog{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:10px;background:var(--card2);margin-top:16px;font-size:14px;font-weight:700;color:var(--text);cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
.in-sw{flex-shrink:0;width:44px;height:26px;border-radius:13px;background:rgba(255,255,255,.12);position:relative;transition:background .15s}
.in-sw::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s}
.in-tog.on .in-sw{background:var(--red)}
.in-tog.on .in-sw::after{transform:translateX(18px)}
.in-ovbar{position:fixed;bottom:0;left:0;right:0;max-width:600px;margin:0 auto;padding:12px 16px;padding-bottom:max(12px,env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--border);display:none;gap:8px;z-index:998}
.in-ov.show .in-ovbar{display:flex}
.in-ovbar button{flex:1;padding:14px;border-radius:12px;font-size:14px;font-weight:800;border:none;font-family:var(--font);cursor:pointer}
.in-ovbar .save{background:var(--green);color:#000;flex:2}
.in-ovbar .save:disabled{opacity:.5}
.in-ovbar .cancel{background:var(--card2);color:var(--sub)}
.in-ovbar .del{background:rgba(255,69,58,.12);color:var(--red)}
`;

/* ---------- 유틸 ---------- */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function arr(v){if(Array.isArray(v))return v.filter(x=>x!=null);if(v&&typeof v==='object')return Object.keys(v).sort((a,b)=>a-b).map(k=>v[k]).filter(x=>x!=null);return []}
function nrm(s){return String(s==null?'':s).toLowerCase().replace(/[\s\-·.,()]/g,'')}
function lines(t){return String(t||'').split('\n').map(s=>s.trim()).filter(Boolean)}
function say(msg,type){try{if(typeof toast==='function'){toast(msg,type||'ok');return}}catch(e){}try{alert(msg)}catch(e){}}
function $(id){return document.getElementById(id)}
function au(){return window.dolbomAuth||{}}
function isAdmin(){return !!au().isAdmin}
function telHref(v){const s=String(v||''),m=s.match(/\+?\d[\d\s.\-]+\d/);return 'tel:'+(m?m[0]:s).replace(/[^\d+*#]/g,'')} // 값에 메모가 섞여 있어도 첫 번호만 걸기
// 숫자·공백·하이픈·점만 있는 국내 번호는 010-1234-5678 꼴로 통일 (메모가 섞인 값은 그대로 둠)
function fmtTel(v){
  const s=String(v||'').trim();
  if(!/^[\d\s.\-]+$/.test(s))return s;
  const d=s.replace(/\D/g,''),mid=n=>d.slice(n,d.length-4),end=d.slice(-4);
  if(/^1[5-9]\d{6}$/.test(d))return d.slice(0,4)+'-'+end;
  if(/^02\d{7,8}$/.test(d))return '02-'+mid(2)+'-'+end;
  if(/^050[2-8]\d{7,8}$/.test(d))return d.slice(0,4)+'-'+mid(4)+'-'+end;
  if(/^0\d{9,10}$/.test(d))return d.slice(0,3)+'-'+mid(3)+'-'+end;
  return s;
}
function safeUrl(v){const s=String(v||'').trim();if(!s)return '';if(/^https?:\/\//i.test(s))return s;if(/^[a-z][a-z0-9+.\-]*:/i.test(s))return '';return 'https://'+s}
function copyText(t){
  const done=()=>say('복사됐어요','copy'),bad=()=>say('복사하지 못했어요','copy');
  const old=()=>{try{const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);const ok=document.execCommand('copy');document.body.removeChild(ta);ok?done():bad()}catch(e){bad()}};
  try{if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(t).then(done,old);return}}catch(e){}
  old();
}
function fail(e){
  const m=String((e&&(e.code||e.message))||'');
  say(/permission/i.test(m)?'저장 권한이 없어요 — 관리자 계정인지 확인해 주세요':'저장하지 못했어요 — 연결을 확인해 주세요','copy');
}

/* ---------- 데이터 ---------- */
const byO=(a,b)=>((a.o||0)-(b.o||0))||String(a.id).localeCompare(String(b.id));
const hasVal=r=>String(r.v||'').trim()!=='';
function cleanRow(r){r=r||{};return {k:KINDS[r.k]?r.k:'text',l:String(r.l==null?'':r.l),v:String(r.v==null?'':r.v)}}
function itemsOf(sec){
  const o=(sec&&sec.items)||{};
  return Object.keys(o).filter(k=>o[k]&&typeof o[k]==='object').map(k=>({id:k,t:String(o[k].t||''),o:+o[k].o||0,rows:arr(o[k].rows).map(cleanRow)})).sort(byO);
}
function secs(){
  const o=(D&&D.secs)||{};
  return Object.keys(o).filter(k=>o[k]&&typeof o[k]==='object').map(k=>({id:k,t:String(o[k].t||''),ic:String(o[k].ic||''),urgent:!!o[k].urgent,o:+o[k].o||0,items:itemsOf(o[k])})).sort(byO);
}
function secOf(id){return secs().find(s=>s.id===id)||null}
// 직원이 보는 그대로: 값이 있는 줄만, 줄이 하나도 없는 항목·분류는 숨김
function staffView(list){
  return list.map(s=>Object.assign({},s,{items:s.items.map(it=>Object.assign({},it,{rows:it.rows.filter(hasVal)})).filter(it=>it.rows.length)})).filter(s=>s.items.length);
}
function applyQuery(list){
  const k=nrm(q);if(!k)return list;
  const out=[];
  list.forEach(s=>{
    const secHit=nrm(s.t).includes(k),items=[];
    s.items.forEach(it=>{
      if(secHit||nrm(it.t).includes(k)){items.push(it);return}
      const rows=it.rows.filter(r=>nrm(r.l).includes(k)||nrm(r.v).includes(k));
      if(rows.length)items.push(Object.assign({},it,{rows}));
    });
    if(items.length)out.push(Object.assign({},s,{items}));
  });
  return out;
}
function nid(){return gdb.ref(NODE).push().key}
function touch(){try{gdb.ref(NODE+'/meta').update({at:Date.now()}).catch(()=>{})}catch(e){}}

/* ---------- 처음 한 번 넣는 기본 틀 (관리자가 편집을 처음 열 때) ---------- */
function seedData(bs,gg){
  const secsObj={};let so=0;
  const sec=(ic,t,urgent,items)=>{const o={};items.forEach((it,i)=>{o[nid()]={t:it.t,o:(i+1)*10,rows:it.rows}});so+=10;secsObj[nid()]={ic,t,urgent:!!urgent,o:so,items:o}};
  const r=(k,l,v)=>({k,l,v:v||''});
  const people=names=>names.length?names.map(n=>r('tel',n)):[r('tel','이름')];
  sec('🚨','교통사고 났을 때',true,[
    {t:'대응 순서',rows:[
      r('steps','',['차 세우고 비상등 — 다친 사람부터 확인 (다쳤으면 119)','뒤차 조심 — 안전한 곳으로 피하고 트렁크 열기·삼각대','사진·영상 — 차 옮기기 전 전체 모습, 파손 부위, 상대 번호판, 블랙박스','상대방 연락처·보험사 확인','보험사 사고접수 전화','관리자에게 전화로 보고','고객 방문이 늦어지면 CS에 알리기'].join('\n')),
      r('warn','하지 말 것',['현장에서 과실 인정·합의·현금 보상 약속','보험사·관리자와 통화하기 전에 각서·확인서 작성','작은 접촉이라고 보고 없이 넘어가기'].join('\n'))
    ]},
    {t:'연락할 곳',rows:[r('tel','보험사 사고접수'),r('tel','관리자'),r('tel','경찰','112'),r('tel','구급·화재','119')]}
  ]);
  sec('👥','직원 연락처',false,[
    {t:'부산 시공팀',rows:people(bs)},
    {t:'경기 시공팀',rows:people(gg)},
    {t:'사무실',rows:[r('tel','관리자'),r('tel','CS')]}
  ]);
  sec('💳','계좌번호',false,[{t:'회사 계좌',rows:[r('acct','입금 계좌')]}]);
  sec('🏭','폐기물 업체',false,[
    {t:'부산',rows:[r('addr','주소'),r('tel','전화'),r('text','운영 시간·메모')]},
    {t:'경기',rows:[r('addr','주소'),r('tel','전화'),r('text','운영 시간·메모')]}
  ]);
  sec('🚜','지게차',false,[{t:'부산',rows:[r('tel','지게차 기사님')]}]);
  sec('📜','인증서',false,[{t:'인증서·성적서',rows:[r('link','KC 인증서'),r('link','라돈 검사 성적서')]}]);
  return {meta:{seeded:true,at:Date.now()},secs:secsObj};
}
function loadTeam(){
  if(TEAM&&Date.now()-teamAt<5*60*1000)return Promise.resolve(TEAM);
  const rd=k=>{try{return db.ref(k).once('value').then(s=>arr(s.val()).filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim()),()=>[])}catch(e){return Promise.resolve([])}};
  return Promise.all([rd('employees'),rd('gg_employees')]).then(([bs,gg])=>{TEAM={bs,gg};teamAt=Date.now();return TEAM});
}
function maybeSeed(){
  if(seeding||!gdb||!loaded||loadErr)return;
  if(D&&(D.secs||(D.meta&&D.meta.seeded)))return;
  seeding=true;
  // 이름은 팀설정 명단에서 가져와 전화번호 칸만 비워 둠
  loadTeam().then(t=>gdb.ref(NODE).set(seedData(t.bs,t.gg))).catch(fail).then(()=>{seeding=false});
}
// 팀설정에는 있는데 정보 탭 전화 줄 어디에도 없는 이름 (편집 화면 안내용)
function missingNames(){
  if(!TEAM)return [];
  const labels=[];secs().forEach(s=>s.items.forEach(it=>it.rows.forEach(r=>{if(r.k==='tel')labels.push(nrm(r.l))})));
  const out=[];TEAM.bs.concat(TEAM.gg).forEach(n=>{const k=nrm(n);if(k&&out.indexOf(n)<0&&!labels.some(l=>l.includes(k)))out.push(n)});
  return out;
}

/* ---------- 잠금(보안 규칙) 확인 — 관리자만 ---------- */
function probe(){
  let p;
  try{p=db.ref(NODE+'/meta/seeded').once('value').then(()=>'open',e=>/permission/i.test(String((e&&(e.code||e.message))||''))?'locked':'?')}
  catch(e){p=Promise.resolve('?')}
  return Promise.race([p,new Promise(r=>setTimeout(()=>r('?'),8000))]);
}
function checkLock(){
  if(!isAdmin())return Promise.resolve(lock);
  if(lockBusy)return lockBusy;
  lockBusy=probe().then(r=>{lockBusy=null;lock=r;if(lock!=='locked'&&edit)edit=false;render();return r});
  return lockBusy;
}
function ruleText(){
  const em=String(au().email||'').replace(/['"\\\s]/g,'');
  return '"info": {\n'+
    '  ".read": "auth != null && ((auth.token.email === \''+em+'\' && auth.token.email_verified === true) || root.child(\'orgAuth/allow/\' + auth.uid).exists())",\n'+
    '  ".write": "auth != null && auth.token.email === \''+em+'\' && auth.token.email_verified === true"\n'+
    '},';
}
function consoleUrl(){
  try{const o=gdb.app.options;const inst=new URL(o.databaseURL).hostname.split('.')[0];return 'https://console.firebase.google.com/project/'+o.projectId+'/database/'+inst+'/rules'}
  catch(e){return 'https://console.firebase.google.com/'}
}
function renderNotice(){
  const el=$('inNotice');if(!el)return;
  if(!isAdmin()||lock!=='open'){el.innerHTML='';return}
  el.innerHTML=`<div class="in-lock">
    <b>편집을 열려면 잠금 설정이 필요해요</b>
    <p>지금은 로그인하지 않아도 주소만 알면 이 정보를 읽고 고칠 수 있는 상태예요. 아래 규칙을 넣으면 승인된 직원만 보고 관리자만 고칠 수 있어요.</p>
    <ol><li>규칙 복사</li><li>Firebase 규칙 화면 맨 위 <code>"rules": {</code> 바로 아랫줄에 붙여넣고 게시</li><li>다시 확인</li></ol>
    <pre>${esc(ruleText())}</pre>
    <div class="in-lock-btns"><button class="pri" data-act="ruleCopy">규칙 복사</button><button data-act="ruleOpen">Firebase 규칙 열기</button><button data-act="lockCheck">다시 확인</button></div>
  </div>`;
}

/* ---------- 보기 화면 ---------- */
function reg(v){return REG.push(v)-1}
function rowHtml(r){
  const K=KINDS[r.k],l=esc(r.l);
  if(!hasVal(r))return `<div class="in-row"><div class="in-main"><span class="in-l">${l||esc(K.n)}</span><span class="in-none">미입력</span></div></div>`;
  const v=r.k==='tel'?fmtTel(r.v):String(r.v).trim();
  if(r.k==='tel'){
    return `<div class="in-row"><div class="in-main">${l?`<span class="in-l">${l}</span>`:''}<a class="in-tel" href="${esc(telHref(v))}">${esc(v)}</a></div><div class="in-acts"><button class="in-chip" data-act="copy" data-i="${reg(v)}">복사</button></div></div>`;
  }
  if(r.k==='acct'){
    return `<div class="in-row"><div class="in-main">${l?`<span class="in-l cap">${l}</span>`:''}<span class="in-v">${esc(v)}</span></div><div class="in-acts"><button class="in-chip go" data-act="copy" data-i="${reg(v)}">복사</button></div></div>`;
  }
  if(r.k==='addr'){
    const i=reg(v);
    return `<div class="in-row"><div class="in-main">${l?`<span class="in-l cap">${l}</span>`:''}<span class="in-v">${esc(v)}</span></div><div class="in-acts"><button class="in-chip go" data-act="map" data-i="${i}">지도</button><button class="in-chip" data-act="copy" data-i="${i}">복사</button></div></div>`;
  }
  if(r.k==='link'){
    const u=safeUrl(v);
    if(!u)return `<div class="in-row blk">${l?`<span class="in-l cap">${l}</span>`:''}<div class="in-v pre">${esc(v)}</div></div>`;
    const i=reg(u);
    return `<div class="in-row"><div class="in-main">${l?`<span class="in-l">${l}</span>`:`<span class="in-v url">${esc(u)}</span>`}</div><div class="in-acts"><button class="in-chip go" data-act="open" data-i="${i}">열기</button><button class="in-chip" data-act="copy" data-i="${i}">복사</button></div></div>`;
  }
  if(r.k==='steps'){
    return `<div class="in-row blk">${l?`<span class="in-l cap">${l}</span>`:''}<ol class="in-steps">${lines(v).map((s,n)=>`<li><span class="in-n">${n+1}</span><span>${esc(s)}</span></li>`).join('')}</ol></div>`;
  }
  if(r.k==='warn'){
    return `<div class="in-row blk"><div class="in-warn">${l?`<b>${l}</b>`:''}${lines(v).map(s=>`<div>${esc(s)}</div>`).join('')}</div></div>`;
  }
  return `<div class="in-row blk">${l?`<span class="in-l cap">${l}</span>`:''}<div class="in-v pre">${esc(v)}</div></div>`;
}
function itemHtml(s,it,idx,n,searching){
  const sid=esc(s.id),iid=esc(it.id);
  let h='<div class="in-item">';
  if(it.t||edit){
    h+=`<div class="in-item-hd"><span class="in-item-t">${esc(it.t||'(제목 없음)')}</span>`;
    if(edit){
      if(!searching)h+=`<button class="in-mini" data-act="itemUp" data-s="${sid}" data-it="${iid}"${idx===0?' disabled':''}>▲</button><button class="in-mini" data-act="itemDown" data-s="${sid}" data-it="${iid}"${idx===n-1?' disabled':''}>▼</button>`;
      h+=`<button class="in-mini" data-act="itemEdit" data-s="${sid}" data-it="${iid}">수정</button>`;
    }
    h+='</div>';
  }
  h+=`<div class="in-rows">${it.rows.map(rowHtml).join('')}</div>`;
  if(edit&&!it.rows.length)h+='<div class="in-none pad">내용 없음</div>';
  return h+'</div>';
}
function secHtml(s,idx,n,searching){
  const sid=esc(s.id),isOpen=searching||open.has(s.id);
  let h=`<div class="in-sec${s.urgent?' urgent':''}${isOpen?' open':''}"><div class="in-sec-hd" data-act="tog" data-s="${sid}"><span class="in-ic">${esc(s.ic||'📁')}</span><span class="in-sec-t">${esc(s.t||'(이름 없음)')}</span>`;
  if(edit){
    if(!searching)h+=`<button class="in-mini" data-act="secUp" data-s="${sid}"${idx===0?' disabled':''}>▲</button><button class="in-mini" data-act="secDown" data-s="${sid}"${idx===n-1?' disabled':''}>▼</button>`;
    h+=`<button class="in-mini" data-act="secEdit" data-s="${sid}">수정</button>`;
  }
  h+='<span class="in-chev">▼</span></div><div class="in-sec-body">';
  s.items.forEach((it,i)=>{h+=itemHtml(s,it,i,s.items.length,searching)});
  if(edit&&!searching)h+=`<button class="in-add sm" data-act="itemNew" data-s="${sid}">＋ 항목 추가</button>`;
  return h+'</div></div>';
}
function render(){
  const body=$('inBody');if(!body)return;
  const eb=$('inEditBtn');
  if(eb){eb.style.display=isAdmin()?'':'none';eb.classList.toggle('on',edit);eb.textContent=edit?'편집 끝':'편집'}
  renderNotice();
  REG=[];
  if(loadErr){body.innerHTML=`<div class="in-empty">${esc(loadErr)}</div>`;return}
  if(!loaded){body.innerHTML='<div class="in-empty">불러오는 중…</div>';return}
  const searching=!!nrm(q);
  const list=applyQuery(edit?secs():staffView(secs()));
  let h='';
  if(edit&&!searching&&secs().length){const miss=missingNames();if(miss.length)h+=`<div class="in-hint">팀설정 명단 중 연락처에 없는 이름 · ${esc(miss.join(', '))}</div>`}
  if(!list.length&&!(edit&&!searching))h+=`<div class="in-empty">${searching?'검색 결과가 없어요':'등록된 정보가 없어요'+(isAdmin()&&lock==='locked'&&!secs().length?'<br>편집을 누르면 기본 분류가 만들어져요':'')}</div>`;
  list.forEach((s,i)=>{h+=secHtml(s,i,list.length,searching)});
  if(edit&&!searching)h+='<button class="in-add" data-act="secNew">＋ 분류 추가</button>';
  body.innerHTML=h;
}

/* ---------- 편집 창 ---------- */
function ovOpen(title){$('inOvTitle').textContent=title;$('inOv').classList.add('show');$('inOv').scrollTop=0}
function ovClose(force){
  if(!force&&draft){syncDraft();if(JSON.stringify(draft)!==draft0&&!confirm('저장하지 않고 닫을까요?'))return}
  $('inOv').classList.remove('show');ctx=null;draft=null;draft0='';saving=false;
}
function ovBar(isNew){
  $('inOvBar').innerHTML=(isNew?'':'<button class="del" data-act="ovDel">삭제</button>')+'<button class="cancel" data-act="ovClose">취소</button><button class="save" data-act="ovSave">저장</button>';
}
function setSaving(on){saving=on;const b=document.querySelector('#inOvBar .save');if(b){b.disabled=on;b.textContent=on?'저장 중…':'저장'}}

function openSec(id){
  const s=id?secOf(id):null;if(id&&!s)return;
  ctx={type:'sec',sid:id||''};
  draft={t:s?s.t:'',ic:s?(s.ic||'📁'):'📁',urgent:s?!!s.urgent:false};
  $('inForm').innerHTML=`<label>분류 이름</label><input id="inFT" type="text" maxlength="30" autocomplete="off" placeholder="예) 직원 연락처" value="${esc(draft.t)}">
    <label>아이콘</label><div class="in-icrow"><input id="inFIc" type="text" maxlength="8" autocomplete="off" value="${esc(draft.ic)}"><div class="in-picks">${ICONS.map(x=>`<button type="button" data-act="icPick" data-ic="${x}">${x}</button>`).join('')}</div></div>
    <div class="in-tog${draft.urgent?' on':''}" id="inFUrg" data-act="urgTog"><span>빨간색으로 강조</span><span class="in-sw"></span></div>`;
  ovBar(!id);draft0=JSON.stringify(draft);ovOpen(id?'분류 수정':'분류 추가');
  if(!id)setTimeout(()=>{try{$('inFT').focus()}catch(e){}},50);
}
function erHtml(r,i,n){
  const K=KINDS[r.k];
  const opts=Object.keys(KINDS).map(k=>`<option value="${k}"${k===r.k?' selected':''}>${KINDS[k].n}</option>`).join('');
  const val=MULTI[r.k]
    ?`<textarea data-f="v" placeholder="${esc(K.ph)}">${esc(r.v)}</textarea>`
    :`<input data-f="v" ${r.k==='tel'?'type="tel" inputmode="tel"':r.k==='link'?'type="url" inputmode="url"':'type="text"'} autocomplete="off" autocapitalize="off" placeholder="${esc(K.ph)}" value="${esc(r.v)}">`;
  return `<div class="in-er" data-ri="${i}"><div class="in-er-top"><select data-f="k">${opts}</select><input data-f="l" type="text" autocomplete="off" placeholder="${esc(K.lp)}" value="${esc(r.l)}"><button type="button" class="in-mini" data-act="rowUp" data-ri="${i}"${i===0?' disabled':''}>▲</button><button type="button" class="in-mini" data-act="rowDown" data-ri="${i}"${i===n-1?' disabled':''}>▼</button><button type="button" class="in-mini del" data-act="rowDel" data-ri="${i}">✕</button></div>${val}</div>`;
}
function renderRows(){const el=$('inRows');if(el)el.innerHTML=draft.rows.map((r,i)=>erHtml(r,i,draft.rows.length)).join('')}
function openItem(sid,iid){
  const s=secOf(sid);if(!s)return;
  const it=iid?s.items.find(x=>x.id===iid):null;if(iid&&!it)return;
  ctx={type:'item',sid,iid:iid||'',o:it?it.o:0};
  draft={t:it?it.t:'',rows:it?it.rows.map(r=>({k:r.k,l:r.l,v:r.v})):[],paste:''};
  $('inForm').innerHTML=`<label>제목</label><input id="inFT" type="text" maxlength="40" autocomplete="off" placeholder="예) 부산 시공팀" value="${esc(draft.t)}">
    <label>내용</label><div id="inRows"></div>
    <div class="in-addrow">${Object.keys(KINDS).map(k=>`<button type="button" data-act="rowAdd" data-k="${k}">＋ ${KINDS[k].n}</button>`).join('')}</div>
    <label>전화번호 여러 줄 붙여넣기 <small>한 줄에 한 명</small></label><textarea id="inPaste" placeholder="홍길동 010-1234-5678&#10;김철수 010-2345-6789"></textarea>
    <button type="button" class="in-btn2" data-act="pasteAdd">붙여넣은 줄 추가</button>`;
  renderRows();ovBar(!iid);draft0=JSON.stringify(draft);
  ovOpen((iid?'항목 수정':'항목 추가')+' · '+(s.t||''));
  if(!iid)setTimeout(()=>{try{$('inFT').focus()}catch(e){}},50);
}
function syncDraft(){
  if(!draft||!ctx)return;
  const g=id=>{const el=$(id);return el?el.value:''};
  draft.t=g('inFT');
  if(ctx.type==='sec'){draft.ic=g('inFIc');return}
  document.querySelectorAll('#inRows .in-er').forEach(el=>{
    const r=draft.rows[+el.getAttribute('data-ri')];if(!r)return;
    r.k=el.querySelector('[data-f="k"]').value;r.l=el.querySelector('[data-f="l"]').value;r.v=el.querySelector('[data-f="v"]').value;
  });
  draft.paste=g('inPaste');
}
// "홍길동 010-1234-5678" → 전화 줄, 주소(https://…)가 있으면 링크 줄, 번호가 없으면 이름만 있는 전화 줄
function parsePaste(txt){
  const tidy=s=>String(s||'').replace(/[\t|]+/g,' ').replace(/^[\s:·,\-\/]+|[\s:·,\-\/]+$/g,'').replace(/\s{2,}/g,' ');
  return lines(txt).map(line=>{
    let m=line.match(/https?:\/\/\S+/i);
    if(m)return {k:'link',l:tidy(line.replace(m[0],' ')),v:m[0]};
    m=line.match(/(?:\+82[\s.\-]?\d{1,2}|0\d{1,2})[\s.\-)]?\d{3,4}[\s.\-]?\d{4}|1[5-9]\d{2}[\s.\-]?\d{4}/);
    if(m)return {k:'tel',l:tidy(line.replace(m[0],' ')),v:m[0].trim()};
    return {k:'tel',l:tidy(line),v:''};
  });
}
function fixVal(k,v){
  v=String(v||'').replace(/\r/g,'').trim();
  if(k==='link'&&v){const u=safeUrl(v);if(u)v=u}
  if(k==='tel')v=fmtTel(v);
  if(!MULTI[k])v=v.replace(/\n+/g,' ');
  return v;
}
function saveOv(){
  if(saving||!ctx||!gdb)return;
  syncDraft();
  const t=String(draft.t||'').trim();
  let p;
  if(ctx.type==='sec'){
    if(!t){say('분류 이름을 입력해 주세요','copy');return}
    const ic=String(draft.ic||'').trim()||'📁';
    if(ctx.sid)p=gdb.ref(NODE+'/secs/'+ctx.sid).update({t,ic,urgent:!!draft.urgent});
    else{const id=nid(),all=secs();open.add(id);saveOpen();p=gdb.ref(NODE+'/secs/'+id).set({t,ic,urgent:!!draft.urgent,o:(all.length?all[all.length-1].o:0)+10})}
  }else{
    const rows=draft.rows.map(r=>({k:KINDS[r.k]?r.k:'text',l:String(r.l||'').trim(),v:fixVal(r.k,r.v)})).filter(r=>r.l||r.v);
    if(!t&&!rows.length){say('내용을 입력해 주세요','copy');return}
    const s=secOf(ctx.sid);if(!s){say('분류가 없어졌어요 — 닫고 다시 시도해 주세요','copy');return}
    const id=ctx.iid||nid();
    const o=ctx.iid?ctx.o:(s.items.length?s.items[s.items.length-1].o:0)+10;
    p=gdb.ref(NODE+'/secs/'+ctx.sid+'/items/'+id).set({t,o,rows});
  }
  setSaving(true);
  p.then(()=>{touch();ovClose(true);say('저장됐어요','ok')}).catch(e=>{setSaving(false);fail(e)});
}
function delOv(){
  if(saving||!ctx||!gdb)return;
  let p;
  if(ctx.type==='sec'){
    const s=secOf(ctx.sid);if(!s)return;
    if(!confirm('"'+(s.t||'이 분류')+'" 분류와 안의 내용을 모두 삭제할까요?'))return;
    p=gdb.ref(NODE+'/secs/'+ctx.sid).remove();
  }else{
    if(!ctx.iid)return;
    if(!confirm('이 항목을 삭제할까요?'))return;
    p=gdb.ref(NODE+'/secs/'+ctx.sid+'/items/'+ctx.iid).remove();
  }
  setSaving(true);
  p.then(()=>{touch();ovClose(true);say('삭제됐어요','ok')}).catch(e=>{setSaving(false);fail(e)});
}
function reorder(path,list,id,dir){
  const i=list.findIndex(x=>x.id===id),j=i+dir;
  if(i<0||j<0||j>=list.length||!gdb)return;
  const a=list.slice(),t=a[i];a[i]=a[j];a[j]=t;
  const up={};a.forEach((x,n)=>{up[x.id+'/o']=(n+1)*10});
  gdb.ref(path).update(up).then(touch).catch(fail);
}
function saveOpen(){try{localStorage.setItem(LS_OPEN,JSON.stringify(Array.from(open).slice(-40)))}catch(e){}}

/* ---------- 조작 ---------- */
function toggleEdit(){
  if(!isAdmin())return;
  if(edit){edit=false;render();return}
  checkLock().then(r=>{
    if(r==='locked'){edit=true;maybeSeed();render();loadTeam().then(()=>{if(edit)render()})}
    else if(r==='open')say('잠금 설정이 먼저 필요해요','copy');
    else say('잠금 상태를 확인하지 못했어요 — 다시 눌러 주세요','copy');
  });
}
function onClick(e){
  const el=e.target.closest('[data-act]');if(!el)return;
  const act=el.getAttribute('data-act'),sid=el.getAttribute('data-s')||'',iid=el.getAttribute('data-it')||'';
  const val=()=>{const v=REG[+el.getAttribute('data-i')];return v==null?'':String(v)};
  if(act!=='tog')e.stopPropagation();
  switch(act){
    case 'tog':if(nrm(q))return;if(open.has(sid))open.delete(sid);else open.add(sid);saveOpen();render();break;
    case 'copy':{const v=val();if(v)copyText(v);break}
    case 'map':{const v=val();if(v)window.open('https://map.naver.com/p/search/'+encodeURIComponent(v),'_blank','noopener');break}
    case 'open':{const u=safeUrl(val());if(u)window.open(u,'_blank','noopener');break}
    case 'editTog':toggleEdit();break;
    case 'ruleCopy':copyText(ruleText());break;
    case 'ruleOpen':window.open(consoleUrl(),'_blank','noopener');break;
    case 'lockCheck':checkLock().then(r=>say(r==='locked'?'잠금 확인됐어요 — 편집을 눌러 주세요':r==='open'?'아직 규칙이 적용되지 않았어요':'확인하지 못했어요 — 잠시 뒤 다시 눌러 주세요',r==='locked'?'ok':'copy'));break;
    case 'secNew':if(edit)openSec('');break;
    case 'secEdit':if(edit)openSec(sid);break;
    case 'secUp':case 'secDown':if(edit)reorder(NODE+'/secs',secs(),sid,act==='secUp'?-1:1);break;
    case 'itemNew':if(edit)openItem(sid,'');break;
    case 'itemEdit':if(edit)openItem(sid,iid);break;
    case 'itemUp':case 'itemDown':{const s=secOf(sid);if(edit&&s)reorder(NODE+'/secs/'+sid+'/items',s.items,iid,act==='itemUp'?-1:1);break}
  }
}
function onOvClick(e){
  const el=e.target.closest('[data-act]');if(!el||!ctx)return;
  const act=el.getAttribute('data-act'),ri=+el.getAttribute('data-ri');
  switch(act){
    case 'ovClose':ovClose(false);break;
    case 'ovSave':saveOv();break;
    case 'ovDel':delOv();break;
    case 'icPick':{const i=$('inFIc');if(i)i.value=el.getAttribute('data-ic')||'';break}
    case 'urgTog':draft.urgent=!draft.urgent;el.classList.toggle('on',draft.urgent);break;
    case 'rowAdd':{syncDraft();draft.rows.push({k:el.getAttribute('data-k'),l:'',v:''});renderRows();const er=document.querySelector('#inRows .in-er:last-child');if(er){const f=er.querySelector('[data-f="l"]');try{f.focus();er.scrollIntoView({block:'center'})}catch(x){}}break}
    case 'rowDel':syncDraft();draft.rows.splice(ri,1);renderRows();break;
    case 'rowUp':case 'rowDown':{syncDraft();const j=ri+(act==='rowUp'?-1:1);if(j<0||j>=draft.rows.length)break;const t=draft.rows[ri];draft.rows[ri]=draft.rows[j];draft.rows[j]=t;renderRows();break}
    case 'pasteAdd':{syncDraft();const add=parsePaste(draft.paste);if(!add.length){say('붙여넣은 내용이 없어요','copy');break}draft.rows=draft.rows.filter(r=>String(r.l).trim()||String(r.v).trim()).concat(add);draft.paste='';const pe=$('inPaste');if(pe)pe.value='';renderRows();say(add.length+'줄 추가됐어요 — 저장을 눌러야 반영돼요','ok');break}
  }
}
function onOvChange(e){
  const t=e.target;
  if(t&&t.getAttribute&&t.getAttribute('data-f')==='k'&&draft&&ctx&&ctx.type==='item'){syncDraft();renderRows()} // 종류를 바꾸면 입력칸 모양(한 줄/여러 줄)도 바뀜
}

/* ---------- 껍데기 · 탭 전환 ---------- */
function keepLast(){const nav=document.querySelector('.nav'),b=$('inNavBtn');if(nav&&b&&nav.lastElementChild!==b)nav.appendChild(b)} // 정보 탭은 항상 맨 끝
function ensureShell(){
  if($('p-info'))return;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  const pane=document.createElement('div');pane.className='pane';pane.id='p-info';
  pane.innerHTML=`<div id="infoView">
    <div class="in-top"><input class="in-search" id="inSearch" type="search" placeholder="검색 · 이름, 업체, 번호" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="search"><button type="button" class="in-editbtn" id="inEditBtn" data-act="editTog" style="display:none">편집</button></div>
    <div id="inNotice"></div>
    <div id="inBody"></div>
  </div>`;
  const panes=document.querySelectorAll('.pane');const last=panes[panes.length-1];
  if(last&&last.parentNode)last.parentNode.insertBefore(pane,last.nextSibling);else document.body.appendChild(pane);
  pane.addEventListener('click',onClick);
  pane.querySelector('#inSearch').addEventListener('input',e=>{q=e.target.value||'';render()});
  const nav=document.querySelector('.nav');
  if(nav){const a=document.createElement('a');a.href='#';a.id='inNavBtn';a.innerHTML='<span>ℹ️</span>정보';a.addEventListener('click',e=>{e.preventDefault();infoShow()});nav.appendChild(a)}
  const ov=document.createElement('div');ov.className='in-ov';ov.id='inOv';
  ov.innerHTML='<div class="in-ov-hd"><b id="inOvTitle"></b><span data-act="ovClose">✕</span></div><div class="in-f" id="inForm"></div><div class="in-ovbar" id="inOvBar"></div>';
  document.body.appendChild(ov);
  ov.addEventListener('click',onOvClick);
  ov.addEventListener('change',onOvChange);
}
function subscribe(){
  if(subbed||!gdb)return;
  subbed=true;loadErr='';
  gdb.ref(NODE).on('value',snap=>{D=snap.val()||{};loaded=true;loadErr='';if(edit)maybeSeed();render()},()=>{subbed=false;loaded=true;D=null;edit=false;loadErr='정보를 불러올 권한이 없어요';render()});
}
function infoShow(){
  ensureShell();
  try{currentTab='info'}catch(e){}
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('on'));
  $('p-info').classList.add('on');
  const b=$('inNavBtn');if(b)b.classList.add('on');
  if(gdb&&!subbed)subscribe();
  render();
  try{window.scrollTo(0,0)}catch(e){}
  if(isAdmin()&&gdb)checkLock();
}

/* ---------- 시작 ---------- */
function start(){
  try{gdb=window.firebase.database(window.firebase.app(GATE_APP))}catch(e){gdb=null}
  if(!gdb){loaded=true;loadErr='정보를 불러오지 못했어요 — 새로고침해 주세요';render();return}
  subscribe();render();
  if(isAdmin())checkLock();
}
function init(){
  ensureShell();render();
  setTimeout(keepLast,0);setTimeout(keepLast,1500);
  const a=window.dolbomAuth;
  if(a&&a.ready&&typeof a.ready.then==='function')a.ready.then(start);
  else{loaded=true;loadErr='로그인 후 볼 수 있어요';render()}
  if(location.hash==='#info')infoShow();
}
document.addEventListener('dolbom-auth',()=>{try{if(!isAdmin())edit=false;render()}catch(e){}});
window.infoShow=infoShow;
window.__info={ver:IN_VER};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
