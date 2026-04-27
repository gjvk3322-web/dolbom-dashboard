/* ═══════════════════════════════════════════════════════════════
 * 🔗 돌봄매트 sharedData.js v1.0
 * 
 * 5개 페이지(홈/샘플/견적/예약/후기) 사이의 고객 정보 공유
 * 
 * 저장 위치: 브라우저 localStorage (서버에 안 보냄, 기기 안에만)
 * 저장 기간: 6개월 (동의서 유효기간과 동일)
 * 동의서 버전: v3.0 (다른 버전이면 무효 처리)
 * 
 * 사용법 (HTML 페이지에서):
 *   <script src="sharedData.js"></script>
 *   <script>
 *     const data = DolbomData.load();
 *     if (data) { document.getElementById('fName').value = data.name; }
 *   </script>
 * 
 * 변경 이력:
 *   2026-04-27 v1.0 최초 작성
 * ═══════════════════════════════════════════════════════════════ */

(function(window) {
  'use strict';

  // ─── 설정 (수정 시 주의) ───
  var STORAGE_KEY = 'dolbom_customer_v3';
  var CONSENT_VERSION = 'v3.0';
  var EXPIRY_MONTHS = 6;
  var CHANNEL_KEY = 'dolbom_channel';
  
  // ─── 페이지별 주소 필드명 매핑 ───
  // sample/booking은 별도 주소, quote/review는 주소 안 씀
  var ADDRESS_FIELD_MAP = {
    'sample': 'sampleAddress',
    'booking': 'bookingAddress'
  };

  /* ───────────────────────────────────────────────
   * 1. 정보 저장 (save)
   * ───────────────────────────────────────────────
   * 호출 예시:
   *   DolbomData.save({
   *     name: '홍길동',
   *     phone: '01012345678',
   *     address: '부산 해운대구 ...',
   *     page: 'sample',  // sample / booking / quote / review
   *     consent: {
   *       required1: 'Y', required2: 'Y',
   *       optional1: 'Y', optional2: 'N'
   *     }
   *   });
   */
  function save(data) {
    try {
      if (!data || !data.name || !data.phone) {
        console.warn('[DolbomData] save: name, phone 필수');
        return false;
      }
      
      // 기존 데이터 불러오기 (주소 등 페이지별 분리 보존)
      var existing = _readRaw() || {};
      
      // 전화번호 정규화 (앞 0 복원)
      var phone = String(data.phone).replace(/[^0-9]/g, '');
      if (phone.length === 10 && !phone.startsWith('0')) {
        phone = '0' + phone;
      }
      
      // 새 데이터 만들기
      var newData = {
        name: data.name,
        phone: phone,
        sampleAddress: existing.sampleAddress || '',
        bookingAddress: existing.bookingAddress || '',
        consent: existing.consent || null,
        consentTimestamp: existing.consentTimestamp || null,
        consentVersion: existing.consentVersion || null,
        savedAt: new Date().toISOString()
      };
      
      // 페이지별 주소 저장
      if (data.address && data.page) {
        var addrField = ADDRESS_FIELD_MAP[data.page];
        if (addrField) {
          newData[addrField] = data.address;
        }
      }
      
      // 동의 정보 저장 (있을 때만)
      if (data.consent) {
        newData.consent = {
          required1: _normalizeYN(data.consent.required1),
          required2: _normalizeYN(data.consent.required2),
          optional1: _normalizeYN(data.consent.optional1),
          optional2: _normalizeYN(data.consent.optional2)
        };
        newData.consentTimestamp = new Date().toISOString();
        newData.consentVersion = CONSENT_VERSION;
      }
      
      // 저장
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
      console.log('[DolbomData] 저장 완료:', newData.name);
      return true;
      
    } catch (e) {
      console.error('[DolbomData] save 오류:', e);
      return false;
    }
  }

  /* ───────────────────────────────────────────────
   * 2. 정보 불러오기 (load)
   * ───────────────────────────────────────────────
   * 호출 예시:
   *   const data = DolbomData.load('sample');
   *   if (data) {
   *     document.getElementById('fName').value = data.name;
   *     document.getElementById('fAddress').value = data.address; // 페이지에 맞는 주소
   *   }
   * 
   * 반환:
   *   { name, phone, address, consent, isConsentValid } 또는 null
   */
  function load(currentPage) {
    try {
      var raw = _readRaw();
      if (!raw) return null;
      
      // 6개월 만료 체크
      if (_isExpired(raw.savedAt)) {
        console.log('[DolbomData] 저장된 정보가 만료됨 (6개월 경과) → 삭제');
        clear();
        return null;
      }
      
      // 페이지별 주소 자동 매핑
      var address = '';
      if (currentPage) {
        var addrField = ADDRESS_FIELD_MAP[currentPage];
        if (addrField && raw[addrField]) {
          address = raw[addrField];
        }
      }
      
      // 동의 유효성 체크
      var isConsentValid = _isConsentValid(raw);
      
      return {
        name: raw.name || '',
        phone: raw.phone || '',
        address: address,
        sampleAddress: raw.sampleAddress || '',
        bookingAddress: raw.bookingAddress || '',
        consent: raw.consent || null,
        consentTimestamp: raw.consentTimestamp || null,
        consentVersion: raw.consentVersion || null,
        isConsentValid: isConsentValid,
        savedAt: raw.savedAt
      };
      
    } catch (e) {
      console.error('[DolbomData] load 오류:', e);
      return null;
    }
  }

  /* ───────────────────────────────────────────────
   * 3. 동의 유효성 체크 (hasValidConsent)
   * ───────────────────────────────────────────────
   * 호출 예시:
   *   if (DolbomData.hasValidConsent()) {
   *     // 동의 모달 안 띄우고 바로 진행
   *   } else {
   *     // 동의 모달 띄우기
   *   }
   * 
   * 유효 조건:
   *   1) 동의 정보가 존재함
   *   2) 동의서 버전이 v3.0
   *   3) 저장된 지 6개월 안 지남
   *   4) 필수 동의 2개 모두 'Y'
   */
  function hasValidConsent() {
    var raw = _readRaw();
    if (!raw) return false;
    return _isConsentValid(raw);
  }

  /* ───────────────────────────────────────────────
   * 4. 정보 삭제 (clear)
   * ───────────────────────────────────────────────
   * 호출 예시:
   *   DolbomData.clear();
   * 
   * 사용 시점:
   *   - "제 정보가 아니에요" 버튼 클릭
   *   - 동의 철회 시
   *   - 6개월 만료 시 (자동)
   */
  function clear() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      console.log('[DolbomData] 정보 삭제 완료');
      return true;
    } catch (e) {
      console.error('[DolbomData] clear 오류:', e);
      return false;
    }
  }

  /* ───────────────────────────────────────────────
   * 5. 추천 채널(ch) 관리
   * ───────────────────────────────────────────────
   * URL의 ?ch=sj 파라미터를 읽어서 저장 + 다음 페이지로 자동 전달
   * 
   * 호출 예시:
   *   // 페이지 로드 시
   *   const ch = DolbomData.getChannel();
   *   if (ch) { document.getElementById('chName').textContent = ch; }
   * 
   *   // 페이지 이동 시
   *   const url = DolbomData.appendChannel('quote.html');
   *   // → 'quote.html?ch=sj'
   */
  function getChannel() {
    try {
      // 1순위: URL 파라미터에서 읽기
      var urlParams = new URLSearchParams(window.location.search);
      var chFromUrl = urlParams.get('ch');
      if (chFromUrl) {
        // URL에서 발견 → 저장 (다음 페이지에서 사용)
        localStorage.setItem(CHANNEL_KEY, chFromUrl);
        return chFromUrl;
      }
      
      // 2순위: localStorage에서 읽기
      return localStorage.getItem(CHANNEL_KEY) || '';
      
    } catch (e) {
      console.error('[DolbomData] getChannel 오류:', e);
      return '';
    }
  }
  
  function setChannel(ch) {
    try {
      if (ch) {
        localStorage.setItem(CHANNEL_KEY, ch);
      } else {
        localStorage.removeItem(CHANNEL_KEY);
      }
      return true;
    } catch (e) {
      return false;
    }
  }
  
  function appendChannel(url) {
    var ch = getChannel();
    if (!ch) return url;
    var separator = url.indexOf('?') >= 0 ? '&' : '?';
    return url + separator + 'ch=' + encodeURIComponent(ch);
  }

  /* ───────────────────────────────────────────────
   * 6. Apps Script로 동의 정보 전송 (sendConsent)
   * ───────────────────────────────────────────────
   * 동의서 모달 통과 후 자동으로 호출됨.
   * Code.gs의 handleConsent로 POST 요청 → [동의기록] 시트에 1행 추가
   * 
   * 호출 예시:
   *   DolbomData.sendConsent({
   *     name: '홍길동',
   *     phone: '01012345678',
   *     page: 'sample',
   *     consent: { required1:'Y', required2:'Y', optional1:'Y', optional2:'N' }
   *   }).then(function(result) {
   *     console.log('전송 완료:', result);
   *   });
   */
  var API_URL = 'https://script.google.com/macros/s/AKfycbwo33sv9L1y722IdcfUm_i_nhmgZCCQX-grPEXGYbLemeI3WUx-f3C1Mi8ZxunmZ6D6lw/exec';
  
  function sendConsent(data) {
    return new Promise(function(resolve, reject) {
      try {
        var payload = {
          type: 'consent',
          name: data.name,
          phone: data.phone,
          page: data.page || 'unknown',
          required1: _normalizeYN(data.consent.required1),
          required2: _normalizeYN(data.consent.required2),
          optional1: _normalizeYN(data.consent.optional1),
          optional2: _normalizeYN(data.consent.optional2),
          ip: ''  // IP는 서버에서 채울 수 없음 (보안상 클라이언트에서도 어려움)
        };
        
        fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(payload)
        })
        .then(function(r) { return r.text(); })
        .then(function(text) {
          try {
            var result = JSON.parse(text);
            console.log('[DolbomData] 동의 전송 완료:', result);
            resolve(result);
          } catch (e) {
            console.warn('[DolbomData] 응답 파싱 실패:', text);
            resolve({ success: true, raw: text });
          }
        })
        .catch(function(err) {
          console.error('[DolbomData] 동의 전송 실패:', err);
          reject(err);
        });
        
      } catch (e) {
        reject(e);
      }
    });
  }

  /* ───────────────────────────────────────────────
   * 내부 헬퍼 함수
   * ───────────────────────────────────────────────
   */
  
  // localStorage에서 원본 데이터 읽기
  function _readRaw() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  
  // 6개월 만료 체크
  function _isExpired(savedAt) {
    if (!savedAt) return true;
    try {
      var saved = new Date(savedAt).getTime();
      var now = Date.now();
      var sixMonths = EXPIRY_MONTHS * 30 * 24 * 60 * 60 * 1000;
      return (now - saved) > sixMonths;
    } catch (e) {
      return true;
    }
  }
  
  // 동의 유효성 종합 체크
  function _isConsentValid(raw) {
    if (!raw || !raw.consent) return false;
    if (raw.consentVersion !== CONSENT_VERSION) return false;
    if (_isExpired(raw.consentTimestamp || raw.savedAt)) return false;
    if (raw.consent.required1 !== 'Y') return false;
    if (raw.consent.required2 !== 'Y') return false;
    return true;
  }
  
  // Y/N 정규화 (true, 'Y', 'y', 1 → 'Y' 나머지 → 'N')
  function _normalizeYN(val) {
    if (val === true || val === 'Y' || val === 'y' || val === 1 || val === '1') {
      return 'Y';
    }
    return 'N';
  }

  /* ───────────────────────────────────────────────
   * 전역 객체로 노출
   * ───────────────────────────────────────────────
   */
  window.DolbomData = {
    save: save,
    load: load,
    clear: clear,
    hasValidConsent: hasValidConsent,
    getChannel: getChannel,
    setChannel: setChannel,
    appendChannel: appendChannel,
    sendConsent: sendConsent,
    
    // 디버그용
    _version: '1.0',
    _storageKey: STORAGE_KEY,
    _consentVersion: CONSENT_VERSION,
    _expiryMonths: EXPIRY_MONTHS
  };

  console.log('[DolbomData] v1.0 로드 완료');

})(window);
