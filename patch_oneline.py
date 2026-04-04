#!/usr/bin/env python3
"""
patch_oneline.py
날짜(260406) + 요일(월) + 휴무(· 휴무 : 현진 재문) 을 한 줄로 합치기
- daycard-hd CSS: space-between 제거, gap 추가
- offHtml: block div → inline span
- offHtml 위치: daycard-hd 안으로 이동
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

    # 1) CSS: daycard-hd → space-between 제거, gap+flex-wrap 추가
    old_css = '.daycard-hd{display:flex;justify-content:space-between;align-items:center;padding:16px 18px 12px}'
    new_css = '.daycard-hd{display:flex;align-items:center;padding:16px 18px 12px;gap:8px;flex-wrap:wrap}'
    if old_css in code:
        code = code.replace(old_css, new_css)
        changes.append('daycard-hd CSS (space-between→gap)')

    # 2) offHtml: <div class="daycard-off"> → inline <span>
    old_off = """const offHtml=offs.size?'<div class="daycard-off">휴무 : '+[...offs].join(' ')+'</div>':'';"""
    new_off = """const offHtml=offs.size?'<span style="font-size:11px;font-weight:500;opacity:.6">· 휴무 : '+[...offs].join(' ')+'</span>':'';"""
    if old_off in code:
        code = code.replace(old_off, new_off)
        changes.append('offHtml div→inline span')

    # 3) offHtml 위치 이동: daycard-hd 안으로 (dow 배지 뒤, </div> 앞)
    #    기존: >${dn}</span></div>  →  >${dn}</span>${offHtml}</div>
    old_hd_end = '>${dn}</span></div>'
    new_hd_end = '>${dn}</span>${offHtml}</div>'
    count = code.count(old_hd_end)
    if count > 0:
        code = code.replace(old_hd_end, new_hd_end)
        changes.append(f'offHtml을 daycard-hd 안으로 이동 ({count}곳)')

    # 4) 기존 위치에서 offHtml 제거: ${offHtml}<div class="daycard-body"> → <div class="daycard-body">
    #    줄바꿈/공백이 있을 수 있으므로 regex 사용
    pattern = r'\$\{offHtml\}\s*<div class="daycard-body">'
    replacement = '<div class="daycard-body">'
    matches = len(re.findall(pattern, code))
    if matches:
        code = re.sub(pattern, replacement, code)
        changes.append(f'기존 offHtml 위치 제거 ({matches}곳)')

    if code != original:
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"✅ {fpath}: {len(changes)}개 수정 완료!")
        for c in changes:
            print(f"   - {c}")
    else:
        print(f"⚠️ {fpath}: 변경 사항 없음 (패턴 불일치)")

print("\n완료!")
