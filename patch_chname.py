for fn in ['scheduler-gg.html', 'scheduler.html']:
    with open(fn, 'r') as f:
        c = f.read()

    changed = False

    # 1. reportJobId 선언 옆에 currentChannelName 추가
    if 'currentChannelName' not in c:
        c = c.replace(
            "let reportJobId='';",
            "let reportJobId='';let currentChannelName='';"
        )
        changed = True

    # 2. openReport에서 channelName 저장
    if 'currentChannelName==' not in c and 'currentChannelName=' not in c.split('let currentChannelName')[1][:50] if 'let currentChannelName' in c else True:
        c = c.replace(
            "reportJobId=jobId;",
            "reportJobId=jobId;currentChannelName=(J.find(jj=>jj.id===jobId)||{}).channelName||'';"
        )
        changed = True

    # 3. 채널 버튼 옆에 채널명 버튼 추가
    old_channel_btn = """onclick="window.open('https://business.kakao.com/_UMyBK/chats?t_src=business_partnercenter&t_ch=lnb','_blank')" style="flex:1;padding:12px;border-radius:10px;background:rgba(251,191,36,.15);color:var(--yellow);font-weight:900;font-size:13px;border:1px solid rgba(251,191,36,.3);cursor:pointer;font-family:var(--font)">💬 채널 </button>"""
    
    new_channel_btns = """onclick="window.open('https://business.kakao.com/_UMyBK/chats?t_src=business_partnercenter&t_ch=lnb','_blank')" style="flex:1;padding:12px;border-radius:10px;background:rgba(251,191,36,.15);color:var(--yellow);font-weight:900;font-size:13px;border:1px solid rgba(251,191,36,.3);cursor:pointer;font-family:var(--font)">💬 채널 </button>
<button onclick="if(currentChannelName){navigator.clipboard.writeText(currentChannelName).then(()=>toast('📋 채널명 복사: '+currentChannelName,'ok')).catch(()=>toast('복사 실패'));}else{toast('채널명 없음','error');}" style="flex:1;padding:12px;border-radius:10px;background:rgba(251,191,36,.08);color:var(--yellow);font-weight:900;font-size:13px;border:1px solid rgba(251,191,36,.2);cursor:pointer;font-family:var(--font)">📋 채널명</button>"""

    if old_channel_btn in c:
        c = c.replace(old_channel_btn, new_channel_btns)
        changed = True
    else:
        print(f'{fn}: 채널 버튼 매칭 실패 - 수동 확인 필요')

    if changed:
        with open(fn, 'w') as f:
            f.write(c)
        print(f'{fn}: 채널명 버튼 패치 완료!')
    else:
        print(f'{fn}: 변경 없음')
