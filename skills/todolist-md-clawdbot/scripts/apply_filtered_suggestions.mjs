#!/usr/bin/env node
import fs from 'fs'
import crypto from 'crypto'
import {request} from 'undici'
import {fileURLToPath} from 'url'
import path from 'path'
import {spawnSync} from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SUGGESTIONS_PATH = path.resolve(process.cwd(), 'outputs/todolist-md/llm_suggestions_apply.json')
const BACKUPS_DIR = path.resolve(process.cwd(), 'outputs/todolist-md/backups')
const FILTER_RECORDS_DIR = path.resolve(process.cwd(), 'outputs/todolist-md/filter_records')
const THRESHOLD = parseFloat(process.env.SUGGEST_SIM_THRESHOLD || '0.85')
const ACTION_VERBS = (process.env.SUGGEST_ACTION_VERBS || 'create,implement,open,contact,draft,request,schedule,setup,configure,test,verify,follow').split(',')

function normalize(s){
  return (s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim()
}
function similarity(a,b){
  // simple SequenceMatcher-like ratio via longest common subsequence approximated by token overlap
  a = normalize(a).split(' ')
  b = normalize(b).split(' ')
  if(!a.length || !b.length) return 0
  const setA = new Set(a)
  let common=0
  for(const t of b) if(setA.has(t)) common++
  return common / Math.max(a.length,b.length)
}
function isActionable(title){
  const t = normalize(title)
  for(const v of ACTION_VERBS){
    if(t.startsWith(v+' ') || t.indexOf(' '+v+' ')>=0) return true
  }
  return false
}

async function getAccessToken(){
  const cs = JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/credentials/gog-client-secret.json','utf8'))
  const client_id = cs.installed?.client_id || cs.web?.client_id
  const client_secret = cs.installed?.client_secret || cs.web?.client_secret
  const rt = JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/.secrets/todolist_drive_oauth.json','utf8')).refresh_token
  const body = new URLSearchParams({client_id,client_secret,refresh_token:rt,grant_type:'refresh_token'})
  const r = await request('https://oauth2.googleapis.com/token', { method: 'POST', body: body.toString(), headers: {'content-type':'application/x-www-form-urlencoded'} })
  const j = await r.body.json()
  return j.access_token
}

async function main(){
  if(!fs.existsSync(SUGGESTIONS_PATH)){
    console.error('suggestions missing:',SUGGESTIONS_PATH)
    process.exit(1)
  }
  const sugg = JSON.parse(fs.readFileSync(SUGGESTIONS_PATH,'utf8'))
  let items = []
  let fileId = null
  if(sugg.fileSuggestions && sugg.fileSuggestions[0]){
    const fsug = sugg.fileSuggestions[0]
    items = fsug.suggestions || fsug.filtered_and_normalized_suggestions || []
    fileId = fsug.fileId || fsug.fileId
  } else if(sugg.suggestions || sugg.filtered_and_normalized_suggestions){
    items = sugg.suggestions || sugg.filtered_and_normalized_suggestions || []
    fileId = sugg.fileId || (items[0] && items[0].fileId) || null
  } else if(sugg.fileId && sugg.suggestions){
    items = sugg.suggestions; fileId = sugg.fileId
  } else {
    console.error('unrecognized suggestions schema')
    process.exit(1)
  }
  const access = await getAccessToken()
  const headers = {authorization:`Bearer ${access}`}
  const metaR = await request(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,headRevisionId`,{headers})
  const meta = await metaR.body.json()
  const dl = await request(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers})
  const content = await dl.body.text()
  const lines = content.split(/\r?\n/)
  fs.mkdirSync(BACKUPS_DIR,{recursive:true})
  const bkname = path.join(BACKUPS_DIR, `${fileId}.${new Date().toISOString().replace(/[:.]/g,'')}.md`)
  fs.writeFileSync(bkname, content)
  let newLines = [...lines]
  let offset=0
  const records=[]
  let inserted=0
  for(const it of items){
    const orig = it.original
    const suggested = it.suggested_text || ''
    const title = suggested.replace(/^\- \[ \]\s*/,'').split('\n')[0]
    const sim = similarity(orig,title)
    const actionable = isActionable(title)
    let decision='insert'
    if(sim>=THRESHOLD) decision='skip_similar'
    else if(!actionable) decision='skip_not_actionable'
    records.push({original:orig,title,similarity:sim,actionable,decision})
    if(decision!=='insert') continue
    // find best match
    let bestIdx=null,bestScore=0
    for(let idx=0; idx<lines.length; idx++){
      const score = similarity(orig, lines[idx])
      if(score>bestScore){bestScore=score; bestIdx=idx}
    }
    if(bestIdx==null || bestScore<0.2) continue
    const short = title
    const humanNote = `  > <!-- bot: note --> ${short}`
    const subId = 'sub:'+crypto.randomBytes(4).toString('hex')
    const markerObj = {id:subId, original_line:orig, title:short, estimate_hours:null, assignee:null, createdAtUtc:new Date().toISOString(), source_model:'gpt-5-mini', status:'suggested'}
    const machineComment = `<!-- bot: subtask ${JSON.stringify(markerObj)} -->`
    const idx = bestIdx+1+offset
    const window = newLines.slice(Math.max(0,idx-2), Math.min(newLines.length, idx+3)).join('\n')
    if(window.includes(humanNote) || window.includes(machineComment)) continue
    newLines.splice(idx,0,humanNote,machineComment)
    offset+=2
    inserted++
  }
  // update last_review
  const lastLine = `<!-- bot: last_review --> ${new Date().toISOString()} model=gpt-5-mini hash=${sugg.generatedAtUtc||''}`
  if(newLines.length && newLines[0].startsWith('<!-- bot: last_review')) newLines[0]=lastLine
  else newLines.unshift(lastLine)
  const newContent = newLines.join('\n') + (content.endsWith('\n')? '\n':'')
  // upload
  const up = await request(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,{method:'PATCH', body:newContent, headers:{...headers,'Content-Type':meta.mimeType||'text/markdown'}})
  await up.body.text()
  fs.mkdirSync(FILTER_RECORDS_DIR,{recursive:true})
  const recfn = path.join(FILTER_RECORDS_DIR, `${fileId}.${new Date().toISOString().replace(/[:.]/g,'')}.json`)
  fs.writeFileSync(recfn, JSON.stringify(records,null,2))
  console.log('Backup',bkname)
  console.log('Inserted',inserted)
  console.log('Records ->',recfn)
}

main().catch(e=>{console.error(e); process.exit(1)})
