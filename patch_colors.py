for fn in ['scheduler-gg.html', 'scheduler.html']:
    with open(fn, 'r') as f:
        c = f.read()
    
    changes = 0

    # 1. 휴무 텍스트 색상: 빨간색 → 흰색
    old_off_css = '.daycard-off{padding:6px 18px;font-size:11px;color:var(--red);font-weight:500}'
    new_off_css = '.daycard-off{padding:6px 18px;font-size:11px;color:#fff;font-weight:500;opacity:.7}'
    if old_off_css in c:
        c = c.replace(old_off_css, new_off_css)
        changes += 1
    # 이전 패치에서 #EF9F27로 바꿨을 수도 있음
    old_off_css2 = '.daycard-off{padding:6px 18px;font-size:11px;color:#EF9F27;font-weight:500}'
    if old_off_css2 in c:
        c = c.replace(old_off_css2, new_off_css)
        changes += 1

    # 2. 요일 색상 CSS 추가 (토=파랑, 일=빨강, 나머지=흰색)
    # 기존 daycard-dow 스타일 뒤에 요일별 색상 추가
    dow_css = '.daycard-dow{font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px}'
    dow_css_new = '.daycard-dow{font-size:12px;font-weight:700;padding:4px 10px;border-radius:6px}.dow-sun{color:var(--red)}.dow-sat{color:#5B9BF5}.dow-mon,.dow-tue,.dow-wed,.dow-thu,.dow-fri{color:#fff}'
    if dow_css in c and '.dow-sun' not in c:
        c = c.replace(dow_css, dow_css_new)
        changes += 1

    # 3. 최신화/재배정 버튼 색상 → 검은 텍스트
    # 최신화 버튼
    c = c.replace(
        '>🔄 최신화</button>',
        ' style="color:#000">🔄 최신화</button>'
    ) if '>🔄 최신화</button>' in c and 'style="color:#000">🔄 최신화' not in c else c
    
    # 재배정 버튼  
    c = c.replace(
        '>🤖 재배정</button>',
        ' style="color:#000">🤖 재배정</button>'
    ) if '>🤖 재배정</button>' in c and 'style="color:#000">🤖 재배정' not in c else c

    with open(fn, 'w') as f:
        f.write(c)
    
    print(f'{fn}: {changes}개 색상 변경 완료!')
