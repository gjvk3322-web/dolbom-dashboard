#!/usr/bin/env python3
"""
patch_sync_fix.py
syncTeamsToSheet 잔여 코드 제거
"""
import glob

files = glob.glob('scheduler*.html')

for fpath in files:
    with open(fpath, 'r', encoding='utf-8') as f:
        code = f.read()
    original = code

    # 잔여 코드 패턴: 새 함수 닫는 } 뒤에 남은 옛 코드
    # 팀 버전 잔여
    old_remnant = """},
    body:JSON.stringify({action:'updateTeamConfig',data:teamData})
  }).then(()=>console.log('[team-sync] OK:',teamData.length+'팀 '))
  .catch(e=>console.log('[team-sync] error:',e));
}"""

    if old_remnant in code:
        code = code.replace(old_remnant, '}')
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"✅ {fpath}: 잔여 코드 제거 완료!")
    else:
        print(f"⚠️ {fpath}: 패턴 불일치")

print("\n완료!")
