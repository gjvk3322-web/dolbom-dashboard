/**
 * 돌봄매트 내부 페이지 보호 시스템
 * 
 * 작동 방식:
 * 1. 페이지 로드 즉시 실행
 * 2. localStorage에서 30일 이내 인증 기록 확인
 * 3. 인증 안됐으면 비밀번호 화면 표시 + 페이지 내용 숨김
 * 4. 비밀번호 맞으면 인증 기록 저장 + 페이지 표시
 * 
 * 비밀번호 변경: PASSWORD 변수 수정
 * 인증 기간 변경: AUTH_DAYS 변수 수정
 */

(function() {
    'use strict';

    // ===== 설정 =====
    const PASSWORD = '1123';           // 비밀번호
    const AUTH_DAYS = 30;              // 인증 유효 기간 (일)
    const AUTH_KEY = 'dolbom_auth';    // localStorage 키 이름

    // ===== 인증 확인 =====
    function isAuthenticated() {
        try {
            const data = localStorage.getItem(AUTH_KEY);
            if (!data) return false;
            
            const parsed = JSON.parse(data);
            const now = Date.now();
            const expiry = parsed.expiry || 0;
            
            // 만료된 경우
            if (now > expiry) {
                localStorage.removeItem(AUTH_KEY);
                return false;
            }
            
            return true;
        } catch (e) {
            return false;
        }
    }

    // ===== 인증 저장 =====
    function saveAuth() {
        const expiry = Date.now() + (AUTH_DAYS * 24 * 60 * 60 * 1000);
        localStorage.setItem(AUTH_KEY, JSON.stringify({ expiry: expiry }));
    }

    // ===== 비밀번호 화면 표시 =====
    function showPasswordScreen() {
        // 페이지 내용 숨김 (보안)
        document.documentElement.style.visibility = 'hidden';
        
        // DOM이 준비되면 비밀번호 화면 표시
        const showScreen = () => {
            document.documentElement.style.visibility = 'visible';
            
            // 기존 body 내용 백업 후 비움
            const originalBodyHTML = document.body ? document.body.innerHTML : '';
            const originalBodyStyle = document.body ? document.body.getAttribute('style') || '' : '';
            
            document.body.innerHTML = `
                <div id="dolbom-auth-screen" style="
                    position: fixed;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: #f5f6fa;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif;
                ">
                    <div style="
                        background: white;
                        padding: 40px 32px;
                        border-radius: 12px;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
                        width: 90%;
                        max-width: 360px;
                        text-align: center;
                    ">
                        <div style="
                            font-size: 18px;
                            font-weight: 600;
                            color: #2c3e50;
                            margin-bottom: 8px;
                        ">돌봄매트</div>
                        <div style="
                            font-size: 13px;
                            color: #95a5a6;
                            margin-bottom: 24px;
                        ">비밀번호를 입력하세요</div>
                        
                        <input 
                            type="password" 
                            id="dolbom-pw-input"
                            autofocus
                            style="
                                width: 100%;
                                padding: 12px 14px;
                                font-size: 16px;
                                border: 1px solid #dfe4ea;
                                border-radius: 8px;
                                outline: none;
                                box-sizing: border-box;
                                margin-bottom: 12px;
                                -webkit-appearance: none;
                            "
                        />
                        
                        <div id="dolbom-pw-error" style="
                            font-size: 12px;
                            color: #e74c3c;
                            min-height: 16px;
                            margin-bottom: 12px;
                        "></div>
                        
                        <button 
                            id="dolbom-pw-submit"
                            style="
                                width: 100%;
                                padding: 12px;
                                background: #3498db;
                                color: white;
                                border: none;
                                border-radius: 8px;
                                font-size: 15px;
                                font-weight: 500;
                                cursor: pointer;
                            "
                        >확인</button>
                    </div>
                </div>
            `;
            
            const input = document.getElementById('dolbom-pw-input');
            const button = document.getElementById('dolbom-pw-submit');
            const error = document.getElementById('dolbom-pw-error');
            
            const submit = () => {
                if (input.value === PASSWORD) {
                    saveAuth();
                    // 페이지 새로고침 → 인증 확인 → 정상 표시
                    location.reload();
                } else {
                    error.textContent = '비밀번호가 올바르지 않습니다';
                    input.value = '';
                    input.focus();
                }
            };
            
            button.addEventListener('click', submit);
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') submit();
            });
        };
        
        if (document.body) {
            showScreen();
        } else {
            document.addEventListener('DOMContentLoaded', showScreen);
        }
    }

    // ===== 메인 실행 =====
    if (!isAuthenticated()) {
        showPasswordScreen();
    }
    // 인증되어 있으면 아무것도 안 함 → 페이지 정상 표시
})();
