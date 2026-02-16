#!/usr/bin/env node
import fs from 'fs'
import {request} from 'undici'
import crypto from 'crypto'

const SUGGESTIONS_PATH='outputs/todolist-md/llm_suggestions_apply.json'
if(!fs.existsSync(SUGGESTIONS_PATH)){console.error('missing suggestions'); process.exit(1)}
const sugg=JSON.parse(fs.readFileSync(SUGGESTIONS_PATH,'utf8'))
let items=[]
let fileId=null
if(sugg.fileSuggestions && sugg.fileSuggestions[0]){
  const fsug=sugg.fileSuggestions[0]
  items = fsug.suggestions || fsug.filtered_and_normalized_suggestions || []
  fileId = fsug.fileId || fsug.fileId
} else if(sugg.suggestions && sugg.suggestions[0]){
  // alternate format
  const fsug = sugg.suggestions[0]
  items = fsug.filtered_and_normalized_suggestions || fsug.suggestions || []
  fileId = sugg.fileId || fsug.fileId || sugg.fileId
} else {
  console.error('unrecognized suggestions schema'); process.exit(1)
}

async function getAccess(){
  const cs=JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/credentials/gog-client-secret.json','utf8'))
  const client_id=cs.installed?.client_id||cs.web?.client_id
  const client_secret=cs.installed?.client_secret||cs.web?.client_secret
  const rt=JSON.parse(fs.readFileSync('/home/openclaw/.openclaw/.secrets/todolist_drive_oauth.json','utf8')).refresh_token
  const body=new URLSearchParams({client_id,client_secret,refresh_token:rt,grant_type:'refresh_token'})
  const r=await request('https://oauth2.googleapis.com/token',{method:'POST', body:body.toString(), headers:{'content-type':'application/x-www-form-urlencoded'}})
  const j=await r.body.json(); return j.access_token
}

function normalize(s){return (s||'').replace(/[^a-z0-9 ]+/gi,' ').replace(/\s+/g,' ').trim()}

function leven(a,b){
  const m=a.length, n=b.length; if(m==0) return n; if(n==0) return m
  const dp=Array(n+1).fill(0).map((_,i)=>i)
  for(let i=1;i<=m;i++){let prev=i; for(let j=1;j<=n;j++){const cur=dp[j]; const cost=(a[i-1]===b[j-1]?0:1); dp[j]=Math.min(dp[j]+1, prev+1, dp[j-1]+cost); prev=cur}} return dp[n]
}

(async ()=>{
  const token=await getAccess(); const headers={authorization:`Bearer ${token}`}
  const metaR=await request(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,headRevisionId`,{headers})
  const meta=await metaR.body.json()
  const dl=await request(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers})
  const content=await dl.body.text(); const lines=content.split(/\r?\n/)
  // backup
  fs.mkdirSync('outputs/todolist-md/backups',{recursive:true})
  const bk=`outputs/todolist-md/backups/${fileId}.${new Date().toISOString().replace(/[:.]/g,'')}.md`
  fs.writeFileSync(bk,content)
  let newLines=[...lines]; let offset=0; let inserted=0
  for(const it of items){
    const orig=it.original; const suggested=it.suggested_text||''; const title=suggested.replace(/^\- \[ \]\s*/,'').split('\n')[0]
    // find best match line using normalized levenshtein-based score
    let bestIdx=null,bestScore=-1
    for(let i=0;i<lines.length;i++){const sim=1 - (leven(normalize(orig), normalize(lines[i]))/Math.max(normalize(orig).length,1)); if(sim>bestScore){bestScore=sim; bestIdx=i}}
    if(bestIdx==null) continue
    const humanNote=`  > <!-- bot: note --> ${title}`
    const subId='sub:'+crypto.randomBytes(4).toString('hex')
    const markerObj = {id:subId, original_line:orig, title, estimate_hours:null, assignee:null, createdAtUtc:new Date().toISOString(), source_model:'gpt-5-mini', status:'suggested'}
    const machineComment = `<!-- bot: subtask ${JSON.stringify(markerObj)} -->`
    const idx = bestIdx+1+offset
    const window = newLines.slice(Math.max(0,idx-2), Math.min(newLines.length, idx+3)).join('\n')
    if(window.includes(humanNote) || window.includes(machineComment)) continue
    newLines.splice(idx,0,humanNote,machineComment)
    offset+=2; inserted++
  }
  // insert last_review
  const lastLine = `<!-- bot: last_review --> ${new Date().toISOString()} model=gpt-5-mini hash=${sugg.generatedAtUtc||''}`
  if(newLines.length && newLines[0].startsWith('<!-- bot: last_review')) newLines[0]=lastLine; else newLines.unshift(lastLine)
  const newContent = newLines.join('\n') + (content.endsWith('\n')?'\n':'')
  const up = await request(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&supportsAllDrives=true`,{method:'PATCH', body:newContent, headers:{...headers,'Content-Type':meta.mimeType||'text/markdown'}})
  await up.body.text()
  console.log('backup',bk)
  console.log('inserted',inserted)
})().catch(e=>{console.error(e); process.exit(1)})
