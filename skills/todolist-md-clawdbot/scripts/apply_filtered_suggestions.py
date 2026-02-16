#!/usr/bin/env python3
"""
apply_filtered_suggestions.py
Post-process llm_suggestions_apply.json to avoid inserting near-duplicate suggestions
and apply as <!-- bot: subtask ... --> markers into target Drive files.

Behavior:
- Loads outputs/todolist-md/llm_suggestions_apply.json
- For each suggestion, compute similarity between original line and suggested title.
- Skip creating subtask marker if similarity >= 0.85 (configurable) -> instead record as no_change.
- Only insert subtasks for items that pass threshold and are actionable (start with verb or contain verbs like 'create','implement','open','contact').
- Backup file before write and write markers inline under matched lines.

Usage:
  python3 apply_filtered_suggestions.py --file vyond.md --apply

"""
import json,sys,os,re,argparse,uuid,datetime
from difflib import SequenceMatcher
import urllib.request,urllib.parse

THRESHOLD=0.85
ACTION_VERBS=('create','implement','open','contact','draft','request','schedule','setup','configure','test','verify','follow')

def normalize(s):
    return re.sub(r'\s+',' ', re.sub(r'[^a-z0-9 ]',' ', (s or '').lower())).strip()


def is_actionable(title):
    t=normalize(title)
    for v in ACTION_VERBS:
        if t.startswith(v+' ') or (' '+v+' ' in (' '+t+' ')):
            return True
    return False


def get_access_token():
    cs=json.load(open('/home/openclaw/.openclaw/credentials/gog-client-secret.json'))
    client_id=cs.get('installed',{}).get('client_id') or cs.get('web',{}).get('client_id')
    client_secret=cs.get('installed',{}).get('client_secret') or cs.get('web',{}).get('client_secret')
    rt=json.load(open('/home/openclaw/.openclaw/.secrets/todolist_drive_oauth.json')).get('refresh_token')
    data=urllib.parse.urlencode({'client_id':client_id,'client_secret':client_secret,'refresh_token':rt,'grant_type':'refresh_token'}).encode()
    req=urllib.request.Request('https://oauth2.googleapis.com/token',data=data)
    with urllib.request.urlopen(req) as resp:
        tok=json.load(resp)
    return tok.get('access_token')


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--file',required=True)
    p.add_argument('--apply',action='store_true')
    p.add_argument('--threshold',type=float,default=THRESHOLD)
    args=p.parse_args()

    suggestions_path='outputs/todolist-md/llm_suggestions_apply.json'
    if not os.path.exists(suggestions_path):
        print('No suggestions file found at',suggestions_path); sys.exit(1)
    sugg=json.load(open(suggestions_path))
    fs=sugg['fileSuggestions'][0]
    items=fs['suggestions']

    access=get_access_token()
    headers={'Authorization':'Bearer '+access}
    fileId=fs.get('fileId')
    # fetch file
    meta_url=f'https://www.googleapis.com/drive/v3/files/{fileId}?fields=id,name,mimeType,modifiedTime,headRevisionId'
    req=urllib.request.Request(meta_url, headers=headers)
    with urllib.request.urlopen(req) as r:
        meta=json.load(r)
    dl_url=f'https://www.googleapis.com/drive/v3/files/{fileId}?alt=media'
    req=urllib.request.Request(dl_url, headers=headers)
    with urllib.request.urlopen(req) as r:
        content=r.read().decode('utf-8')
    lines=content.splitlines()

    backups_dir='outputs/todolist-md/backups'
    os.makedirs(backups_dir, exist_ok=True)
    bk_name=f"{backups_dir}/{fileId}.{datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.md"
    open(bk_name,'w').write(content)
    print('Backup written to',bk_name)

    new_lines=list(lines)
    offset=0
    inserted=0
    records=[]
    for it in items:
        orig=it.get('original')
        suggested=it.get('suggested_text','')
        # extract title from suggested (strip leading - [ ] )
        title=re.sub(r'^\- \[ \]\s*','', suggested).split('\n')[0]
        sim=SequenceMatcher(None, normalize(orig), normalize(title)).ratio()
        actionable=is_actionable(title)
        decision='insert'
        if sim>=args.threshold:
            decision='skip_similar'
        elif not actionable:
            decision='skip_not_actionable'
        records.append({'original':orig,'title':title,'similarity':sim,'actionable':actionable,'decision':decision})
        if decision!='insert':
            continue
        # find best match line index
        best_idx=None; best_score=0
        for idx,ln in enumerate(lines):
            score=SequenceMatcher(None, normalize(orig), normalize(ln)).ratio()
            if score>best_score:
                best_score=score; best_idx=idx
        if best_idx is None or best_score<0.2:
            continue
        human_note=f"  > <!-- bot: note --> {title}"
        sub_id='sub:'+uuid.uuid4().hex[:8]
        marker_obj={'id':sub_id,'original_line':orig,'title':title,'estimate_hours':None,'assignee':None,'createdAtUtc':datetime.datetime.utcnow().isoformat()+'Z','source_model':sugg.get('schema','gpt-5-mini'),'status':'suggested'}
        machine_comment='<!-- bot: subtask '+json.dumps(marker_obj,ensure_ascii=False)+' -->'
        idx=best_idx+1+offset
        window=new_lines[max(0,idx-2):min(len(new_lines),idx+3)]
        if human_note.strip() in '\n'.join(window) or machine_comment in '\n'.join(window):
            continue
        new_lines.insert(idx,human_note)
        new_lines.insert(idx+1,machine_comment)
        offset+=2
        inserted+=1

    # update last_review
    last_line=f'<!-- bot: last_review --> {datetime.datetime.utcnow().isoformat()}Z model=gpt-5-mini hash={sugg.get("generatedAtUtc","")}'
    if new_lines and new_lines[0].startswith('<!-- bot: last_review'):
        new_lines[0]=last_line
    else:
        new_lines.insert(0,last_line)

    new_content='\n'.join(new_lines)+('\n' if content.endswith('\n') else '')
    if args.apply:
        req=urllib.request.Request(f'https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=media&supportsAllDrives=true', data=new_content.encode('utf-8'), method='PATCH')
        req.add_header('Authorization','Bearer '+access)
        req.add_header('Content-Type', meta.get('mimeType','text/markdown'))
        with urllib.request.urlopen(req) as r:
            resp=r.read().decode('utf-8')
        print('Applied, inserted',inserted)
    else:
        print('Dry-run would insert',inserted)
    # write records
    os.makedirs('outputs/todolist-md/filter_records', exist_ok=True)
    recfn=f"outputs/todolist-md/filter_records/{fileId}.{datetime.datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}.json"
    json.dump(records, open(recfn,'w'), indent=2, ensure_ascii=False)
    print('Records ->',recfn)

if __name__=='__main__':
    main()
