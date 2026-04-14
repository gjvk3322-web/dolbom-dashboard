"""돌봄매트 텔레그램 통합 봇 v5 - 시공사진 + 사유수집"""
import os,re,json,time,base64,logging,requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

BOT_TOKEN='8791798211:AAFMQvo6WLocztaMxxjlKLelDFy6c5XojHE'
GROUP_CHAT_ID=-1003889851953
REPORT_THREAD_ID=225       # 시공보고서 토픽
REASON_THREAD_ID=429       # 실수·미참여·근퇴 기록 토픽
APPS_SCRIPT_URL='https://script.google.com/macros/s/AKfycbwo33sv9L1y722IdcfUm_i_nhmgZCCQX-grPEXGYbLemeI3WUx-f3C1Mi8ZxunmZ6D6lw/exec'
CACHE_PATH='/home/ubuntu/돌봄매트/수집기/photo_cache.json'
OFFSET_PATH='/home/ubuntu/돌봄매트/수집기/photo_offset.txt'

logging.basicConfig(level=logging.INFO,format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.FileHandler('/home/ubuntu/돌봄매트/수집기/photo_bot.log'),
              logging.StreamHandler()])
log=logging.getLogger(__name__)

MERGE_WINDOW=300
MAX_WORKERS=5

# ─── 텔레그램 API ───
def tg_get(method,params=None):
    r=requests.get(f'https://api.telegram.org/bot{BOT_TOKEN}/{method}',params=params,timeout=60)
    return r.json()

def tg_send_message(chat_id, thread_id, text):
    """텔레그램 메시지 전송"""
    try:
        requests.post(f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage',
            json={'chat_id': chat_id, 'message_thread_id': thread_id, 'text': text}, timeout=10)
    except Exception as e:
        log.error(f'메시지 전송 실패: {e}')

def tg_download_file(file_id):
    info=tg_get('getFile',{'file_id':file_id})
    if not info.get('ok'): return None
    fp=info['result']['file_path']
    return requests.get(f'https://api.telegram.org/file/bot{BOT_TOKEN}/{fp}',timeout=30).content

# ─── 시공사진 관련 ───
def upload_photo(folder_name,filename,image_bytes):
    b64=base64.b64encode(image_bytes).decode('utf-8')
    try:
        r=requests.post(APPS_SCRIPT_URL,headers={'Content-Type':'text/plain'},
            data=json.dumps({'type':'telegramPhoto','folderName':folder_name,'fileName':filename,'imageData':b64}),timeout=120)
        return r.text
    except Exception as e:
        log.error(f'업로드실패: {e}'); return None

def upload_text(folder_name,filename,text):
    try:
        r=requests.post(APPS_SCRIPT_URL,headers={'Content-Type':'text/plain'},
            data=json.dumps({'type':'telegramText','folderName':folder_name,'fileName':filename,'textContent':text}),timeout=30)
        return r.text
    except Exception as e:
        log.error(f'텍스트업로드실패: {e}'); return None

def parse_report(text):
    info={}
    for key,pat in {'date':r'시공일자\s*[:：]\s*(\S+)','team':r'시공팀원\s*[:：]\s*(\S+)',
        'apt':r'아파트명\s*[:：]\s*(.+?)(?:\n|$)','unit':r'동호수\s*[:：]\s*(.+?)(?:\n|$)',
        'color':r'색상\s*[:：]\s*(\S+)','qty':r'판매갯수\s*[:：]\s*(\S+)'}.items():
        m=re.search(pat,text)
        if m: info[key]=m.group(1).strip()
    return info

def make_folder_name(info):
    d=info.get('date',datetime.now().strftime('%Y-%m-%d')).replace('-','')[2:]
    apt=info.get('apt','미상').strip()
    unit=info.get('unit','').strip().replace(' ','')
    color=info.get('color','').strip()
    qty=info.get('qty','')
    if qty: qty=qty+'장'
    team=info.get('team','').strip()
    name='_'.join([p for p in [d,apt,unit,color,qty,team] if p])
    return re.sub(r'[\\/:*?"<>|]','',name)[:100]

photo_cache={}

def save_cache():
    try:
        with open(CACHE_PATH,'w') as f: json.dump(photo_cache,f,ensure_ascii=False)
    except: pass

def load_cache():
    global photo_cache
    try:
        if os.path.exists(CACHE_PATH):
            with open(CACHE_PATH,'r') as f: photo_cache=json.load(f)
            log.info(f'캐시 복구: {len(photo_cache)}개 묶음')
    except: photo_cache={}

def find_all_photos_by_user(user_id, base_timestamp):
    all_photos=[]
    matched_keys=[]
    for k,v in photo_cache.items():
        if v['user_id']==user_id and abs(v['timestamp']-base_timestamp)<=MERGE_WINDOW:
            all_photos.extend(v['photos'])
            matched_keys.append(k)
    return all_photos, matched_keys

def upload_one_photo(args):
    folder_name, i, file_id = args
    try:
        data=tg_download_file(file_id)
        if data:
            r=upload_photo(folder_name, f'photo_{i+1:02d}.jpg', data)
            if r and 'error' not in r.lower():
                return True
            else:
                log.error(f'  실패: {r}')
    except Exception as e:
        log.error(f'사진오류({i+1}): {e}')
    return False

# ─── 사유 수집 관련 ───
def parse_reason(text):
    """#업무종류 #이름 사유내용 → dict"""
    tags = re.findall(r'#(\S+)', text)
    if len(tags) < 2:
        return None
    task_type = tags[0]
    name = tags[1]
    reason = re.sub(r'#\S+\s*', '', text).strip()
    return {
        'date': datetime.now().strftime('%Y-%m-%d'),
        'time': datetime.now().strftime('%H:%M'),
        'task_type': task_type,
        'name': name,
        'reason': reason if reason else '(사유 미작성)'
    }

def save_reason_to_sheet(record):
    """구글 시트에 사유 레코드 전송"""
    payload = {
        'type': 'reason',
        'date': record['date'],
        'time': record['time'],
        'task_type': record['task_type'],
        'name': record['name'],
        'reason': record['reason']
    }
    try:
        res = requests.post(APPS_SCRIPT_URL,
                          headers={'Content-Type': 'text/plain'},
                          data=json.dumps(payload),
                          timeout=30,
                          allow_redirects=False)
        if res.status_code in (200, 302):
            log.info(f'✅ 사유 구글시트 저장 성공: {record["name"]} | {record["task_type"]}')
            return True
        else:
            log.error(f'⚠️ 사유 저장 실패 (코드:{res.status_code})')
            return False
    except Exception as e:
        log.error(f'⚠️ 사유 구글시트 저장 실패: {e}')
        return False

# ─── 메시지 처리 (시공사진 + 사유수집 통합) ───
def process_update(update):
    msg=update.get('message')
    if not msg: return
    if msg.get('chat',{}).get('id')!=GROUP_CHAT_ID: return

    thread_id = msg.get('message_thread_id')
    msg_id=msg['message_id']
    user_id=msg.get('from',{}).get('id',0)
    user_name=msg.get('from',{}).get('first_name','')

    # ===== 실수·미참여·근퇴 사유 수집 (토픽 429) =====
    if thread_id == REASON_THREAD_ID:
        text = msg.get('text', '')
        if not text or '#' not in text:
            return

        record = parse_reason(text)
        if record:
            save_reason_to_sheet(record)
            confirm = "기록되었습니다."
            tg_send_message(GROUP_CHAT_ID, REASON_THREAD_ID, confirm)
            log.info(f'📝 사유기록: {record["date"]} {record["time"]} | {record["name"]} | {record["task_type"]} | {record["reason"]}')
        else:
            guide = (
                "⚠️ 양식이 맞지 않습니다.\n\n"
                "📝 올바른 양식:\n"
                "#업무종류 #이름 사유내용\n\n"
                "✏️ 예시:\n"
                "#시공보고서 #홍길동 고객 일정 변경으로 연기\n"
                "#차량점검 #이민우 외근으로 차량 미사용\n"
                "#근태 #김철수 병원 방문으로 지각"
            )
            tg_send_message(GROUP_CHAT_ID, REASON_THREAD_ID, guide)
        return

    # ===== 시공사진 처리 (토픽 225) =====
    if thread_id != REPORT_THREAD_ID:
        return

    if 'photo' in msg:
        photo=msg['photo'][-1]
        key=msg.get('media_group_id') or str(msg_id)
        if key not in photo_cache:
            photo_cache[key]={'photos':[],'user_id':user_id,'user_name':user_name,'timestamp':time.time(),'msg_id':msg_id}
        photo_cache[key]['photos'].append(photo['file_id'])
        log.info(f'사진캐시: {key} ({len(photo_cache[key]["photos"])}장) from {user_name}')
        save_cache()

    text=msg.get('text','')
    if '시공보고서' in text and msg.get('reply_to_message'):
        reply=msg['reply_to_message']
        rid=reply['message_id']
        rmg=reply.get('media_group_id')

        target_key=None
        if rmg and rmg in photo_cache: target_key=rmg
        else:
            for k,v in photo_cache.items():
                if v['msg_id']==rid: target_key=k; break

        info=parse_report(text)
        fn=make_folder_name(info)

        if not target_key or target_key not in photo_cache:
            log.warning(f'사진없음, 보고서만: {fn}')
            upload_text(fn,'시공보고서.txt',text)
            return

        target=photo_cache[target_key]
        all_photos, matched_keys=find_all_photos_by_user(target['user_id'], target['timestamp'])

        log.info(f'매칭! 폴더:{fn} 유저:{target["user_name"]} 묶음:{len(matched_keys)}개 사진:{len(all_photos)}장')

        start=time.time()
        ok=0
        if all_photos:
            first_ok=upload_one_photo((fn, 0, all_photos[0]))
            if first_ok: ok+=1; log.info(f'  완료: photo_01.jpg')
        if len(all_photos)>1:
            tasks=[(fn, i, fid) for i, fid in enumerate(all_photos) if i>0]
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                futures={executor.submit(upload_one_photo, t): t for t in tasks}
                for future in as_completed(futures):
                    if future.result():
                        ok+=1
                        idx=futures[future][1]
                        log.info(f'  완료: photo_{idx+1:02d}.jpg')

        upload_text(fn,'시공보고서.txt',text)

        for k in matched_keys:
            photo_cache.pop(k, None)
        save_cache()

        elapsed=time.time()-start
        log.info(f'✅ 완료: {fn} ({ok}/{len(all_photos)}장+보고서) {elapsed:.1f}초')

# ─── 메인 루프 ───
def main():
    log.info('===== 돌봄매트 통합 봇 v5 (시공사진 + 사유수집) 시작 =====')
    load_cache()
    offset=0
    try:
        if os.path.exists(OFFSET_PATH):
            offset=int(open(OFFSET_PATH).read().strip())
            log.info(f'offset 복구: {offset}')
    except: pass
    while True:
        try:
            now=time.time()
            expired=[k for k,v in photo_cache.items() if now-v['timestamp']>3600]
            for k in expired: photo_cache.pop(k,None)
            if expired: save_cache()
            result=tg_get('getUpdates',{'offset':offset,'timeout':30,'allowed_updates':['message']})
            if not result.get('ok'): log.error(f'실패:{result}'); time.sleep(5); continue
            for u in result.get('result',[]):
                offset=u['update_id']+1
                try: open(OFFSET_PATH,'w').write(str(offset))
                except: pass
                try: process_update(u)
                except Exception as e: log.error(f'처리오류:{e}',exc_info=True)
        except requests.exceptions.Timeout: continue
        except Exception as e: log.error(f'루프오류:{e}',exc_info=True); time.sleep(5)

if __name__=='__main__': main()
