#!/usr/bin/env python3
"""
my.dolbommat.com 내부용 페이지에 auth.js 스크립트 일괄 추가
- 공개 페이지는 건드리지 않음
- 이미 auth.js 있는 파일은 건너뜀
- 작업 전 자동 백업 생성
- <head> 태그 안에서 가장 위쪽에 삽입 (다른 코드 실행 전 차단)
"""

import os
import re
import shutil
from datetime import datetime
from pathlib import Path

# ==================================================
# 설정
# ==================================================

TARGET_DIR = Path.home() / "dolbom-dashboard"

# 공개 페이지 목록 (이 파일들은 건드리지 않음)
PUBLIC_PAGES = {
    "quote.html",
    "sample.html",
    "map.html",
    "booking.html",
    "review-event.html",
    "referral.html",
    "notice.html",
    "guide.html",
    "index.html",  # 이미 리다이렉트 페이지로 처리됨
}

# 추가할 스크립트 태그
AUTH_SCRIPT = '    <script src="/auth.js"></script>\n'

# ==================================================
# 메인 작업
# ==================================================

def main():
    if not TARGET_DIR.exists():
        print(f"❌ 폴더를 찾을 수 없어요: {TARGET_DIR}")
        return

    # auth.js 파일이 있는지 확인
    auth_js = TARGET_DIR / "auth.js"
    if not auth_js.exists():
        print(f"⚠️  먼저 auth.js를 {TARGET_DIR} 에 복사해주세요!")
        print(f"   명령어: cp ~/Downloads/auth.js {TARGET_DIR}/")
        return

    # 백업 폴더 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = TARGET_DIR / f"backup_auth_{timestamp}"
    backup_dir.mkdir(exist_ok=True)

    # 모든 HTML 파일 스캔
    html_files = sorted(TARGET_DIR.glob("*.html"))
    
    print("=" * 60)
    print(f"📂 작업 폴더: {TARGET_DIR}")
    print(f"💾 백업 폴더: {backup_dir.name}")
    print(f"🔍 발견된 HTML 파일: {len(html_files)}개")
    print(f"🔒 비밀번호 보호 추가 작업 시작")
    print("=" * 60)
    print()

    added = []
    skipped_public = []
    skipped_already = []
    skipped_no_head = []
    errors = []

    for html_file in html_files:
        filename = html_file.name
        
        if filename in PUBLIC_PAGES:
            skipped_public.append(filename)
            continue
        
        try:
            content = html_file.read_text(encoding="utf-8")
            
            # 이미 auth.js 있으면 건너뜀
            if 'auth.js' in content:
                skipped_already.append(filename)
                continue
            
            # <head> 태그 찾기
            head_match = re.search(r'(<head[^>]*>)', content, re.IGNORECASE)
            if not head_match:
                skipped_no_head.append(filename)
                continue
            
            # 백업
            shutil.copy2(html_file, backup_dir / filename)
            
            # <head> 바로 다음에 auth.js 스크립트 삽입
            # ★ 가장 먼저 실행되도록 head 시작 부분에 넣음
            new_content = content.replace(
                head_match.group(1),
                head_match.group(1) + "\n" + AUTH_SCRIPT,
                1
            )
            
            html_file.write_text(new_content, encoding="utf-8")
            added.append(filename)
            
        except Exception as e:
            errors.append((filename, str(e)))

    # 결과 출력
    print("✅ 비밀번호 보호 추가 완료:", len(added), "개")
    for f in added:
        print(f"   + {f}")
    print()
    
    print("⏭️  공개 페이지 (건너뜀):", len(skipped_public), "개")
    for f in skipped_public:
        print(f"   - {f}")
    print()
    
    if skipped_already:
        print("⏭️  이미 auth.js 있음 (건너뜀):", len(skipped_already), "개")
        for f in skipped_already:
            print(f"   - {f}")
        print()
    
    if skipped_no_head:
        print("⚠️  <head> 태그 없음 (건너뜀):", len(skipped_no_head), "개")
        for f in skipped_no_head:
            print(f"   - {f}")
        print()
    
    if errors:
        print("❌ 에러 발생:", len(errors), "개")
        for f, err in errors:
            print(f"   ! {f}: {err}")
        print()
    
    print("=" * 60)
    print(f"📊 요약: 총 {len(html_files)}개 중 {len(added)}개 처리 완료")
    print(f"💾 원본은 {backup_dir.name} 에 백업되어 있어요")
    print(f"🔑 비밀번호: 1123 (auth.js 안에 설정됨)")
    print("=" * 60)

if __name__ == "__main__":
    main()
