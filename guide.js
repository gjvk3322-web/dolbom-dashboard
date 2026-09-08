/* ============================================================
   guide.js — 현장 대응 프로세스 탭
   scheduler.html · scheduler-gg.html 공용 (둘 다 이 파일 하나를 불러옴)
   - 내용은 Firebase /guide 에 저장 → 두 지역 스케줄러가 같은 내용을 봄
   - 수정은 GUIDE_PIN 입력 후에만 가능 (관리자 전용)
   - Firebase에 아직 아무것도 없으면 아래 기본 내용(SEED)을 화면에 보여주고,
     관리자가 처음 잠금을 풀 때 SEED를 Firebase에 옮겨 적음
   ============================================================ */
(function(){
'use strict';

const GUIDE_PIN='0908';          // ← 관리자 수정 PIN. 바꿔서 쓰기
const EDIT_TTL=12*60*60*1000;    // 잠금 해제 유지 시간 (12시간)
const REGION=/gg/.test(location.pathname)?'경기':'부산';

/* ---------- 기본 내용 (Firebase 비어 있을 때 사용, 관리자 첫 잠금 해제 시 저장됨) ---------- */
const SEED_RULES={
  phone:'',
  principles:[
    {t:'멈춘다',d:'피해 커질 것 같으면 작업 중단'},
    {t:'남긴다',d:'전체·근접 사진과 영상'},
    {t:'알린다',d:'고객·본사에 사실대로'},
    {t:'승인받는다',d:'보상·재시공·면제는 본사 승인'},
    {t:'처리한다',d:'본사 지시대로 조치·재방문'},
    {t:'기록한다',d:'결과와 고객 안내 내용 보고'}
  ],
  forbidden:[
    '무료 재시공 확정','제품 전체 교환 약속','추가금 면제','현금·물품 보상 약속',
    '환불 약속','회사 책임 인정','작업 철수 확정','법적 책임에 관한 답변'
  ]
};

const SEED_ITEMS=[
  {title:'벽지 손상',cat:'기존 바닥·시설',urgent:false,
   steps:['작업 멈추고 손상 부위 근접 + 전체 사진 촬영',
          '고객에게 바로 알리기 — 숨기거나 나중에 말하지 않기',
          '고객에게 관리사무소 번호 물어보기',
          '관리사무소에 연락해 상황 설명, 같은 벽지 여분 있는지 확인 (있으면 손상된 벽지 조각 가지고 가서 받아오기)',
          '고객에게 "이렇게 처리하려는데 괜찮을까요?" 물어보고 동의 받기',
          '보수 후 사진 촬영, 보고 서식으로 보고 (관리실에 벽지 없으면 본사에서 처리 방법 결정)'],
   dont:['보상·할인·재시공을 현장에서 약속하지 않기 — 본사 확인 후 안내','손상을 알리지 않고 마무리하지 않기 (나중에 발견되면 훨씬 커짐)'],
   tpl:'[현장보고] 벽지 손상\n현장: {현장}\n팀: {팀}\n손상 위치/크기: \n원인: \n고객 안내: 완료 / 고객 반응: \n관리실 벽지 여분: 있음 · 없음\n처리: \n사진: 근접·전체 첨부'},

  {title:'가구·가전·물건 파손',cat:'기존 바닥·시설',urgent:false,
   steps:['작업 멈추고 파손 부위 근접 + 전체 사진 촬영 (옮기거나 치우기 전에)',
          '고객에게 바로 사실대로 알리기',
          '무엇이 어떻게 파손됐는지, 고객이 원하는 처리(수리·교체·보상)를 확인만 하기',
          '본사에 바로 전화 — 보상 여부·금액은 본사가 고객과 협의',
          '남은 작업은 고객 동의 하에 마무리, 보고 서식으로 보고'],
   dont:['"제가 물어드리겠다"·"교체해 드리겠다" 식 확답 금지','파손된 물건을 임의로 버리거나 옮기지 않기 (사진·증거 보존)'],
   tpl:'[현장보고] 가구·물건 파손\n현장: {현장}\n팀: {팀}\n파손 물건: \n상황(어떻게): \n고객 요구: \n고객 안내: 완료\n사진: 첨부'},

  {title:'평수·장수 불일치',cat:'고객',urgent:false,
   steps:['시공 시작 전 실측으로 필요 장수 확인',
          '예약 장수와 차이 나면 시공 전에 고객에게 안내 — 최종 금액은 실제 시공 수량 기준이라고 설명',
          '추가금 동의하면 진행, 부담스러워하면 시공 범위를 어디까지 할지 고객과 합의',
          '차이가 크거나 고객이 이의 제기하면 시공 전에 본사(CS) 연락',
          '시공보고서에 실제 수량 정확히 입력'],
   dont:['추가금 면제·할인 임의 약속 금지','안내 없이 깔고 나서 청구하지 않기'],
   tpl:'[현장보고] 평수·장수 불일치\n현장: {현장}\n팀: {팀}\n예약 장수: → 실측 장수: (차이: 장)\n고객 안내: 완료\n추가금: 동의 · 거부 · 범위 조정\n요청: '},

  {title:'추가 시공 요청',cat:'고객',urgent:false,
   steps:['추가 범위 실측 → 추가 장수와 차량 자재 확인',
          '추가 금액 안내하고 동의 받기 (동의 전에 시공 시작하지 않기)',
          '자재 부족하면 오늘 가능한 범위·재방문 여부를 본사와 결정',
          '시공보고서 수량에 반영'],
   dont:['무료 추가·서비스 시공 약속 금지'],
   tpl:'[현장보고] 추가 시공 요청\n현장: {현장}\n팀: {팀}\n추가 범위: \n추가 장수: \n고객 동의: \n자재: 충분 · 부족( 장)\n요청: '},

  {title:'고객 부재·연락 두절',cat:'고객',urgent:false,
   steps:['도착 후 전화 2회 + 문자 남기기',
          '연락 안 되면 바로 본사(CS)에 알리기 — CS가 다른 번호·경로로 연락',
          '대기할지, 다음 현장으로 이동할지는 본사와 결정',
          '철수 시 현관 앞 사진 + 시간 남기고 보고'],
   dont:['본사 확인 없이 임의 철수 금지'],
   tpl:'[현장보고] 고객 부재\n현장: {현장}\n팀: {팀}\n도착 시간: \n연락 시도: 전화 회 · 문자\n현재: 대기 중 · 철수\n요청: 고객 연락'},

  {title:'시공 결과 불만·클레임',cat:'고객',urgent:false,
   steps:['끝까지 듣고 불만 부위 사진 촬영',
          '현장에서 바로 고칠 수 있는 것(들뜸·마감·청소)은 즉시 수정',
          '바로 안 되는 건 "본사에서 확인 후 연락드리겠다"고 안내',
          '고객이 요구하는 내용을 그대로 보고 서식에 적어 보고'],
   dont:['재시공·환불·보상·회사 책임 인정 확답 금지','고객과 언쟁하지 않기'],
   tpl:'[현장보고] 고객 클레임\n현장: {현장}\n팀: {팀}\n불만 내용: \n현장 조치: \n고객 요구: \n후속: 본사 연락 필요\n사진: 첨부'},

  {title:'결제 문제',cat:'고객',urgent:false,
   steps:['단말기 오류 → 재시도, 계속 안 되면 본사에 연락해 대안(계좌이체 등) 안내 받기',
          '온누리는 현장 단말기 결제만 — 카드번호를 카톡·구두로 받지 않기',
          '추가금 거부·할인 요구는 본사로 연결',
          '시공보고서에 결제금액·미결제금액 정확히 입력'],
   dont:['추가금 면제·할인 임의 결정 금지'],
   tpl:'[현장보고] 결제 문제\n현장: {현장}\n팀: {팀}\n상황: 단말기 오류 · 추가금 거부 · 기타\n청구 금액: \n결제된 금액: \n고객 입장: \n요청: '},

  {title:'자재 부족·색상/두께 혼입',cat:'제품·자재',urgent:false,
   steps:['박스 열기 전 제품·색상·두께를 예약 내용과 대조',
          '다른 제품이면 시공 시작 전 본사 연락 (깔고 나서 발견하면 재시공)',
          '수량 부족 → 필요 장수·부족 장수 파악, 창고 왕복 또는 재방문은 본사와 결정',
          '고객에게 상황과 예상 시간 안내',
          '보고 서식에 품목·장수 정확히 (재고 기록 수정용)'],
   dont:['다른 색상·두께를 섞어 깔지 않기'],
   tpl:'[현장보고] 자재 부족·혼입\n현장: {현장}\n팀: {팀}\n예약 제품: \n실린 제품: \n부족 장수: \n처리: 창고 왕복 · 재방문 · 범위 조정\n고객 안내: '},

  {title:'제품 하자 발견',cat:'제품·자재',urgent:false,
   steps:['하자 매트는 깔지 말고 따로 빼두기',
          '하자 부위 근접 사진 + 박스 라벨 사진',
          '여분으로 대체 가능하면 진행, 부족하면 본사 연락',
          '하자 장수·증상 보고 (교환·재고 처리)',
          '하자품은 차량에 실어 창고 반납'],
   dont:[],
   tpl:'[현장보고] 제품 하자\n현장: {현장}\n팀: {팀}\n제품: \n하자 장수: \n증상: 줄무늬 · 구멍 · 빈 공간 · 눌림 · 오염 · 기타\n대체: 여분 사용 · 부족\n사진: 첨부'},

  {title:'검수 중 시공 불량 발견',cat:'시공 품질',urgent:false,
   steps:['마무리 전 전체 검수 (들뜸·단차·칼자국·마감·청소·가구 원위치)',
          '현장에서 고칠 수 있으면 즉시 수정',
          '수정 불가(매트 교체 필요)하면 사진 찍고 고객에게 솔직히 안내, 본사에 AS 방향 요청',
          '고객과 함께 최종 확인 후 마무리'],
   dont:['고객이 못 봤다고 넘어가지 않기 (나중에 시공하자 AS로 돌아옴)'],
   tpl:'[현장보고] 시공 불량\n현장: {현장}\n팀: {팀}\n불량 내용: \n현장 수정: 완료 · 불가\n필요 조치: 매트 교체 장 · 재방문\n고객 안내: '},

  {title:'기존 바닥 상태 문제',cat:'기존 바닥·시설',urgent:false,
   steps:['시공 전 기존 바닥 상태 전체 사진 (변색·찍힘·습기 — 나중에 우리 책임으로 오해받지 않게)',
          '문제 부위는 고객에게 직접 보여주고 사진 찍어 두기',
          '습기·곰팡이·공사 중이라 시공이 어려우면 본사 연락 후 결정 (그대로 깔면 AS 위험)',
          '가구 미이동: 이동 범위 고객과 합의, 무거운 가구는 무리하지 않기',
          '고객 동의 내용을 보고 서식에 기록'],
   dont:[],
   tpl:'[현장보고] 기존 바닥 상태\n현장: {현장}\n팀: {팀}\n상태: 습기 · 곰팡이 · 변색 · 찍힘 · 공사 중 · 가구 미이동\n고객 확인: 완료 (사진 있음)\n시공: 진행 · 보류\n요청: '},

  {title:'지연 도착·앞 현장 지연',cat:'일정·이동',urgent:false,
   steps:['늦어질 것 같으면 출발 전·이동 중에 예상 도착 시간 먼저 파악',
          '본사(CS)에 알려서 다음 고객에게 안내하게 하기, 직접도 연락',
          '앞 현장이 길어졌으면 원인(추가 시공·문제 발생)도 같이 보고'],
   dont:[],
   tpl:'[현장보고] 지연 도착\n현장: {현장}\n팀: {팀}\n예정: → 예상 도착: \n사유: \n요청: 다음 고객 안내'},

  {title:'차량 사고·고장',cat:'일정·이동',urgent:true,
   steps:['안전 확보(비상등·갓길·삼각대), 부상 확인',
          '사고면 보험사 접수 + 현장 사진 + 상대방 연락처',
          '본사에 즉시 전화 → 일정 재배치·대체 차량',
          '다음 현장 고객 안내는 CS가 처리'],
   dont:[],
   tpl:'[긴급] 차량 사고·고장\n현장: {현장}\n팀: {팀}\n위치: \n상황: \n부상: 없음 · 있음\n차량 운행: 가능 · 불가\n요청: '},

  {title:'작업자 부상',cat:'안전·민원',urgent:true,
   steps:['즉시 작업 중단, 응급 처치 — 심하면 119',
          '본사에 바로 전화',
          '고객에게 상황 안내, 남은 작업·일정은 본사가 조정',
          '병원 진료 시 진단서·영수증 보관'],
   dont:[],
   tpl:'[긴급] 작업자 부상\n현장: {현장}\n팀: {팀}\n누가: \n부상 내용: \n조치: 응급처치 · 병원 · 119\n작업: 중단 · 계속 가능'},

  {title:'폭언·위협',cat:'안전·민원',urgent:true,
   steps:['맞대응하지 말고 거리 두기, 작업 중단',
          '안전 확보 후 즉시 본사 전화',
          '위험하면 본사와 통화하며 현장 철수',
          '시간·발언 내용 메모, 가능하면 녹음'],
   dont:[],
   tpl:'[긴급] 폭언·위협\n현장: {현장}\n팀: {팀}\n상황: \n현재: 대기 · 철수\n요청: 본사 개입'},

  {title:'주차·소음·관리사무소 민원',cat:'안전·민원',urgent:false,
   steps:['정중히 사과하고 요구사항 확인 (차량 이동·작업 시간 제한 등)',
          '차량 이동 요청은 즉시 이동',
          '작업 자체가 제한되면 본사 연락 후 일정 조정'],
   dont:[],
   tpl:'[현장보고] 민원\n현장: {현장}\n팀: {팀}\n민원 주체: 관리사무소 · 이웃 · 경비\n내용: \n조치: \n작업 영향: 없음 · 있음'}
];

/* ---------- 상태 ---------- */
let GD={};                 // Firebase /guide 전체
let gOpen=new Set();       // 펼친 카드 id
let gQuery='';             // 검색어
let gChip='전체';          // 선택된 분류
let gEdit=false;           // 수정 모드
let gForbidOpen=false;     // 금지 목록 펼침
let gSelJob={};            // {itemId: jobId}
let gEditing=null;         // 편집 중인 항목 id ('rules' 또는 item id 또는 'new')
let gChipList=['전체'];    // 현재 분류 칩 목록
let seedRequested=false;   // 기본 내용 저장 요청 여부

/* ---------- CSS ---------- */
const CSS=`
.g-top{display:flex;align-items:center;justify-content:space-between;margin:4px 0 10px}
.g-title{font-size:16px;font-weight:900;letter-spacing:-.3px}
.g-lock{padding:6px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;border:none;font-family:var(--font);background:var(--card2);color:var(--dim)}
.g-lock.on{background:rgba(48,209,88,.2);color:var(--green);border:1px solid rgba(48,209,88,.3)}
.g-editbar{background:rgba(48,209,88,.1);border:1px solid rgba(48,209,88,.2);border-radius:10px;padding:8px 12px;font-size:12px;color:var(--green);font-weight:600;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.g-search{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:14px;font-family:var(--font);margin-bottom:10px;-webkit-appearance:none}
.g-search:focus{outline:none;border-color:var(--blue)}
.g-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:8px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.g-chips::-webkit-scrollbar{display:none}
.g-chip{flex-shrink:0;padding:7px 12px;border-radius:20px;font-size:12px;font-weight:700;background:var(--card2);color:var(--sub);cursor:pointer;border:1px solid transparent;-webkit-tap-highlight-color:transparent}
.g-chip.on{background:rgba(90,200,250,.15);color:var(--blue);border-color:rgba(90,200,250,.3)}
.g-rules{background:var(--card);border-radius:16px;padding:14px 16px;margin-bottom:12px}
.g-rules-t{font-size:12px;font-weight:700;color:var(--sub);margin-bottom:10px}
.g-rules-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.g-rule{background:var(--card2);border-radius:10px;padding:10px 6px;text-align:center}
.g-rule b{display:block;font-size:14px;font-weight:800;letter-spacing:-.3px}
.g-rule span{display:block;font-size:10.5px;color:var(--sub);line-height:1.35;margin-top:4px;word-break:keep-all}
.g-forbid{margin-top:10px;border-radius:12px;background:rgba(255,69,58,.08);border:1px solid rgba(255,69,58,.15);overflow:hidden}
.g-forbid-hd{padding:10px 12px;font-size:13px;font-weight:700;color:var(--red);display:flex;justify-content:space-between;align-items:center;cursor:pointer;-webkit-tap-highlight-color:transparent}
.g-forbid-hd small{font-weight:500;opacity:.8}
.g-forbid ul{list-style:none;padding:0 12px 10px;margin:0}
.g-forbid li{font-size:13px;line-height:1.55;padding-left:16px;position:relative;color:var(--text)}
.g-forbid li::before{content:'✕';position:absolute;left:0;color:var(--red);font-weight:800}
.g-call{display:block;width:100%;margin-top:10px;padding:13px;border-radius:12px;background:rgba(255,69,58,.15);color:var(--red);font-weight:800;font-size:14px;border:none;font-family:var(--font);text-decoration:none;text-align:center}
.g-card{background:var(--card);border-radius:16px;margin-bottom:8px;overflow:hidden}
.g-card.urgent{border:1px solid rgba(255,69,58,.25)}
.g-card-hd{display:flex;align-items:center;gap:8px;padding:14px 16px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.g-card-hd:active{background:rgba(255,255,255,.03)}
.g-card-t{flex:1;font-size:15px;font-weight:800;letter-spacing:-.2px;line-height:1.3;word-break:keep-all}
.g-card-t small{display:block;font-size:11px;font-weight:600;color:var(--dim);margin-top:2px}
.g-urgent{font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px;background:rgba(255,69,58,.15);color:var(--red);white-space:nowrap}
.g-chev{color:var(--dim);font-size:11px;transition:transform .15s;flex-shrink:0}
.g-card.open .g-chev{transform:rotate(180deg)}
.g-card-body{display:none;padding:0 16px 16px}
.g-card.open .g-card-body{display:block}
.g-steps{list-style:none;margin:0;padding:0}
.g-steps li{display:flex;gap:10px;padding:7px 0;font-size:14.5px;line-height:1.55;word-break:keep-all}
.g-n{flex-shrink:0;width:24px;height:24px;border-radius:50%;background:var(--card2);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;margin-top:2px;color:var(--blue)}
.g-dont{margin-top:8px;padding:10px 12px;border-radius:12px;background:rgba(255,69,58,.08)}
.g-dont div{font-size:13px;line-height:1.55;padding-left:16px;position:relative;word-break:keep-all}
.g-dont div::before{content:'✕';position:absolute;left:0;color:var(--red);font-weight:800}
.g-tplbox{margin-top:12px;background:var(--card2);border-radius:12px;padding:12px}
.g-tpl-hd{font-size:12px;font-weight:700;color:var(--sub);margin-bottom:8px}
.g-sel{width:100%;padding:10px 12px;border-radius:10px;background:var(--card);color:var(--text);border:1px solid var(--border);font-size:13px;font-family:var(--font);margin-bottom:8px;-webkit-appearance:none}
.g-tpl-pre{white-space:pre-wrap;font-size:12.5px;line-height:1.5;color:var(--sub);word-break:break-all;margin-bottom:10px;padding:10px;border-radius:8px;background:var(--card)}
.g-copy{display:block;width:100%;padding:13px;border-radius:12px;background:var(--blue);color:#000;font-weight:800;font-size:14px;border:none;font-family:var(--font);cursor:pointer}
.g-copy:active{transform:scale(.98)}
.g-editrow{display:flex;gap:6px;padding:0 16px 12px}
.g-eb{flex:1;padding:9px 4px;border-radius:10px;background:var(--card2);color:var(--sub);font-size:12px;font-weight:700;border:none;font-family:var(--font);cursor:pointer}
.g-eb.del{color:var(--red)}
.g-add{display:block;width:100%;padding:14px;border-radius:14px;border:1px dashed rgba(90,200,250,.4);background:rgba(90,200,250,.06);color:var(--blue);font-size:14px;font-weight:800;font-family:var(--font);cursor:pointer;margin:8px 0 16px}
.g-empty{text-align:center;color:var(--dim);padding:36px 0;font-size:13px;line-height:1.6}
.g-ov{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);z-index:999;overflow-y:auto;padding:16px;padding-top:max(16px,env(safe-area-inset-top));padding-bottom:110px;max-width:600px;margin:0 auto}
.g-ov.show{display:block}
.g-ov-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
.g-ov-hd b{font-size:17px;font-weight:900}
.g-ov-hd span{font-size:18px;color:var(--dim);cursor:pointer;padding:4px 8px}
.g-f label{display:block;font-size:12px;font-weight:700;color:var(--sub);margin:16px 0 6px}
.g-f label small{font-weight:400;color:var(--dim);margin-left:4px}
.g-f input,.g-f textarea,.g-f select{width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--card2);color:var(--text);font-size:14px;font-family:var(--font)}
.g-f input,.g-f textarea{-webkit-appearance:none}
.g-f select{-webkit-appearance:none;appearance:none;padding-right:36px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%238e8e93' stroke-width='2'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.g-f textarea{min-height:130px;line-height:1.55;resize:vertical}
.g-f input:focus,.g-f textarea:focus,.g-f select:focus{outline:none;border-color:var(--blue)}
.g-tog{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:10px;background:var(--card2);margin-top:16px;font-size:14px;font-weight:700;color:var(--text);cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none}
.g-sw{flex-shrink:0;width:44px;height:26px;border-radius:13px;background:rgba(255,255,255,.12);position:relative;transition:background .15s}
.g-sw::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s}
.g-tog.on .g-sw{background:var(--red)}
.g-tog.on .g-sw::after{transform:translateX(18px)}
.g-ovbar{position:fixed;bottom:0;left:0;right:0;max-width:600px;margin:0 auto;padding:12px 16px;padding-bottom:max(12px,env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--border);display:flex;gap:8px;z-index:1000}
.g-ovbar button{flex:1;padding:14px;border-radius:12px;font-size:14px;font-weight:800;border:none;font-family:var(--font);cursor:pointer}
.g-ovbar .save{background:var(--green);color:#000;flex:2}
.g-ovbar .cancel{background:var(--card2);color:var(--sub)}
.g-ovbar .del{background:rgba(255,69,58,.12);color:var(--red)}
#gPinIn{width:140px;letter-spacing:10px;text-align:center}
`;

/* ---------- 유틸 ---------- */
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function gToast(msg,type){if(typeof toast==='function')toast(msg,type||'ok');else alert(msg)}
function kstDate(off){const d=new Date(Date.now()+9*3600e3+(off||0)*86400e3);return d.toISOString().slice(0,10)}
function kstHM(){const d=new Date(Date.now()+9*3600e3);return d.toISOString().slice(11,16)}
function lines(t){return String(t||'').split('\n').map(s=>s.trim()).filter(Boolean)}
function arr(v){return Array.isArray(v)?v:(v&&typeof v==='object')?Object.values(v):[]}

function rules(){return GD.rules||SEED_RULES}
function seeded(){return !!GD.seeded}
function items(){
  if(!seeded())return SEED_ITEMS.map((it,i)=>Object.assign({id:'seed'+i,order:i*10},it));
  const o=GD.items||{};
  return Object.keys(o).map(k=>Object.assign({id:k},o[k],{steps:arr(o[k].steps),dont:arr(o[k].dont)})).sort((a,b)=>(a.order||0)-(b.order||0));
}
function cats(list){const c=[];list.forEach(it=>{if(it.cat&&!c.includes(it.cat))c.push(it.cat)});return c}

/* ---------- 현장 선택 (보고 서식 자동 채움) ---------- */
function timeLabel(t){t=String(t||'');if(/^as$/i.test(t))return 'AS';if(t.includes('실측'))return '실측';if(t.startsWith('오전')||t.includes('2:'))return '오전';if(t.startsWith('오후'))return '오후';return t}
function shortAddr(a){return String(a||'').replace(/\s*\d+동\s*\d*호?\s*/g,' ').replace(/\s+/g,' ').trim().split(' ').slice(0,3).join(' ')}
function crewOf(j){
  let c=[];
  try{if(typeof A!=='undefined'&&A&&A[j.id])c=A[j.id].slice()}catch(e){}
  if(!c.length)c=[j.sasu,j.busasu].filter(Boolean);
  return c;
}
function nearbyJobs(){
  let list=[];
  try{if(typeof J!=='undefined'&&Array.isArray(J))list=J}catch(e){}
  const days=[kstDate(-1),kstDate(0),kstDate(1)];
  return list.filter(j=>days.includes(j.date)&&!(String(j.addr||'').includes('예약 x'))&&!String(j.time||'').includes('차단'))
    .sort((a,b)=>a.date.localeCompare(b.date)||rank(a.time)-rank(b.time));
}
function rank(t){const l=timeLabel(t);return l==='오전'?0:l==='오후'?1:2}
function jobLabel(j){const [y,m,d]=j.date.split('-');const c=crewOf(j);return `${+m}/${+d} ${timeLabel(j.time)} · ${shortAddr(j.addr)}${c.length?' ('+c.join('·')+')':''}`}
function fillTpl(tpl,j){
  let site='(현장 입력)',team='(팀 입력)';
  if(j){const [y,m,d]=j.date.split('-');site=`${+m}/${+d} ${timeLabel(j.time)} · ${shortAddr(j.addr)} (${REGION})`;const c=crewOf(j);if(c.length)team=c.join('·')}
  return String(tpl||'').replace(/\{현장\}/g,site).replace(/\{팀\}/g,team).replace(/\{지역\}/g,REGION).replace(/\{날짜\}/g,kstDate(0)).replace(/\{시간\}/g,kstHM());
}

/* ---------- 렌더 ---------- */
function ensureShell(){
  if(document.getElementById('p-guide'))return;
  const st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
  // 탭 패널
  const pane=document.createElement('div');pane.className='pane';pane.id='p-guide';
  pane.innerHTML=`<div id="guideView">
    <div class="g-top"><div class="g-title">현장 대응 프로세스</div><button class="g-lock" id="gLockBtn" onclick="gLock()">🔒</button></div>
    <div id="gEditBar"></div>
    <input class="g-search" id="gSearch" placeholder="상황 검색 · 벽지, 장수, 결제…" oninput="gSearchChange(this.value)" autocomplete="off">
    <div class="g-chips" id="gChips"></div>
    <div id="gBody"></div>
  </div>`;
  const panes=document.querySelectorAll('.pane');
  const last=panes[panes.length-1];
  if(last&&last.parentNode)last.parentNode.insertBefore(pane,last.nextSibling);else document.body.appendChild(pane);
  // 하단 탭 버튼
  const nav=document.querySelector('.nav');
  if(nav){const a=document.createElement('a');a.href='#';a.id='gNavBtn';a.setAttribute('onclick','gShow()');a.innerHTML='<span>🧭</span>프로세스';nav.appendChild(a)}
  // PIN
  const pin=document.createElement('div');pin.className='pin-overlay';pin.id='gPin';pin.setAttribute('onclick','if(event.target===this)gPinClose()');
  pin.innerHTML=`<div class="pin-box"><h3>🔒 프로세스 수정</h3><p>관리자 PIN 4자리</p>
    <div class="pin-input"><input id="gPinIn" type="tel" inputmode="numeric" maxlength="4" autocomplete="off" oninput="gPinInput(this)"></div>
    <div class="pin-error" id="gPinErr">PIN이 올바르지 않습니다</div>
    <button onclick="gPinClose()" style="padding:10px 24px;border-radius:10px;background:var(--card2);color:var(--dim);border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)">취소</button></div>`;
  document.body.appendChild(pin);
  // 편집 오버레이
  const ov=document.createElement('div');ov.className='g-ov';ov.id='gOv';
  ov.innerHTML=`<div class="g-ov-hd"><b id="gOvTitle"></b><span onclick="gCloseEdit()">✕</span></div><div class="g-f" id="gForm"></div><div class="g-ovbar" id="gOvBar"></div>`;
  document.body.appendChild(ov);
}

function renderGuide(){
  if(!document.getElementById('gBody'))return;
  const lock=document.getElementById('gLockBtn');
  lock.className='g-lock'+(gEdit?' on':'');lock.textContent=gEdit?'🔓 수정 중':'🔒';
  document.getElementById('gEditBar').innerHTML=gEdit?`<div class="g-editbar"><span>✏️ 수정 모드 · 카드의 버튼으로 수정·삭제·순서 변경</span><span onclick="gLock()" style="cursor:pointer;opacity:.7">해제</span></div>`:'';

  const all=items();
  const q=gQuery.trim().toLowerCase();
  const cl=cats(all);
  if(gChip!=='전체'&&!cl.includes(gChip))gChip='전체';
  gChipList=['전체',...cl];
  document.getElementById('gChips').innerHTML=gChipList.map((c,i)=>`<div class="g-chip${gChip===c?' on':''}" onclick="gChipSel(${i})">${esc(c)}</div>`).join('');

  let list=all;
  if(q)list=list.filter(it=>[it.title,it.cat,...(it.steps||[]),...(it.dont||[]),it.tpl].join(' ').toLowerCase().includes(q));
  else if(gChip!=='전체')list=list.filter(it=>it.cat===gChip);

  const R=rules();
  const phone=String(R.phone||'').trim();
  let html='';
  if(!q&&gChip==='전체'){
    const pr=arr(R.principles);const fb=arr(R.forbidden);
    html+=`<div class="g-rules"><div class="g-rules-t">문제가 생기면 이 순서로</div>
      <div class="g-rules-grid">${pr.map(p=>`<div class="g-rule"><b>${esc(p.t)}</b><span>${esc(p.d)}</span></div>`).join('')}</div>
      ${fb.length?`<div class="g-forbid"><div class="g-forbid-hd" onclick="gForbid()"><span>현장에서 확답하면 안 되는 것 <small>${fb.length}가지</small></span><span>${gForbidOpen?'▲':'▼'}</span></div>${gForbidOpen?`<ul>${fb.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}</div>`:''}
      ${phone?`<a class="g-call" href="tel:${esc(phone.replace(/[^0-9+]/g,''))}">📞 본사 전화 ${esc(phone)}</a>`:''}
      ${gEdit?`<button class="g-eb" style="width:100%;margin-top:10px;padding:11px" onclick="gOpenRules()">✏️ 원칙·금지 목록·본사 연락처 수정</button>`:''}
    </div>`;
  }

  if(!list.length){
    html+=`<div class="g-empty">${q?'"'+esc(gQuery)+'" 에 맞는 프로세스가 없어요':'등록된 프로세스가 없어요'}${gEdit?'<br>아래 버튼으로 추가':''}</div>`;
  }
  const jobs=nearbyJobs();
  list.forEach((it,idx)=>{
    const open=q?true:gOpen.has(it.id);
    const steps=it.steps||[],dont=it.dont||[];
    const selId=gSelJob[it.id]||'';
    const selJob=jobs.find(j=>j.id===selId);
    html+=`<div class="g-card${open?' open':''}${it.urgent?' urgent':''}" id="gc-${esc(it.id)}">
      <div class="g-card-hd" onclick="gToggle('${esc(it.id)}')">
        <div class="g-card-t">${esc(it.title)}<small>${esc(it.cat||'')}</small></div>
        ${it.urgent?`<span class="g-urgent">🚨 즉시 본사 전화</span>`:''}
        <span class="g-chev">▼</span>
      </div>
      ${gEdit?`<div class="g-editrow">
        <button class="g-eb" onclick="gMove('${esc(it.id)}',-1)">↑ 위로</button>
        <button class="g-eb" onclick="gMove('${esc(it.id)}',1)">↓ 아래로</button>
        <button class="g-eb" onclick="gOpenEdit('${esc(it.id)}')">✏️ 수정</button>
        <button class="g-eb del" onclick="gDelete('${esc(it.id)}')">🗑 삭제</button>
      </div>`:''}
      <div class="g-card-body">
        ${it.urgent&&phone?`<a class="g-call" href="tel:${esc(phone.replace(/[^0-9+]/g,''))}" style="margin:0 0 10px">📞 본사 전화 ${esc(phone)}</a>`:''}
        <ol class="g-steps">${steps.map((s,i)=>`<li><span class="g-n">${i+1}</span><span>${esc(s)}</span></li>`).join('')}</ol>
        ${dont.length?`<div class="g-dont">${dont.map(d=>`<div>${esc(d)}</div>`).join('')}</div>`:''}
        ${it.tpl?`<div class="g-tplbox"><div class="g-tpl-hd">보고 서식 · 복사해서 단톡방에 붙여넣기</div>
          <select class="g-sel" onchange="gSelJobChange('${esc(it.id)}',this.value)">
            <option value="">현장 선택 (어제·오늘·내일)</option>
            ${jobs.map(j=>`<option value="${esc(j.id)}"${j.id===selId?' selected':''}>${esc(jobLabel(j))}</option>`).join('')}
          </select>
          <div class="g-tpl-pre" id="gpre-${esc(it.id)}">${esc(fillTpl(it.tpl,selJob))}</div>
          <button class="g-copy" onclick="gCopy('${esc(it.id)}')">📋 서식 복사</button></div>`:''}
      </div>
    </div>`;
  });
  if(gEdit)html+=`<button class="g-add" onclick="gOpenEdit('new')">＋ 프로세스 추가</button>`;
  document.getElementById('gBody').innerHTML=html;
}

/* ---------- 탭 전환 ---------- */
function gShow(){
  try{currentTab='guide'}catch(e){}
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(p=>p.classList.remove('on'));
  document.getElementById('p-guide').classList.add('on');
  const b=document.getElementById('gNavBtn');if(b)b.classList.add('on');
  renderGuide();
  window.scrollTo(0,0);
}

/* ---------- 조회 조작 ---------- */
function gToggle(id){if(gOpen.has(id))gOpen.delete(id);else gOpen.add(id);renderGuide()}
function gSearchChange(v){gQuery=v||'';renderGuide()}
function gChipSel(i){gChip=gChipList[i]||'전체';renderGuide()}
function gForbid(){gForbidOpen=!gForbidOpen;renderGuide()}
function gSelJobChange(id,jobId){
  gSelJob[id]=jobId;
  const it=items().find(x=>x.id===id);const j=nearbyJobs().find(x=>x.id===jobId);
  const pre=document.getElementById('gpre-'+id);if(pre&&it)pre.textContent=fillTpl(it.tpl,j);
}
function gCopy(id){
  const it=items().find(x=>x.id===id);if(!it)return;
  const j=nearbyJobs().find(x=>x.id===(gSelJob[id]||''));
  const text=fillTpl(it.tpl,j);
  const done=()=>gToast('📋 복사됨 · 단톡방에 붙여넣기','copy');
  const fallback=()=>{const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0;font-size:16px';document.body.appendChild(ta);ta.focus();ta.select();try{ta.setSelectionRange(0,999999)}catch(e){}let ok=false;try{ok=document.execCommand('copy')}catch(e){}document.body.removeChild(ta);if(ok)done();else gToast('복사가 안 돼요 · 서식을 길게 눌러 복사해줘','ok')};
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(text).then(done,fallback);else fallback();
}

/* ---------- 잠금 (관리자 PIN) ---------- */
(function restoreEdit(){try{const s=localStorage.getItem('dolbom_guide_edit');if(s&&Date.now()-parseInt(s)<EDIT_TTL)gEdit=true;else localStorage.removeItem('dolbom_guide_edit')}catch(e){}})();
function gLock(){
  if(gEdit){gEdit=false;localStorage.removeItem('dolbom_guide_edit');gToast('수정 모드 해제','ok');renderGuide();return}
  document.getElementById('gPinErr').style.display='none';
  const inp=document.getElementById('gPinIn');inp.value='';
  document.getElementById('gPin').classList.add('show');
  setTimeout(()=>inp.focus(),50);
}
function gPinClose(){document.getElementById('gPin').classList.remove('show')}
function gPinInput(inp){
  const v=inp.value.replace(/\D/g,'');inp.value=v;
  if(v.length<4)return;
  if(v!==GUIDE_PIN){document.getElementById('gPinErr').style.display='block';inp.value='';return}
  gPinClose();
  gEdit=true;localStorage.setItem('dolbom_guide_edit',Date.now().toString());
  if(!seeded()){seedToFirebase()}
  gToast('🔓 수정 모드','ok');renderGuide();
}
function seedToFirebase(){
  if(seedRequested)return;seedRequested=true;
  const o={};SEED_ITEMS.forEach((it,i)=>{o['g'+String(i).padStart(3,'0')]=Object.assign({},it,{order:i*10,updatedAt:Date.now()})});
  db.ref('guide').update({seeded:true,rules:SEED_RULES,items:o}).catch(e=>{seedRequested=false;gToast('저장 실패: '+e.message,'ok')});
}

/* ---------- 편집 ---------- */
function gOpenEdit(id){
  if(!gEdit)return;
  if(!seeded()){seedToFirebase();gToast('기본 내용을 저장하는 중 · 잠시 후 다시 눌러줘','ok');return}
  gEditing=id;
  const cl=cats(items());
  const it=id==='new'?{title:'',cat:gChip!=='전체'?gChip:(cl[0]||''),urgent:false,steps:[],dont:[],tpl:'[현장보고] \n현장: {현장}\n팀: {팀}\n내용: \n고객 안내: \n요청: '}:items().find(x=>x.id===id);
  if(!it)return;
  document.getElementById('gOvTitle').textContent=id==='new'?'프로세스 추가':'프로세스 수정';
  document.getElementById('gForm').innerHTML=`
    <label>제목</label><input id="gfTitle" value="${esc(it.title)}" placeholder="예) 벽지 손상">
    <label>분류</label>
    <select id="gfCatSel" onchange="gCatSel(this)">${cl.map(c=>`<option value="${esc(c)}"${c===it.cat?' selected':''}>${esc(c)}</option>`).join('')}<option value="__new"${!cl.includes(it.cat)?' selected':''}>새 분류 직접 입력…</option></select>
    <input id="gfCatNew" value="${!cl.includes(it.cat)?esc(it.cat||''):''}" placeholder="새 분류 이름" style="margin-top:6px;display:${!cl.includes(it.cat)?'block':'none'}">
    <div class="g-tog${it.urgent?' on':''}" id="gfUrgent" onclick="this.classList.toggle('on')"><span>🚨 즉시 본사 전화가 필요한 상황 <small style="font-weight:400;color:var(--dim)">(빨간 표시)</small></span><span class="g-sw"></span></div>
    <label>대응 순서 <small>엔터로 한 단계씩 구분</small></label><textarea id="gfSteps" placeholder="1단계 내용&#10;2단계 내용&#10;…">${esc((it.steps||[]).join('\n'))}</textarea>
    <label>하지 말 것 <small>엔터로 구분 · 없으면 비워두기</small></label><textarea id="gfDont" style="min-height:80px">${esc((it.dont||[]).join('\n'))}</textarea>
    <label>보고 서식 <small>{현장} {팀} 은 현장 선택 시 자동으로 채워짐</small></label><textarea id="gfTpl" style="min-height:170px">${esc(it.tpl||'')}</textarea>`;
  document.getElementById('gOvBar').innerHTML=`<button class="cancel" onclick="gCloseEdit()">취소</button>${id!=='new'?`<button class="del" onclick="gDelete('${esc(id)}')">삭제</button>`:''}<button class="save" onclick="gSave()">저장</button>`;
  document.getElementById('gOv').classList.add('show');window.scrollTo(0,0);
}
function gCatSel(sel){document.getElementById('gfCatNew').style.display=sel.value==='__new'?'block':'none'}
function gCloseEdit(){document.getElementById('gOv').classList.remove('show');gEditing=null}
function gSave(){
  if(!gEdit)return;
  if(gEditing==='rules'){return gSaveRules()}
  const title=document.getElementById('gfTitle').value.trim();
  const sel=document.getElementById('gfCatSel').value;
  const cat=(sel==='__new'?document.getElementById('gfCatNew').value:sel).trim();
  if(!title){gToast('제목을 입력해줘','ok');return}
  if(!cat){gToast('분류를 입력해줘','ok');return}
  const data={title,cat,urgent:document.getElementById('gfUrgent').classList.contains('on'),steps:lines(document.getElementById('gfSteps').value),dont:lines(document.getElementById('gfDont').value),tpl:document.getElementById('gfTpl').value.replace(/\r/g,'').trim(),updatedAt:Date.now()};
  let id=gEditing;
  if(id==='new'){id=db.ref('guide/items').push().key;const mx=items().reduce((m,it)=>Math.max(m,it.order||0),0);data.order=mx+10}
  else{const cur=items().find(x=>x.id===id);data.order=cur?(cur.order||0):0}
  db.ref('guide/items/'+id).set(data).then(()=>{gToast('저장됨','ok');gOpen.add(id);gCloseEdit()}).catch(e=>gToast('저장 실패: '+e.message,'ok'));
}
function gDelete(id){
  if(!gEdit)return;
  if(!seeded()){seedToFirebase();gToast('기본 내용을 저장하는 중 · 잠시 후 다시 눌러줘','ok');return}
  const it=items().find(x=>x.id===id);if(!it)return;
  if(!confirm('"'+it.title+'" 프로세스를 삭제할까요?'))return;
  db.ref('guide/items/'+id).remove().then(()=>{gToast('삭제됨','ok');gCloseEdit()}).catch(e=>gToast('삭제 실패: '+e.message,'ok'));
}
function gMove(id,dir){
  if(!gEdit)return;
  if(!seeded()){seedToFirebase();gToast('기본 내용을 저장하는 중 · 잠시 후 다시 눌러줘','ok');return}
  const list=items();const i=list.findIndex(x=>x.id===id);const k=i+dir;
  if(i<0||k<0||k>=list.length)return;
  const t=list[i];list[i]=list[k];list[k]=t;
  const upd={};list.forEach((it,n)=>{upd['items/'+it.id+'/order']=n*10});
  db.ref('guide').update(upd).catch(e=>gToast('순서 변경 실패: '+e.message,'ok'));
}
function gOpenRules(){
  if(!gEdit)return;
  if(!seeded()){seedToFirebase();gToast('기본 내용을 저장하는 중 · 잠시 후 다시 눌러줘','ok');return}
  gEditing='rules';
  const R=rules();
  document.getElementById('gOvTitle').textContent='원칙·연락처 수정';
  document.getElementById('gForm').innerHTML=`
    <label>본사 연락처 <small>입력하면 긴급 카드에 📞 버튼이 생김</small></label><input id="gfPhone" type="tel" value="${esc(R.phone||'')}" placeholder="예) 051-000-0000">
    <label>행동 원칙 <small>한 줄에 하나 · "제목 | 설명" 형식</small></label><textarea id="gfPr">${esc(arr(R.principles).map(p=>p.t+' | '+p.d).join('\n'))}</textarea>
    <label>현장에서 확답하면 안 되는 것 <small>엔터로 구분</small></label><textarea id="gfFb">${esc(arr(R.forbidden).join('\n'))}</textarea>`;
  document.getElementById('gOvBar').innerHTML=`<button class="cancel" onclick="gCloseEdit()">취소</button><button class="save" onclick="gSave()">저장</button>`;
  document.getElementById('gOv').classList.add('show');window.scrollTo(0,0);
}
function gSaveRules(){
  const principles=lines(document.getElementById('gfPr').value).map(l=>{const p=l.split('|');return {t:(p[0]||'').trim(),d:(p.slice(1).join('|')||'').trim()}}).filter(p=>p.t);
  const forbidden=lines(document.getElementById('gfFb').value);
  const phone=document.getElementById('gfPhone').value.trim();
  db.ref('guide/rules').set({phone,principles,forbidden}).then(()=>{gToast('저장됨','ok');gCloseEdit()}).catch(e=>gToast('저장 실패: '+e.message,'ok'));
}

/* ---------- 시작 ---------- */
function init(){
  ensureShell();
  try{db.ref('guide').on('value',snap=>{GD=snap.val()||{};if(gEdit&&!seeded())seedToFirebase();renderGuide()})}catch(e){renderGuide()}
  if(location.hash==='#guide')gShow();
}
Object.assign(window,{gShow,gToggle,gSearchChange,gChipSel,gForbid,gSelJobChange,gCopy,gLock,gPinClose,gPinInput,gOpenEdit,gCatSel,gCloseEdit,gSave,gDelete,gMove,gOpenRules});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
