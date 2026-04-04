for fn in ['scheduler-gg.html', 'scheduler.html']:
    with open(fn, 'r') as f:
        lines = f.readlines()
    
    changed = False

    # 1. 휴무 형식 변경: "n+' 휴무 '" → "'휴무 : '+join(' ')"
    for i, line in enumerate(lines):
        if "offs].map(n=>n+'" in line and "휴무" in line and "join" in line:
            old = lines[i]
            lines[i] = old.replace(
                """.map(n=>n+' 휴무 ').join(' · ')""",
                """.join(' ')"""
            ).replace(
                """'<div class="daycard-off">'+""",
                """'<div class="daycard-off">휴무 : '+"""
            )
            if lines[i] != old:
                changed = True
                print(f'{fn} line {i+1}: 휴무 형식 변경')

    # 2. 채널명 버튼 추가 (채널 버튼 다음 줄의 </div> 앞에)
    for i, line in enumerate(lines):
        if '채널 </button>' in line and 'business.kakao' in line:
            # 다음 줄이 </div>인지 확인
            if i+1 < len(lines) and '</div>' in lines[i+1].strip():
                indent = lines[i+1].replace(lines[i+1].lstrip(), '')
                btn = indent + """<button onclick="if(typeof currentChannelName!=='undefined'&&currentChannelName){navigator.clipboard.writeText(currentChannelName).then(()=>toast('📋 채널명: '+currentChannelName,'ok')).catch(()=>toast('복사실패'));}else{toast('채널명 없음','error');}" style="flex:1;padding:12px;border-radius:10px;background:rgba(251,191,36,.08);color:var(--yellow);font-weight:900;font-size:13px;border:1px solid rgba(251,191,36,.2);cursor:pointer;font-family:var(--font)">📋 채널명</button>\n"""
                lines.insert(i+1, btn)
                changed = True
                print(f'{fn} line {i+2}: 채널명 버튼 추가')
            break

    if changed:
        with open(fn, 'w') as f:
            f.writelines(lines)
        print(f'{fn}: 완료!')
    else:
        print(f'{fn}: 변경 없음')
