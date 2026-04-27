/* ═══════════════════════════════════════════════════════════════
 * 🔒 돌봄매트 cs-consent.js v1.0 · 통합 동의 모달
 * 
 * 5개 페이지(홈/샘플/견적/예약/후기) 공통 동의 모달
 * 동의서 버전: v3.0 (2026-04-27 시행)
 * 
 * 의존성: sharedData.js (먼저 로드되어야 함)
 * 함께 사용: cs-consent.css
 * 
 * 사용법:
 *   <link rel="stylesheet" href="cs-consent.css">
 *   <script src="sharedData.js"></script>
 *   <script src="cs-consent.js"></script>
 *   <script>
 *     // 동의 모달 띄우기
 *     DolbomConsent.show({
 *       page: 'sample',
 *       name: '홍길동',           // 선택 (있으면 제출 시 사용)
 *       phone: '01012345678',     // 선택
 *       onAgree: function(consent) {
 *         // consent = {required1:'Y', required2:'Y', optional1:'Y', optional2:'N'}
 *         console.log('동의 완료', consent);
 *       },
 *       onCancel: function() {
 *         console.log('취소');
 *       }
 *     });
 *   </script>
 * 
 * 변경 이력:
 *   2026-04-27 v1.0 최초 작성
 * ═══════════════════════════════════════════════════════════════ */

(function(window) {
  'use strict';

  var CONSENT_VERSION = 'v3.0';

  /* ───────────────────────────────────────────────
   * 동의서 본문 데이터
   * 
   * 4개 항목 구조:
   *   - required1: 개인정보 수집·이용 (필수)
   *   - required2: 제3자 제공 (필수)
   *   - optional1: 마케팅 정보 수신 (선택)
   *   - optional2: 시공 사진 마케팅 활용 (선택)
   * 
   * 각 항목은 title, summary, fullText로 구성
   * fullText는 펼쳤을 때 보이는 전체 본문
   * ───────────────────────────────────────────────
   */
  var CONSENT_ITEMS = [
    {
      key: 'required1',
      required: true,
      title: '개인정보 수집·이용 동의',
      summary: '이름·휴대폰·주소를 수집해 샘플 배송과 시공·A/S에 사용해요.',
      fullText: 
        '【수집 항목】\n' +
        '· 필수: 이름, 휴대폰번호, 주소\n\n' +
        '【수집·이용 목적】\n' +
        '· 무료 샘플 배송\n' +
        '· 시공 상담·예약·진행\n' +
        '· A/S 및 사후관리\n' +
        '· 결제·환불 처리\n\n' +
        '【보유·이용 기간】\n' +
        '· 마지막 거래일로부터 3년 (관련 법령에 따름)\n' +
        '· 동의 철회 시 즉시 삭제 (단, 전자상거래법상 보존 의무 항목 제외)\n\n' +
        '【거부 권리 및 불이익】\n' +
        '· 본 동의를 거부하실 권리가 있습니다.\n' +
        '· 다만 거부 시 샘플 신청·시공 예약·견적 발급 등 서비스 이용이 제한됩니다.'
    },
    {
      key: 'required2',
      required: true,
      title: '개인정보 제3자 제공 동의',
      summary: '시공·배송·결제·세금 처리를 위해 외부 협력사에 제공해요.',
      fullText:
        '【제공받는 자】\n' +
        '· 택배사: 우체국택배, CJ대한통운\n' +
        '· 시공기사: 돌봄매트 시공팀 (부산·경기/인천)\n' +
        '· 결제대행사: KG이니시스 등\n' +
        '· 국세청 (현금영수증 발급 시)\n\n' +
        '【제공 항목】\n' +
        '· 이름, 휴대폰번호, 주소\n' +
        '· 결제 정보 (결제대행사에 한함)\n\n' +
        '【제공받는 자의 이용 목적】\n' +
        '· 택배사: 샘플 및 제품 배송\n' +
        '· 시공기사: 현장 시공 진행\n' +
        '· 결제대행사: 결제 처리·환불\n' +
        '· 국세청: 현금영수증 발급\n\n' +
        '【보유·이용 기간】\n' +
        '· 제공 목적 달성 시까지 (각 제공받는 자의 보관 정책에 따름)\n\n' +
        '【거부 권리 및 불이익】\n' +
        '· 본 동의를 거부하실 권리가 있습니다.\n' +
        '· 다만 거부 시 배송·시공·결제 처리가 불가능하여 서비스 이용이 제한됩니다.'
    },
    {
      key: 'optional1',
      required: false,
      title: '마케팅 정보 수신 동의',
      summary: '신제품·할인·이벤트를 알림톡으로 받아보실래요? (선택, 거부해도 OK)',
      fullText:
        '【수신 채널】\n' +
        '· 알림톡 (카카오톡 채널)\n\n' +
        '【수신 내용】\n' +
        '· 신제품 출시 안내\n' +
        '· 할인·프로모션 이벤트\n' +
        '· 후기 이벤트 안내\n' +
        '· 입주 시점 시공 시기 알림\n\n' +
        '【보유·이용 기간】\n' +
        '· 동의 철회 시까지\n\n' +
        '【거부 권리】\n' +
        '· 본 동의는 선택사항이며, 거부하셔도 시공·샘플 신청 등 서비스 이용에 영향이 없습니다.\n' +
        '· 동의 후에도 언제든지 카카오톡 채널 차단 또는 카톡 상담을 통해 수신을 거부하실 수 있습니다.'
    },
    {
      key: 'optional2',
      required: false,
      title: '시공 사진 마케팅 활용 동의',
      summary: '시공 사진을 SNS·블로그에 활용하는 데 동의하시면 체크해주세요.',
      fullText:
        '【활용 사진】\n' +
        '· 시공 전·후 매트 시공 사진\n' +
        '· 시공 과정 사진 (얼굴·이름·정확한 주소 미공개)\n\n' +
        '【활용 채널】\n' +
        '· 인스타그램 (@dolbommat 등)\n' +
        '· 블로그 (네이버, 티스토리)\n' +
        '· 카카오톡 채널\n' +
        '· 네이버 카페, 맘카페\n' +
        '· 유튜브\n\n' +
        '【보유·이용 기간】\n' +
        '· 동의 철회 시까지\n\n' +
        '【삭제 요청】\n' +
        '· 게시된 사진의 삭제를 요청하시면 영업일 기준 3일 이내 삭제 처리합니다.\n' +
        '· 카카오톡 채널을 통해 요청해주세요.\n\n' +
        '【거부 권리】\n' +
        '· 본 동의는 선택사항이며, 거부하셔도 시공 등 서비스 이용에 영향이 없습니다.'
    }
  ];

  /* ───────────────────────────────────────────────
   * 모달 HTML 생성
   * ───────────────────────────────────────────────
   */
  function _buildModalHTML() {
    var itemsHTML = CONSENT_ITEMS.map(function(item, idx) {
      var badgeClass = item.required ? 'cs-badge-required' : 'cs-badge-optional';
      var badgeText = item.required ? '필수' : '선택';
      var initialChecked = item.required ? 'checked' : '';
      
      return ''
        + '<div class="cs-consent-item" data-key="' + item.key + '">'
        +   '<label class="cs-consent-row">'
        +     '<input type="checkbox" class="cs-consent-checkbox" ' + initialChecked + ' data-key="' + item.key + '">'
        +     '<span class="cs-consent-checkbox-visual"></span>'
        +     '<span class="cs-badge ' + badgeClass + '">' + badgeText + '</span>'
        +     '<span class="cs-consent-title">' + item.title + '</span>'
        +     '<button type="button" class="cs-consent-toggle" data-key="' + item.key + '">자세히 ▼</button>'
        +   '</label>'
        +   '<div class="cs-consent-summary">' + item.summary + '</div>'
        +   '<div class="cs-consent-full" id="cs-full-' + item.key + '" style="display:none;">'
        +     '<pre>' + item.fullText + '</pre>'
        +   '</div>'
        + '</div>';
    }).join('');

    return ''
      + '<div class="cs-consent-overlay" id="cs-consent-overlay">'
      +   '<div class="cs-consent-modal">'
      +     '<div class="cs-consent-header">'
      +       '<h3>🔒 개인정보 수집 동의</h3>'
      +       '<div class="cs-consent-version">v' + CONSENT_VERSION + ' · ' + _today() + '</div>'
      +     '</div>'
      +     '<div class="cs-consent-body">'
      +       '<div class="cs-consent-intro">'
      +         '<strong>돌봄매트는 고객님의 개인정보를 안전하게 보호합니다.</strong><br>'
      +         '아래 동의 내용을 확인해주세요.'
      +       '</div>'
      +       itemsHTML
      +     '</div>'
      +     '<div class="cs-consent-footer">'
      +       '<button type="button" class="cs-btn cs-btn-secondary" id="cs-btn-required-only">필수만 동의</button>'
      +       '<button type="button" class="cs-btn cs-btn-primary" id="cs-btn-agree-all">모두 동의</button>'
      +     '</div>'
      +     '<button type="button" class="cs-consent-close" id="cs-btn-cancel" aria-label="닫기">×</button>'
      +     '<div class="cs-consent-notice">'
      +       '본 동의서는 v' + CONSENT_VERSION + ' 기준이며, 6개월간 자동 인정됩니다.<br>'
      +       '문의: 카카오톡 채널 [돌봄매트] · 사업자: 돌봄매트 (부산광역시)'
      +     '</div>'
      +   '</div>'
      + '</div>';
  }

  function _today() {
    var d = new Date();
    return d.getFullYear() + '.' + ('0'+(d.getMonth()+1)).slice(-2) + '.' + ('0'+d.getDate()).slice(-2);
  }

  /* ───────────────────────────────────────────────
   * 이벤트 바인딩
   * ───────────────────────────────────────────────
   */
  function _bindEvents(options) {
    var overlay = document.getElementById('cs-consent-overlay');
    if (!overlay) return;

    // 펼치기/접기 버튼
    var toggles = overlay.querySelectorAll('.cs-consent-toggle');
    Array.prototype.forEach.call(toggles, function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var key = btn.getAttribute('data-key');
        var fullEl = document.getElementById('cs-full-' + key);
        if (!fullEl) return;
        if (fullEl.style.display === 'none') {
          fullEl.style.display = 'block';
          btn.textContent = '접기 ▲';
        } else {
          fullEl.style.display = 'none';
          btn.textContent = '자세히 ▼';
        }
      });
    });

    // 모두 동의 버튼
    document.getElementById('cs-btn-agree-all').addEventListener('click', function() {
      var checkboxes = overlay.querySelectorAll('.cs-consent-checkbox');
      Array.prototype.forEach.call(checkboxes, function(cb) { cb.checked = true; });
      _submit(options, true);
    });

    // 필수만 동의 버튼
    document.getElementById('cs-btn-required-only').addEventListener('click', function() {
      var checkboxes = overlay.querySelectorAll('.cs-consent-checkbox');
      Array.prototype.forEach.call(checkboxes, function(cb) {
        var key = cb.getAttribute('data-key');
        var item = _findItem(key);
        cb.checked = item && item.required;
      });
      _submit(options, false);
    });

    // 취소(X) 버튼
    document.getElementById('cs-btn-cancel').addEventListener('click', function() {
      _close();
      if (typeof options.onCancel === 'function') {
        options.onCancel();
      }
    });

    // 배경 클릭 시 닫기 (선택사항 - 실수로 닫힐 수 있어 비활성화)
    // overlay.addEventListener('click', function(e) {
    //   if (e.target === overlay) {
    //     _close();
    //     if (typeof options.onCancel === 'function') options.onCancel();
    //   }
    // });
  }

  function _findItem(key) {
    for (var i = 0; i < CONSENT_ITEMS.length; i++) {
      if (CONSENT_ITEMS[i].key === key) return CONSENT_ITEMS[i];
    }
    return null;
  }

  /* ───────────────────────────────────────────────
   * 동의 제출 처리
   * ───────────────────────────────────────────────
   */
  function _submit(options, agreeAll) {
    var overlay = document.getElementById('cs-consent-overlay');
    if (!overlay) return;

    // 필수 동의 체크
    var requiredOK = true;
    var failedRequired = '';
    CONSENT_ITEMS.forEach(function(item) {
      if (item.required) {
        var cb = overlay.querySelector('.cs-consent-checkbox[data-key="' + item.key + '"]');
        if (cb && !cb.checked) {
          requiredOK = false;
          failedRequired = item.title;
        }
      }
    });

    if (!requiredOK) {
      alert('⚠️ 필수 동의 항목에 동의해주세요.\n\n· ' + failedRequired);
      return;
    }

    // 동의 결과 수집
    var consent = {};
    CONSENT_ITEMS.forEach(function(item) {
      var cb = overlay.querySelector('.cs-consent-checkbox[data-key="' + item.key + '"]');
      consent[item.key] = (cb && cb.checked) ? 'Y' : 'N';
    });

    // 모달 닫기
    _close();

    // 콜백 실행
    if (typeof options.onAgree === 'function') {
      options.onAgree(consent);
    }

    // sharedData에 저장 + Apps Script로 전송 (자동)
    if (window.DolbomData) {
      // 1) localStorage 저장
      if (options.name && options.phone) {
        window.DolbomData.save({
          name: options.name,
          phone: options.phone,
          address: options.address || '',
          page: options.page || 'unknown',
          consent: consent
        });
      }
      
      // 2) Apps Script로 전송 ([동의기록] 시트에 1행 추가)
      if (options.name && options.phone) {
        window.DolbomData.sendConsent({
          name: options.name,
          phone: options.phone,
          page: options.page || 'unknown',
          consent: consent
        }).catch(function(err) {
          console.warn('[DolbomConsent] 동의 기록 전송 실패 (무시):', err);
          // 실패해도 사용자 흐름 안 막음
        });
      }
    }
  }

  /* ───────────────────────────────────────────────
   * 모달 표시 (show)
   * ───────────────────────────────────────────────
   */
  function show(options) {
    options = options || {};

    // 기존 모달이 있으면 제거
    _close();

    // 모달 HTML 삽입
    var container = document.createElement('div');
    container.innerHTML = _buildModalHTML();
    document.body.appendChild(container.firstChild);

    // 이벤트 바인딩
    _bindEvents(options);

    // 스크롤 잠금
    document.body.style.overflow = 'hidden';
  }

  /* ───────────────────────────────────────────────
   * 모달 닫기 (close)
   * ───────────────────────────────────────────────
   */
  function _close() {
    var overlay = document.getElementById('cs-consent-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    document.body.style.overflow = '';
  }

  /* ───────────────────────────────────────────────
   * 동의 필요 여부 체크 (필요할 때만 모달 띄우기)
   * ───────────────────────────────────────────────
   * 사용 예시:
   *   if (DolbomConsent.isRequired()) {
   *     DolbomConsent.show({...});
   *   } else {
   *     // 이미 6개월 내 v3.0 동의 있음 → 바로 진행
   *   }
   */
  function isRequired() {
    if (!window.DolbomData) return true;
    return !window.DolbomData.hasValidConsent();
  }

  /* ───────────────────────────────────────────────
   * 전역 객체로 노출
   * ───────────────────────────────────────────────
   */
  window.DolbomConsent = {
    show: show,
    close: _close,
    isRequired: isRequired,
    
    // 디버그용
    _version: '1.0',
    _consentVersion: CONSENT_VERSION,
    _items: CONSENT_ITEMS
  };

  console.log('[DolbomConsent] v1.0 로드 완료 (동의서 ' + CONSENT_VERSION + ')');

})(window);
