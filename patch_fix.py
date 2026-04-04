#!/usr/bin/env python3
"""
patch_fix.py
1) 휴무 중복 표시 수정 (기존 위치의 offHtml 제거)
2) 요일 네모 박스 제거 (daycard-dow padding/border-radius 제거 + dow-xxx background 제거)
"""
import re, glob

files = glob.glob('scheduler*.html')
if not files:
    print("scheduler*.html 파일을 찾을 수 없습니다!")
    exit(1)

for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        code = f.read()
    original = code
    changes = []

    # === 1) 휴무 중복 제거 ===
    # offHtml이 daycard-hd 안에 이미 들어갔으므로, 바깥의 ${offHtml}을 제거
    # 여러 패턴 시도
    
    # 패턴 A: ${offHtml}<div class="daycard-body">  (공백 없음)
    if '${offHtml}<div class="daycard-body">' in code:
        code = code.replace('${offHtml}<div class="daycard-body">', '<div class="daycard-body">')
        changes.append('휴무 중복 제거 (패턴A)')
    
    # 패턴 B: 줄바꿈 포함
    code_new = re.sub(r'\$\{offHtml\}\s*<div class="daycard-body">', '<div class="daycard-body">', code)
    if code_new != code:
        code = code_new
        changes.append('휴무 중복 제거 (패턴B-regex)')
    
    # 패턴 C: ${offHtml} 가 별도 줄에 있는 경우
    # 예: ...\n${offHtml}\n<div class="daycard-body">
    code_new = re.sub(r'\n\s*\$\{offHtml\}\s*\n(\s*<div class="daycard-body">)', r'\n\1', code)
    if code_new != code:
        code = code_new
        changes.append('휴무 중복 제거 (패턴C-별도줄)')

    # === 2) 요일 네모 박스 제거 ===
    # daycard-dow CSS에서 padding, border-radius 제거
    old_dow_css = '.daycard-dow{font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px}'
    new_dow_css = '.daycard-dow{font-size:12px;font-weight:700}'
    if old_dow_css in code:
        code = code.replace(old_dow_css, new_dow_css)
        changes.append('daycard-dow 박스 스타일 제거')

    # === 3) 모든 dow-xxx 클래스에서 background 제거 (색상만 유지) ===
    # .dow-mon{background:rgba(255,255,255,.15);color:#fff} → .dow-mon{color:#fff}
    dow_pattern = r'\.dow-(mon|tue|wed|thu|fri|sat|sun)\{background:[^;]+;(color:[^}]+)\}'
    dow_replacement = r'.dow-\1{\2}'
    code_new = re.sub(dow_pattern, dow_replacement, code)
    if code_new != code:
        count = len(re.findall(dow_pattern, code))
        code = code_new
        changes.append(f'요일 배경색 제거 ({count}개)')

    if code != original:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"✅ {fpath}: {len(changes)}개 수정 완료!")
        for c in changes:
            print(f"   - {c}")
    else:
        print(f"⚠️ {fpath}: 변경 사항 없음")

print("\n완료!")
