#!/usr/bin/env python3
"""
patch_fix2.py
남아있는 ${offHtml} 중복 제거
- ${offHtml}${(()=>{ → ${(()=>{
"""
import glob

files = glob.glob('scheduler*.html')
if not files:
    print("scheduler*.html 파일을 찾을 수 없습니다!")
    exit(1)

for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        code = f.read()
    
    old = '${offHtml}${(()=>{'
    new = '${(()=>{'
    
    count = code.count(old)
    if count > 0:
        code = code.replace(old, new)
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"✅ {fpath}: offHtml 중복 {count}개 제거 완료!")
    else:
        print(f"⚠️ {fpath}: 해당 패턴 없음")

print("\n완료!")
