#!/usr/bin/env python3
"""
실수·미참여·근퇴 사유 수집기
==============================
텔레그램 "실수·미참여·근퇴 기록" 토픽에서 해시태그 메시지를 파싱하여 구글시트에 저장

양식: #업무종류 #이름 사유내용
예시: #시공보고서 #홍길동 고객 일정 변경으로 연기
예시: #차량점검 #이민우 외근으로 차량 미사용
예시: #근태 #김철수 병원 방문으로 지각

실행: nohup python3 reason_collector.py > reason_collector.log 2>&1 &
"""

import requests
import json
import os
import re
import time
from datetime import datetime

# ─── 설정 ───
BOT_TOKEN = '8791798211:AAFMQvo6WLocztaMxxjlKLelDFy6c5XojHE'
GROUP_CHAT_ID = -1003889851953   # 돌봄매트 그룹
THREAD_ID = 429                  # 실수·미참여·근퇴 기록 토픽
APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwo33sv9L1y722IdcfUm_i_nhmgZCCQX-grPEXGYbLemeI3WUx-f3C1Mi8ZxunmZ6D6lw/exec'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OFFSET_FILE = os.path.join(BASE_DIR, '.reason_offset')

# ─── 오프셋 관리 (중복 처리 방지) ───
def get_offset():
    if os.path.exists(OFFSET_FILE):
        with open(OFFSET_FILE, 'r') as f:
            return int(f.read().strip())
    return 0

def save_offset(offset):
    with open(OFFSET_FILE, 'w') as f:
        f.write(str(offset))

# ─── 해시태그 파싱 ───
def parse_reason(text):
    """
    #업무종류 #이름 사유내용 → dict
    해시태그가 2개 이상이어야 유효
    """
    tags = re.findall(r'#(\S+)', text)
    if len(tags) < 2:
        return None

    task_type = tags[0]   # 첫번째 해시태그 = 업무종류
    name = tags[1]        # 두번째 해시태그 = 이름

    # 해시태그 제거 후 나머지 = 사유
    reason = re.sub(r'#\S+\s*', '', text).strip()

    return {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'time': datetime.now().strftime('%H:%M'),
        'task_type': task_type,
        'name': name,
        'reason': reason if reason else '(사유 미작성)'
    }

# ─── 구글 시트 저장 ───
def save_to_sheet(record):
    """구글 시트에 레코드 전송"""
    payload = {
        'type': 'reason',
        'date': record['date'],
        'time': record['time'],
        'task_type': record['task_type'],
        'name': record['name'],
        'reason': record['reason']
    }
    try:
        print(f"📤 구글시트 전송 중... payload: {payload}")
        # Google Apps Script는 302 리다이렉트를 반환하므로 리다이렉트 따라가지 않음
        res = requests.post(APPS_SCRIPT_URL,
                          headers={'Content-Type': 'text/plain'},
                          data=json.dumps(payload),
                          timeout=30,
                          allow_redirects=False)
        print(f"📥 응답 코드: {res.status_code}")
        # 302 = Google이 데이터를 처리한 후 리다이렉트 (정상)
        if res.status_code in (200, 302):
            print("✅ 구글시트 전송 성공")
            return True
        else:
            print(f"⚠️ 예상치 못한 응답: {res.status_code}")
            print(f"📥 응답 내용: {res.text[:200]}")
            return False
    except Exception as e:
        print(f"⚠️ 구글시트 저장 실패: {e}")
        return False

# ─── 텔레그램 메시지 전송 ───
def send_message(chat_id, thread_id, text):
    url = f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage'
    requests.post(url, json={
        'chat_id': chat_id,
        'message_thread_id': thread_id,
        'text': text
    }, timeout=10)

# ─── 메인 루프 ───
def main():
    print("=" * 50)
    print("📋 실수·미참여·근퇴 사유 수집기")
    print("=" * 50)
    print(f"📊 구글 시트 저장")
    print(f"🔗 토픽 ID: {THREAD_ID}")
    print(f"🛑 종료: Ctrl + C")
    print("=" * 50)
    offset = get_offset()

    while True:
        try:
            url = f'https://api.telegram.org/bot{BOT_TOKEN}/getUpdates'
            res = requests.get(url, params={
                'offset': offset,
                'timeout': 30,
                'allowed_updates': ['message']
            }, timeout=35)
            data = res.json()

            if not data.get('ok'):
                print(f"⚠️ API 응답 오류: {data}")
                time.sleep(5)
                continue

            for update in data.get('result', []):
                offset = update['update_id'] + 1
                save_offset(offset)

                msg = update.get('message', {})
                chat_id = msg.get('chat', {}).get('id')
                thread_id = msg.get('message_thread_id')
                text = msg.get('text', '')
                sender = msg.get('from', {}).get('first_name', '알수없음')

                # 대상 토픽 메시지만 처리
                if chat_id != GROUP_CHAT_ID:
                    continue
                if thread_id != THREAD_ID:
                    continue
                if not text or '#' not in text:
                    continue

                # 해시태그 파싱
                record = parse_reason(text)

                if record:
                    save_to_sheet(record)
                    confirm = (
                        f"✅ 기록 완료\n"
                        f"• 업무: {record['task_type']}\n"
                        f"• 이름: {record['name']}\n"
                        f"• 사유: {record['reason']}"
                    )
                    send_message(chat_id, thread_id, confirm)
                    print(f"📝 {record['date']} {record['time']} | {record['name']} | {record['task_type']} | {record['reason']}")
                else:
                    # 양식 안내
                    guide = (
                        "⚠️ 양식이 맞지 않습니다.\n\n"
                        "📝 올바른 양식:\n"
                        "#업무종류 #이름 사유내용\n\n"
                        "✏️ 예시:\n"
                        "#시공보고서 #홍길동 고객 일정 변경으로 연기\n"
                        "#차량점검 #이민우 외근으로 차량 미사용\n"
                        "#근태 #김철수 병원 방문으로 지각"
                    )
                    send_message(chat_id, thread_id, guide)

        except KeyboardInterrupt:
            print("\n🛑 수집기 종료")
            break
        except Exception as e:
            print(f"❌ 에러: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
