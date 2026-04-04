for fn, region, fb_key in [('scheduler-gg.html', '경기', 'gg_teams'), ('scheduler.html', '부산', 'bs_teams')]:
    with open(fn, 'r') as f:
        c = f.read()
    
    changed = False
    
    # 1. syncTeamsToSheet 함수 추가
    sync_func = """
// 팀설정 → 시트 자동 반영
function syncTeamsToSheet(){
  const data=teams.map((t,i)=>{
    const sasu=t[0]||'';
    const busasu=t.slice(1).join(',');
    return {region:'""" + region + """',num:i+1,sasu:sasu,busasu:busasu};
  });
  fetch(SHEET_REPORT_URL,{
    method:'POST',
    mode:'no-cors',
    headers:{'Content-Type':'text/plain'},
    body:JSON.stringify({action:'updateTeams',region:'""" + region + """',data:data})
  }).then(()=>{
    console.log('[team-sync] OK:',data.length+'팀');
  }).catch(e=>console.log('[team-sync] error:',e));
}
"""
    
    marker = "// 제품명"
    if marker in c and 'syncTeamsToSheet' not in c:
        c = c.replace(marker, sync_func + '\n' + marker)
        changed = True
        print(f'{fn}: syncTeamsToSheet 함수 추가')
    
    # 2. fbSave 호출 뒤에 syncTeamsToSheet() 추가
    fb_save = "fbSave('" + fb_key + "',teams)"
    fb_save_with_sync = "fbSave('" + fb_key + "',teams);syncTeamsToSheet()"
    
    if fb_save in c and fb_save_with_sync not in c:
        c = c.replace(fb_save, fb_save_with_sync)
        changed = True
        count = c.count('syncTeamsToSheet()')
        print(f'{fn}: fbSave 후 syncTeamsToSheet 호출 {count}곳 추가')
    
    if changed:
        with open(fn, 'w') as f:
            f.write(c)
        print(f'{fn}: 패치 완료!')
    else:
        print(f'{fn}: 변경 없음')
