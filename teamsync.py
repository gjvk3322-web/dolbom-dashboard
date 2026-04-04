import re

configs = {
    'scheduler-gg.html': ('경기', 'gg_teams'),
    'scheduler.html': ('부산', 'bs_teams')
}

sync_func = '''
// ===== 팀설정 시트 자동 동기화 =====
function syncTeamsToSheet(){
  if(!isAdmin)return;
  const teamData=teams.map((t,i)=>({
    region:'__REGION__',teamNum:i+1,sasu:t[0]||'',busasu:t.slice(1).join(',')
  }));
  fetch(SHEET_REPORT_URL,{
    method:'POST',mode:'no-cors',
    headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({action:'updateTeamConfig',data:teamData})
  }).then(()=>console.log('[team-sync] OK:',teamData.length+'팀'))
  .catch(e=>console.log('[team-sync] error:',e));
}
'''

for fn, (region, fb_key) in configs.items():
    with open(fn, 'r') as f:
        c = f.read()

    if 'syncTeamsToSheet' in c:
        print(f'{fn}: 이미 적용됨')
        continue

    func_code = sync_func.replace('__REGION__', region)
    
    marker = '// 제품명'
    if marker in c:
        c = c.replace(marker, func_code + '\n' + marker, 1)
    else:
        print(f'{fn}: 삽입 위치 못 찾음')
        continue

    old = f"fbSave('{fb_key}',teams);renderTeam()"
    new = f"fbSave('{fb_key}',teams);renderTeam();syncTeamsToSheet()"
    c = c.replace(old, new)

    with open(fn, 'w') as f:
        f.write(c)
    
    print(f'{fn}: 팀설정 동기화 패치 완료!')
