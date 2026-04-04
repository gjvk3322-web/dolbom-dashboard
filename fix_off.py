import re
for fn in ['scheduler-gg.html', 'scheduler.html']:
    with open(fn, 'r') as f:
        c = f.read()
    pattern = r"\.map\(n=>n\+['\"].*?휴무.*?['\"].*?\)\.join\(['\"].*?['\"].*?\)"
    new_c = re.sub(pattern, ".join(' ')", c)
    if new_c != c:
        with open(fn, 'w') as f:
            f.write(new_c)
        print(f'{fn}: 완료!')
    else:
        print(f'{fn}: 실패')
