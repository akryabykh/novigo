// Isolated in-memory API fixture for local UI checks. Never contacts Supabase.
// Run: node qa-hunt-run-20260926-components/local-api.mjs
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
const uid = '11111111-1111-4111-8111-111111111111';
const date = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today = date(new Date());
const yesterday = date(new Date(Date.now()-86400000));
const user = { id: uid, email: 'qa@novigo.test', aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} };
const profile = { id: uid, first_name: 'QA', last_name: 'Local', middle_name: null, xp: 0, level: 1, current_streak: 0, best_streak: 0, created_at: new Date().toISOString() };
const goals = ['day','week','month'].flatMap((tf) => ['goal','task'].map((kind) => ({ id: randomUUID(), user_id: uid, kind, timeframe: tf, title: `QA ${kind} ${tf}`, target: kind === 'task' ? 1 : 3, weight: 100, start_date: yesterday, end_date: kind === 'task' ? (tf === 'day' ? today : '2026-12-31') : null, archived: false, created_at: new Date().toISOString() })));
let logs = goals.filter(g => g.kind==='task').map(g => ({ goal_id:g.id, date:yesterday, value:1 }));
let failure = '', delay = 0;
const encoded = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const token = `${encoded({alg:'HS256',typ:'JWT'})}.${encoded({sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+36000})}.local-fixture`;
const session = { access_token:token,refresh_token:'local-fixture',expires_in:36000,token_type:'bearer',user };
createServer(async (req,res) => {
  res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','*'); res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1:9040');
  const chunks=[];for await(const chunk of req) chunks.push(chunk);
  let body={};try{body=JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{}
  const send=(data,code=200)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/__qa') {
    if(req.method==='POST'){failure=body.failure??'';delay=body.delay??0;}
    send({fixture:true,failure,delay,goals,logs});return;
  }
  if(req.method!=='GET' && delay) await new Promise(r=>setTimeout(r,delay));
  if(failure && url.pathname.includes(failure)){send({message:'QA simulated network error',code:'QA_FAILURE'},503);return;}
  if(url.pathname.endsWith('/token')){send(session);return;}
  if(url.pathname.endsWith('/user')){send(user);return;}
  if(url.pathname.endsWith('/logout')){send({});return;}
  if(url.pathname.endsWith('/profiles')){if(req.method==='PATCH')Object.assign(profile,body);send(req.headers.accept?.includes('object')?profile:[profile]);return;}
  if(url.pathname.endsWith('/goals')){send(goals);return;}
  if(url.pathname.endsWith('/daily_logs')){
    if(req.method==='POST')for(const row of (Array.isArray(body)?body:[body])) {logs=logs.filter(l=>l.goal_id!==row.goal_id||l.date!==row.date);logs.push(row);}
    send(logs);return;
  }
  if(url.pathname.endsWith('/save_horizon')){
    for(const p of body.p_updates??[]) {const g=goals.find(x=>x.id===p.id);if(g)Object.assign(g,{title:p.title,target:p.target,weight:p.weight,end_date:p.endDate});}
    for(const id of body.p_deletes??[]) {const i=goals.findIndex(g=>g.id===id);if(i>=0)goals.splice(i,1);logs=logs.filter(l=>l.goal_id!==id);}
    for(const p of body.p_creates??[]) goals.push({id:randomUUID(),user_id:uid,kind:p.kind,timeframe:p.timeframe,title:p.title,target:p.target,weight:p.weight,start_date:p.startDate,end_date:p.endDate,archived:false,created_at:new Date().toISOString()});
    send(null);return;
  }
  if(url.pathname.endsWith('/achievements')){send([]);return;}
  send({message:'Fixture route not implemented'},404);
}).listen(9040,'127.0.0.1',()=>console.log('Local QA fixture http://127.0.0.1:9040; login qa@novigo.test, any nonempty test password'));
