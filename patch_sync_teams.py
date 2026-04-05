#!/usr/bin/env python3
"""
patch_sync_teams.py
syncTeamsToSheet: 팀 단위 → 사람 단위로 변경
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
    
    # region 판별
    region = '경기' if 'scheduler-gg' in fpath or 'gg' in fpath else '부산'
    
    # regex로 syncTeamsToSheet 함수 전체 교체
    pattern = r'function syncTeamsToSheet\(\)\{[^}]*teamData=teams\.map\(\(t,i\)=>\(\{[^}]*\}\)\);[^}]*\}'
    
    new_sync = f"""function syncTeamsToSheet(){{
  if(!isAdmin)return;
  const teamData=[];
  teams.forEach((t,i)=>{{t.forEach((name,j)=>{{teamData.push({{region:'{region}',teamNum:i+1,name:name,rank:j===0?'사수':'부사수'}});}});}});
  fetch(SHEET_REPORT_URL,{{
    method:'POST',mode:'no-cors',
    headers:{{'Content-Type':'text/plain'}},
    body:JSON.stringify({{action:'updateTeamConfig',data:teamData}})
  }}).then(()=>console.log('[team-sync] OK:',teamData.length+'명'))
  .catch(e=>console.log('[team-sync] error:',e));
}}"""

    match = re.search(pattern, code, re.DOTALL)
    if match:
        code = code[:match.start()] + new_sync + code[match.end():]
        with open(fpath, 'w', encoding='utf-8') as f:
            f.write(code)
        print(f"✅ {fpath}: syncTeamsToSheet 사람단위 변경 완료! (region='{region}')")
    else:
        print(f"⚠️ {fpath}: regex 패턴 불일치 — 수동 확인 필요")

print("\n완료!")
