for fn in ['scheduler-gg.html', 'scheduler.html']:
    with open(fn, 'r') as f:
        c = f.read()

    old = '    // 3순위 : 남는 사람\n    const freeP=avail2.filter(e=>!pmUsed.has(e));'

    new = '''    // 3순위 : 두탕 (pmUsed 무시하고 오전팀 재사용)
    if(!A[j.id]&&amTeamInfo.length){
      amTeamInfo.forEach(t=>{
        t._dist2=(t.lastGeo&&pmGeo)?hav(t.lastGeo.lat,t.lastGeo.lng,pmGeo.lat,pmGeo.lng):9999;
      });
      amTeamInfo.sort((a,b)=>a._dist2-b._dist2);
      A[j.id]=[...amTeamInfo[0].team].sort();
      amTeamInfo[0].pmCount++;
      return;
    }
    // 4순위 : 남는 사람
    const freeP=avail2.filter(e=>!pmUsed.has(e));'''

    if old in c:
        c = c.replace(old, new)
        with open(fn, 'w') as f:
            f.write(c)
        print(f'{fn}: 두탕 패치 완료!')
    else:
        print(f'{fn}: 매칭 실패')
