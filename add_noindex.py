#!/usr/bin/env python3
"""
my.dolbommat.com 내부용 페이지에 noindex 메타태그 일괄 추가
- 공개 페이지는 건드리지 않음
- 이미 noindex 있는 파일은 건너뜀
- 작업 전 자동 백업 생성
"""

import os
import re
import shutil
from datetime import datetime
from pathlib import Path

# ==================================================
# 설정
# ==================================================

# 작업 폴더 (대장님 맥북 기준)
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
    # index.html은 이미 처리했으므로 제외 (스킵 로직이 알아서 처리)
}

# 추가할 메타태그
NOINDEX_META = '''    <!-- 검색엔진 노출 차단 (자동 추가) -->
    <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
    <meta name="googlebot" content="noindex, nofollow">
    <meta name="naverbot" content="noindex, nofollow">
    <meta name="yeti" content="noindex, nofollow">
'''

# ==================================================
# 메인 작업
# ==================================================

def main():
    if not TARGET_DIR.exists():
        print(f"❌ 폴더를 찾을 수 없어요: {TARGET_DIR}")
        return

    # 백업 폴더 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_dir = TARGET_DIR / f"backup_noindex_{timestamp}"
    backup_dir.mkdir(exist_ok=True)

    # 모든 HTML 파일 스캔
    html_files = sorted(TARGET_DIR.glob("*.html"))
    
    print("=" * 60)
    print(f"📂 작업 폴더: {TARGET_DIR}")
    print(f"💾 백업 폴더: {backup_dir.name}")
    print(f"🔍 발견된 HTML 파일: {len(html_files)}개")
    print("=" * 60)
    print()

    # 결과 카운트
    added = []
    skipped_public = []
    skipped_already = []
    skipped_no_head = []
    errors = []

    for html_file in html_files:
        filename = html_file.name
        
        # 1. 공개 페이지는 건너뜀
        if filename in PUBLIC_PAGES:
            skipped_public.append(filename)
            continue
        
        try:
            # 2. 파일 읽기
            content = html_file.read_text(encoding="utf-8")
            
            # 3. 이미 noindex가 있으면 건너뜀
            if re.search(r'<meta\s+name=["\']robots["\']\s+content=["\'][^"\']*noindex', 
                        content, re.IGNORECASE):
                skipped_already.append(filename)
                continue
            
            # 4. <head> 태그 찾기
            head_match = re.search(r'(<head[^>]*>)', content, re.IGNORECASE)
            if not head_match:
                skipped_no_head.append(filename)
                continue
            
            # 5. 백업 (원본 보존)
            shutil.copy2(html_file, backup_dir / filename)
            
            # 6. <head> 바로 다음에 noindex 메타태그 삽입
            new_content = content.replace(
                head_match.group(1),
                head_match.group(1) + "\n" + NOINDEX_META,
                1  # 첫 번째 매치만
            )
            
            # 7. 파일에 쓰기
            html_file.write_text(new_content, encoding="utf-8")
            added.append(filename)
            
        except Exception as e:
            errors.append((filename, str(e)))

    # ==================================================
    # 결과 출력
    # ==================================================
    print("✅ noindex 추가 완료:", len(added), "개")
    for f in added:
        print(f"   + {f}")
    print()
    
    print("⏭️  공개 페이지 (건너뜀):", len(skipped_public), "개")
    for f in skipped_public:
        print(f"   - {f}")
    print()
    
    if skipped_already:
        print("⏭️  이미 noindex 있음 (건너뜀):", len(skipped_already), "개")
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
    print("=" * 60)

if __name__ == "__main__":
    main()
