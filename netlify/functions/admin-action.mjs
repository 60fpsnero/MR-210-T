import { getStore } from "@netlify/blobs";
import { pendingStore, approvedStore, adminOK, json } from "./_shared.mjs";

async function all(store){const {blobs}=await store.list();return Promise.all(blobs.map(b=>store.get(b.key,{type:"json"})));}
const bracketStore=()=>getStore({name:"tournament-bracket",consistency:"strong"});
const rankBase={"bronze":1000,"silver":2000,"gold":3000,"platinum":4000,"diamond":5000,"grandmaster":6000,"celestial":7000,"eternity":8000,"one above all":9000};
function rankScore(value){const raw=String(value||"").toLowerCase().trim();let base=0;for(const [name,score] of Object.entries(rankBase))if(raw.includes(name))base=Math.max(base,score);const m=raw.match(/(?:^|\s)([1-3])(?:$|\s)/);const division=m?Number(m[1]):null;if(base&&division)base+=(4-division)*100;return base;}
function skillScore(p){return rankScore(p.current_rank)*.7+rankScore(p.peak_rank)*.3;}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function buildBalancedTeams(players){const candidates=shuffle(players).sort((a,b)=>skillScore(b)-skillScore(a));const teams=[[],[],[]],totals=[0,0,0];const roleCounts=()=>teams.map(team=>({Vanguard:team.filter(p=>p.role==='Vanguard').length,Duelist:team.filter(p=>p.role==='Duelist').length,Strategist:team.filter(p=>p.role==='Strategist').length,Flex:team.filter(p=>p.role==='Flex').length}));for(const p of candidates){const rc=roleCounts();const available=[0,1,2].filter(i=>teams[i].length<6);available.sort((a,b)=>{const ra=rc[a][p.role]||0,rb=rc[b][p.role]||0;if(ra!==rb)return ra-rb;if(totals[a]!==totals[b])return totals[a]-totals[b];return Math.random()-.5;});const i=available[0];teams[i].push(p);totals[i]+=skillScore(p);}return teams;}
const emptyBracket=()=>({format:"round-robin-v1",match1_team1_score:null,match1_team2_score:null,match1_winner:null,match2_team2_score:null,match2_team3_score:null,match2_winner:null,match3_team1_score:null,match3_team3_score:null,match3_winner:null,finalist1:null,finalist2:null,finalists_manual:false,final_team1_score:null,final_team2_score:null,champion:null});
async function getBracket(){const saved=(await bracketStore().get("state",{type:"json"}))||{};return saved.format==="round-robin-v1"?{...emptyBracket(),...saved}:emptyBracket();}
function validBO3(a,b){return Number.isInteger(a)&&Number.isInteger(b)&&((a===2&&(b===0||b===1))||(b===2&&(a===0||a===1)));}
function validBO5(a,b){return Number.isInteger(a)&&Number.isInteger(b)&&((a===3&&b>=0&&b<=2)||(b===3&&a>=0&&a<=2));}
function standingsFor(b){const s={"Team 1":{team:"Team 1",wins:0,losses:0,mapsWon:0,mapsLost:0},"Team 2":{team:"Team 2",wins:0,losses:0,mapsWon:0,mapsLost:0},"Team 3":{team:"Team 3",wins:0,losses:0,mapsWon:0,mapsLost:0}};const add=(a,c,sa,sb)=>{if(sa==null||sb==null)return;s[a].mapsWon+=sa;s[a].mapsLost+=sb;s[c].mapsWon+=sb;s[c].mapsLost+=sa;if(sa>sb){s[a].wins++;s[c].losses++;}else{s[c].wins++;s[a].losses++;}};add("Team 1","Team 2",b.match1_team1_score,b.match1_team2_score);add("Team 2","Team 3",b.match2_team2_score,b.match2_team3_score);add("Team 1","Team 3",b.match3_team1_score,b.match3_team3_score);return Object.values(s).map(x=>({...x,mapDiff:x.mapsWon-x.mapsLost})).sort((a,c)=>c.wins-a.wins||c.mapDiff-a.mapDiff||a.team.localeCompare(c.team));}
function rrComplete(b){return !!(b.match1_winner&&b.match2_winner&&b.match3_winner);}
function applyAutomaticFinalists(b){if(!rrComplete(b))return;const s=standingsFor(b);const cutoffClear=s[1].wins!==s[2].wins||s[1].mapDiff!==s[2].mapDiff;if(cutoffClear){b.finalist1=s[0].team;b.finalist2=s[1].team;b.finalists_manual=false;}else{b.finalist1=null;b.finalist2=null;b.finalists_manual=false;}}
function invalidateFinal(b){b.final_team1_score=null;b.final_team2_score=null;b.champion=null;}

export default async req=>{
 if(!adminOK(req))return json({error:"Unauthorized"},401);if(req.method!=="POST")return json({error:"POST only"},405);
 try{const body=await req.json();const {id,action,group,round,scoreA,scoreB,finalist1,finalist2}=body;if(!action)return json({error:"Missing action"},400);const pending=pendingStore(),approved=approvedStore();
  if(action==="set-bracket-result"){
   const a=Number(scoreA),b=Number(scoreB),state=await getBracket();
   if(round==="match1"||round==="match2"||round==="match3"){
    if(!validBO3(a,b))return json({error:"Round-robin result must be 2-0, 2-1, 0-2, or 1-2."},400);
    if(round==="match1"){state.match1_team1_score=a;state.match1_team2_score=b;state.match1_winner=a===2?"Team 1":"Team 2";}
    if(round==="match2"){state.match2_team2_score=a;state.match2_team3_score=b;state.match2_winner=a===2?"Team 2":"Team 3";}
    if(round==="match3"){state.match3_team1_score=a;state.match3_team3_score=b;state.match3_winner=a===2?"Team 1":"Team 3";}
    state.finalist1=null;state.finalist2=null;state.finalists_manual=false;invalidateFinal(state);applyAutomaticFinalists(state);
   }else if(round==="final"){
    if(!state.finalist1||!state.finalist2)return json({error:"Finalists are not set yet."},400);if(!validBO5(a,b))return json({error:"Championship result must be 3-0, 3-1, 3-2, 0-3, 1-3, or 2-3."},400);state.final_team1_score=a;state.final_team2_score=b;state.champion=a===3?state.finalist1:state.finalist2;
   }else return json({error:"Invalid round"},400);
   state.updated_at=new Date().toISOString();await bracketStore().setJSON("state",state);return json({ok:true,bracket:{...state,standings:standingsFor(state)}});
  }
  if(action==="set-finalists"){
   const state=await getBracket();if(!rrComplete(state))return json({error:"Record all 3 round-robin matches first."},400);const allowed=["Team 1","Team 2","Team 3"];if(!allowed.includes(finalist1)||!allowed.includes(finalist2)||finalist1===finalist2)return json({error:"Choose two different valid finalists."},400);state.finalist1=finalist1;state.finalist2=finalist2;state.finalists_manual=true;invalidateFinal(state);state.updated_at=new Date().toISOString();await bracketStore().setJSON("state",state);return json({ok:true,bracket:{...state,standings:standingsFor(state)}});
  }
  if(action==="reset-bracket"){const state={...emptyBracket(),updated_at:new Date().toISOString()};await bracketStore().setJSON("state",state);return json({ok:true,bracket:{...state,standings:standingsFor(state)}});}
  if(action==="auto-draft"){const players=(await all(approved)).filter(Boolean);if(players.length<18)return json({error:`Need at least 18 approved players to draft 3 full teams. Currently approved: ${players.length}.`},409);const shuffled=shuffle(players),selected=shuffled.slice(0,18),extras=shuffled.slice(18),teams=buildBalancedTeams(selected),now=new Date().toISOString();await bracketStore().setJSON("state",{...emptyBracket(),updated_at:now});for(let i=0;i<teams.length;i++)for(const p of teams[i]){p.tournament_group=`Team ${i+1}`;p.team_assigned_at=now;await approved.setJSON(p.id,p);}for(const p of extras){p.tournament_group="Bench";p.team_assigned_at=now;await approved.setJSON(p.id,p);}return json({ok:true,drafted:18,benched:extras.length,teams:teams.map(t=>t.map(p=>p.gamer_tag))});}
  if(!id)return json({error:"Missing id"},400);
  if(action==="approve"){const p=await pending.get(id,{type:"json"});if(!p)return json({error:"Registration not found"},404);p.approved_at=new Date().toISOString();p.tournament_group=p.tournament_group||"Unassigned";await approved.setJSON(id,p);await pending.delete(id);return json({ok:true});}
  if(action==="reject"){await pending.delete(id);return json({ok:true});}
  if(action==="remove"){await approved.delete(id);return json({ok:true});}
  if(action==="assign"){const allowed=["Team 1","Team 2","Team 3","Free Agents","Bench","Unassigned"];if(!allowed.includes(group))return json({error:"Invalid team/group"},400);const p=await approved.get(id,{type:"json"});if(!p)return json({error:"Approved player not found"},404);if(group.startsWith("Team ")){const players=(await all(approved)).filter(Boolean);const count=players.filter(x=>x.id!==id&&x.tournament_group===group).length;if(count>=6)return json({error:`${group} already has 6 players.`},409);}p.tournament_group=group;p.team_assigned_at=new Date().toISOString();await approved.setJSON(id,p);return json({ok:true});}
  return json({error:"Invalid action"},400);
 }catch(e){return json({error:e?.message||"Server error"},500)}
};
