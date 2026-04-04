#!/usr/bin/env python3
"""
patch_colors2.py
- 요일 배지: 월~금 흰색, 토 파랑, 일 빨강
- 최신화/재배정 버튼: 기본 텍스트색 (다크모드=흰색, 라이트모드=검정)
"""
import re, glob, os

files = glob.glob('scheduler*.html')
if not files:
    print("scheduler*.html 파일을 찾을 수 없습니다!")
    exit(1)

for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        code = f.read()
    
    original = code
    changes = 0
    
    # --- 1) 요일 배지 색상 변경 ---
    # 월~금: 흰색 (배경 투명, 글자 흰색)
    weekday_map = {
        'dow-mon': ('rgba(255,255,255,.15)', '#fff'),
        'dow-tue': ('rgba(255,255,255,.15)', '#fff'),
        'dow-wed': ('rgba(255,255,255,.15)', '#fff'),
        'dow-thu': ('rgba(255,255,255,.15)', '#fff'),
        'dow-fri': ('rgba(255,255,255,.15)', '#fff'),
        # 토: 파랑
        'dow-sat': ('rgba(90,200,250,.15)', 'var(--blue)'),
        # 일: 빨강
        'dow-sun': ('rgba(255,69,58,.15)', 'var(--red)'),
    }
    
    for cls, (bg, color) in weekday_map.items():
        # Match .dow-xxx{background:...;color:...}
        pattern = r'\.' + cls + r'\{background:[^}]*?;color:[^}]*?\}'
        replacement = f'.{cls}{{background:{bg};color:{color}}}'
        new_code = re.sub(pattern, replacement, code)
        if new_code != code:
            changes += 1
        code = new_code
    
    # --- 2) 최신화 버튼 색상: color:var(--green) → color:var(--text) ---
    # refreshBtn
    old_refresh = 'color:var(--green)">🔄 최신화'
    new_refresh = 'color:var(--text)">🔄 최신화'
    if old_refresh in code:
        code = code.replace(old_refresh, new_refresh)
        changes += 1
    # 혹시 다른 형태
    old_refresh2 = "color:var(--green)\">🔄 최신화"
    new_refresh2 = "color:var(--text)\">🔄 최신화"
    if old_refresh2 in code and new_refresh2 not in code:
        code = code.replace(old_refresh2, new_refresh2)
        changes += 1
    
    # --- 3) 재배정 버튼 색상: color:var(--yellow) → color:var(--text) ---
    old_reassign = 'color:var(--yellow)">🐣 재배정'
    new_reassign = 'color:var(--text)">🐣 재배정'
    if old_reassign in code:
        code = code.replace(old_reassign, new_reassign)
        changes += 1
    old_reassign2 = "color:var(--yellow)\">🐣 재배정"
    new_reassign2 = "color:var(--text)\">🐣 재배정"
    if old_reassign2 in code and new_reassign2 not in code:
        code = code.replace(old_reassign2, new_reassign2)
        changes += 1
    
    if code != original:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"{fpath}: {changes}개 색상 변경 완료!")
    else:
        print(f"{fpath}: 변경 사항 없음 (이미 적용됨 또는 패턴 불일치)")

print("\n완료! git add -A && git commit && git push 해주세요.")
