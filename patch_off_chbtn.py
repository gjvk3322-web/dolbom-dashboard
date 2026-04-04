for fn in ['scheduler-gg.html', 'scheduler.html']:
    with open(fn, 'r') as f:
        c = f.read()
    
    changed = False

    # 1. 휴무 표시: "현진 휴무 · 재문 휴무" → "휴무 : 현진 재문"
    old_off = """[...offs].map(n=>n+' 휴무 ').join(' · ')"""
    new_off = """'휴무 : '+[...offs].join(' ')"""
    if old_off in c:
        c = c.replace(old_off, new_off)
        changed = True
        print(f'{fn}: 휴무 표시 형식 변경')

    # 2. 휴무 색상: 빨간색 → 주황/amber 색상 (daycard-off)
    old_color = 'class="daycard-off"'
    # daycard-off의 CSS를 찾아서 색상 변경
    if 'daycard-off' in c:
        # CSS에서 색상 변경 (var(--red) → var(--yellow) 또는 직접 amber 색)
        c = c.replace('.daycard-off{color:var(--red)', '.daycard-off{color:#EF9F27')
        # 혹시 다른 형식이면
        c = c.replace(".daycard-off{color:var(--red)", ".daycard-off{color:#EF9F27")
        changed = True
        print(f'{fn}: 휴무 색상 변경 (빨강→주황)')

    # 3. 월간 뷰 휴무 색상도 변경 (2293번 줄 근처)
    c = c.replace(
        "color:var(--red);opacity:.3;text-align:center;margin-top:6px\">휴무",
        "color:#EF9F27;opacity:.5;text-align:center;margin-top:6px\">휴무"
    )

    # 4. 채널명 버튼 추가 (채널 버튼 뒤 </div> 앞에)
    old_btn = """💬 채널 </button>
</div>"""
    new_btn = """💬 채널 </button>
<button onclick="if(currentChannelName){navigator.clipboard.writeText(currentChannelName).then(()=>toast('📋 채널명 복사: '+currentChannelName,'ok')).catch(()=>toast('복사 실패'));}else{toast('채널명 없음','error');}" style="flex:1;padding:12px;border-radius:10px;background:rgba(251,191,36,.08);color:var(--yellow);font-weight:900;font-size:13px;border:1px solid rgba(251,191,36,.2);cursor:pointer;font-family:var(--font)">📋 채널명</button>
</div>"""
    if old_btn in c:
        c = c.replace(old_btn, new_btn)
        changed = True
        print(f'{fn}: 채널명 버튼 추가')
    else:
        print(f'{fn}: 채널 버튼 매칭 실패 - 수동 확인 필요')

    if changed:
        with open(fn, 'w') as f:
            f.write(c)
        print(f'{fn}: 완료!')
