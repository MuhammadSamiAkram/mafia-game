const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, res) => res.json({ok:true}));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map();
const names = ['A','B','C','D','E','F','G','H','J','K','M','N','P','Q','R','S','T','V','W','X'];
function code(){ let s=''; do { s=''; for(let i=0;i<6;i++) s += names[Math.floor(Math.random()*names.length)]; } while(rooms.has(s)); return s; }
function id(){ return crypto.randomBytes(8).toString('hex'); }
function roleCounts(n){ if(n<4) return {mafia:1,doctor:0,detective:0}; const mafia=Math.max(1,Math.floor(n/4)); return {mafia,doctor:n>=6?1:0,detective:n>=5?1:0}; }
function makeRoles(n){ const c=roleCounts(n), r=[]; for(let i=0;i<c.mafia;i++)r.push('mafia'); if(c.doctor)r.push('doctor'); if(c.detective)r.push('detective'); while(r.length<n)r.push('town'); return r.sort(()=>Math.random()-.5); }
function publicState(room){ return {code:room.code,phase:room.phase,day:room.day,night:room.night,players:[...room.players.values()].map(p=>({id:p.id,name:p.name,alive:p.alive,will:p.will||''})),nominee:room.nominee||null,trialVotes:room.trialVotes||{},winner:room.winner||null}; }
function send(ws,msg){if(ws.readyState===1)ws.send(JSON.stringify(msg));}
function broadcast(room,msg){for(const p of room.players.values())send(p.ws,msg); if(room.host)send(room.host,msg);}
function push(room){broadcast(room,{type:'state',state:publicState(room)});}
function privateRole(room,p){send(p.ws,{type:'role',role:p.role,room:room.code});}
function checkWin(room){ const alive=[...room.players.values()].filter(p=>p.alive); const m=alive.filter(p=>p.role==='mafia').length; const non=alive.length-m; if(m===0)room.winner='town'; else if(m>=non)room.winner='mafia'; if(room.winner){room.phase='gameover'; broadcast(room,{type:'announcement',text:`${room.winner==='town'?'Town':'Mafia'} wins!`});} }
function startNight(room){ room.phase='night'; room.night++; room.actions={kills:null,protect:null,inspect:null}; room.nominee=null; room.trialVotes={}; broadcast(room,{type:'narration',text:`Night ${room.night}. Everyone goes to sleep.`}); push(room); }
function resolveNight(room){ const target=room.actions.kills; const protectedId=room.actions.protect; if(target && target!==protectedId){ const victim=room.players.get(target); if(victim) victim.alive=false; room.lastDeath=victim?.id||null; } else room.lastDeath=null; room.phase='dawn'; if(room.lastDeath){ const v=room.players.get(room.lastDeath); broadcast(room,{type:'dawn',victim:{name:v.name,role:v.role,will:v.will||''}}); } else broadcast(room,{type:'dawn',victim:null}); checkWin(room); if(!room.winner) setTimeout(()=>{room.phase='discussion'; broadcast(room,{type:'narration',text:`Day ${room.day}. Discuss. Who is suspicious?`}); push(room)},3500); else push(room); }
function startGame(room){ const players=[...room.players.values()]; const roles=makeRoles(players.length); players.forEach((p,i)=>{p.role=roles[i];p.alive=true;}); room.phase='role'; room.day=1; room.night=0; room.winner=null; players.forEach(p=>privateRole(room,p)); broadcast(room,{type:'narration',text:'Roles have been dealt. Check your phone privately.'}); setTimeout(()=>startNight(room),5000); push(room); }
function trialResult(room){ const votes=Object.values(room.trialVotes||{}); const guilty=votes.filter(v=>v==='guilty').length; const innocent=votes.filter(v=>v==='innocent').length; const n=room.players.get(room.nominee); if(guilty>innocent){ if(n)n.alive=false; broadcast(room,{type:'trialResult',result:'guilty',name:n?.name}); } else broadcast(room,{type:'trialResult',result:'innocent',name:n?.name}); checkWin(room); if(!room.winner)setTimeout(()=>{room.day++;startNight(room)},3500); else push(room); }
wss.on('connection',(ws)=>{
  ws.on('message',raw=>{ let m; try{m=JSON.parse(raw)}catch{return}
    if(m.type==='create'){ const room={code:code(),host:ws,players:new Map(),phase:'lobby',day:0,night:0}; rooms.set(room.code,room); send(ws,{type:'created',code:room.code}); push(room); return; }
    if(m.type==='join'){ const room=rooms.get(String(m.code||'').toUpperCase()); if(!room)return send(ws,{type:'error',message:'Room not found'}); if(room.phase!=='lobby')return send(ws,{type:'error',message:'Game already started'}); const p={id:id(),name:String(m.name||'Player').slice(0,24),will:String(m.will||'').slice(0,500),alive:true,role:null,ws}; room.players.set(p.id,p); ws.playerId=p.id; ws.room=room.code; send(ws,{type:'joined',id:p.id,code:room.code}); push(room); return; }
    const room=rooms.get(ws.room); if(!room)return;
    if(m.type==='start' && ws===room.host){ if(room.players.size<4)return send(ws,{type:'error',message:'Need at least 4 players'}); startGame(room); }
    if(m.type==='will'){ const p=room.players.get(ws.playerId); if(p)p.will=String(m.will||'').slice(0,500); push(room); }
    if(m.type==='nightAction'){ const p=room.players.get(ws.playerId); if(!p?.alive||room.phase!=='night')return; const target=room.players.get(m.target); if(!target?.alive)return; if(p.role==='mafia')room.actions.kills=m.target; if(p.role==='doctor')room.actions.protect=m.target; if(p.role==='detective'){room.actions.inspect=m.target;send(ws,{type:'investigation',name:target.name,isMafia:target.role==='mafia'});} const alive=[...room.players.values()].filter(x=>x.alive); const mafiaDone=alive.filter(x=>x.role==='mafia').every(x=>room.actions.kills); const doc=[...room.players.values()].find(x=>x.role==='doctor'); const docDone=!doc||room.actions.protect; const det=[...room.players.values()].find(x=>x.role==='detective'); const detDone=!det||room.actions.inspect; if(mafiaDone&&docDone&&detDone)resolveNight(room); }
    if(m.type==='nominate' && room.phase==='discussion'){ const n=room.players.get(m.target); if(n?.alive){room.nominee=n.id;room.phase='trial';room.trialVotes={};broadcast(room,{type:'narration',text:`${n.name} has been placed on trial. They may defend themselves.`});push(room);} }
    if(m.type==='trialVote'&&room.phase==='trial'){ const p=room.players.get(ws.playerId); if(p?.alive&&['guilty','innocent'].includes(m.vote)){room.trialVotes[p.id]=m.vote;push(room); const alive=[...room.players.values()].filter(x=>x.alive); if(alive.every(x=>room.trialVotes[x.id]))trialResult(room);} }
  });
  ws.on('close',()=>{});
});
const PORT=process.env.PORT||10000; server.listen(PORT,'0.0.0.0',()=>console.log(`Mafia server listening on ${PORT}`));
