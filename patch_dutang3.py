import re

for fn in ['scheduler-gg.html', 'scheduler.html']:
    with open(fn, 'r') as f:
        lines = f.readlines()
    
    # "3순위" + "남는 사람" 이 포함된 줄 찾기
    target = None
    for i, line in enumerate(lines):
        if '3' in line and ('남는' in line or 'freeP' in line):
            # 다음 줄이 freeP 인지 확인
            if i+1 < len(lines) and 'freeP' in lines[i+1]:
                target = i
                break
            elif 'freeP' in line:
                target = i - 1  # 바로 윗줄이 주석
                break
    
    if target is None:
        # 직접 freeP=avail2.filter 줄 찾기
        for i, line in enumerate(lines):
            if 'freeP=avail2.filter(e=>!pmUsed.has(e))' in line and 'gP=makeGroups' in lines[i+1]:
                target = i - 1
                break
    
    if target is None:
        print(f'{fn}: 대상 줄을 찾을 수 없음')
        continue
    
    # 들여쓰기 추출
    indent = ''
    freeP_line = lines[target + 1]
    match = re.match(r'^(\s*)', freeP_line)
    if match:
        indent = match.group(1)
    
    # 두탕 코드 생성
    dutang_code = f"""{indent}// 3순위 : 두탕 (pmUsed 무시하고 오전팀 재사용)
{indent}if(!A[j.id]&&amTeamInfo.length){{
{indent}  amTeamInfo.forEach(t=>{{
{indent}    t._dist2=(t.lastGeo&&pmGeo)?hav(t.lastGeo.lat,t.lastGeo.lng,pmGeo.lat,pmGeo.lng):9999;
{indent}  }});
{indent}  amTeamInfo.sort((a,b)=>a._dist2-b._dist2);
{indent}  A[j.id]=[...amTeamInfo[0].team].sort();
{indent}  amTeamInfo[0].pmCount++;
{indent}  return;
{indent}}}
{indent}// 4순위 : 남는 사람
"""
    
    # 기존 주석줄을 두탕 코드로 교체
    lines[target] = dutang_code
    # 기존 주석줄 제거 (이미 교체됨)
    
    with open(fn, 'w') as f:
        f.writelines(lines)
    
    print(f'{fn}: 두탕 패치 완료! (라인 {target+1})')
