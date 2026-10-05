import { getStore } from "@netlify/blobs";
import { pendingStore, approvedStore, adminOK, json } from "./_shared.mjs";

async function all(store){
  const { blobs } = await store.list();
  return Promise.all(blobs.map(b => store.get(b.key,{type:"json"})));
}

const bracketStore = () => getStore({name:"mr210-bracket", consistency:"strong"});

const rankBase = {
  "bronze":1000,"silver":2000,"gold":3000,"platinum":4000,"diamond":5000,
  "grandmaster":6000,"celestial":7000,"eternity":8000,"one above all":9000
};
function rankScore(value){
  const raw=String(value||"").toLowerCase().trim();
  let base=0;
  for(const [name,score] of Object.entries(rankBase)) if(raw.includes(name)) base=Math.max(base,score);
  const m=raw.match(/(?:^|\\s)([1-3])(?:$|\\s)/);
  const division=m?Number(m[1]):null;
  if(base && division) base += (4-division)*100;
  return base;
}
function skillScore(p){
  const current=rankScore(p.current_rank), peak=rankScore(p.peak_rank);
  return current*0.7 + peak*0.3;
}
function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
function buildBalancedTeams(players){
  const candidates=shuffle(players).sort((a,b)=>skillScore(b)-skillScore(a));
  const teams=[[],[],[]], totals=[0,0,0];
  const roleCounts=()=>teams.map(team=>({
    Vanguard:team.filter(p=>p.role==='Vanguard').length,
    Duelist:team.filter(p=>p.role==='Duelist').length,
    Strategist:team.filter(p=>p.role==='Strategist').length,
    Flex:team.filter(p=>p.role==='Flex').length
  }));
  for(const p of candidates){
    const rc=roleCounts();
    const available=[0,1,2].filter(i=>teams[i].length<6);
    available.sort((a,b)=>{
      const roleA=rc[a][p.role]||0, roleB=rc[b][p.role]||0;
      if(roleA!==roleB)return roleA-roleB;
      if(totals[a]!==totals[b])return totals[a]-totals[b];
      return Math.random()-.5;
    });
    const i=available[0]; teams[i].push(p); totals[i]+=skillScore(p);
  }
  return teams;
}

const emptyBracket = () => ({
  round1_winner:null, round1_loser:null,
  round1_team1_score:null, round1_team2_score:null,
  round2_winner:null, round2_loser:null,
  round2_loser_score:null, round2_team3_score:null,
  champion:null, final_round1_score:null, final_round2_score:null
});

async function getBracket(){
  const saved=(await bracketStore().get("state",{type:"json"})) || {};
  return {...emptyBracket(),...saved};
}

function validBO3(a,b){
  return Number.isInteger(a)&&Number.isInteger(b)&&((a===2&&(b===0||b===1))||(b===2&&(a===0||a===1)));
}

export default async req => {
  if(!adminOK(req)) return json({error:"Unauthorized"},401);
  if(req.method!=="POST") return json({error:"POST only"},405);
  try{
    const body=await req.json();
    const {id,action,group,round,scoreA,scoreB}=body;
    if(!action) return json({error:"Missing action"},400);
    const pending=pendingStore(), approved=approvedStore();

    if(action==="set-bracket-result"){
      const a=Number(scoreA), b=Number(scoreB);
      if(!validBO3(a,b)) return json({error:"BO3 result must be 2-0, 2-1, 0-2, or 1-2."},400);
      const bracket=await getBracket();

      if(round==="round1"){
        bracket.round1_team1_score=a;
        bracket.round1_team2_score=b;
        bracket.round1_winner=a===2?"Team 1":"Team 2";
        bracket.round1_loser=a===2?"Team 2":"Team 1";

        // Changing Round 1 invalidates everything after it.
        bracket.round2_winner=null;
        bracket.round2_loser=null;
        bracket.round2_loser_score=null;
        bracket.round2_team3_score=null;
        bracket.final_round1_score=null;
        bracket.final_round2_score=null;
        bracket.champion=null;
      } else if(round==="round2"){
        if(!bracket.round1_loser) return json({error:"Record Round 1 first."},400);
        bracket.round2_loser_score=a;
        bracket.round2_team3_score=b;
        bracket.round2_winner=a===2?bracket.round1_loser:"Team 3";
        bracket.round2_loser=a===2?"Team 3":bracket.round1_loser;

        // Changing Round 2 invalidates the Final.
        bracket.final_round1_score=null;
        bracket.final_round2_score=null;
        bracket.champion=null;
      } else if(round==="final"){
        if(!bracket.round1_winner||!bracket.round2_winner) return json({error:"Record Round 1 and Round 2 first."},400);
        bracket.final_round1_score=a;
        bracket.final_round2_score=b;
        bracket.champion=a===2?bracket.round1_winner:bracket.round2_winner;
      } else {
        return json({error:"Invalid bracket round"},400);
      }

      bracket.updated_at=new Date().toISOString();
      await bracketStore().setJSON("state",bracket);
      return json({ok:true,bracket});
    }

    if(action==="reset-bracket"){
      const bracket={...emptyBracket(),updated_at:new Date().toISOString()};
      await bracketStore().setJSON("state",bracket);
      return json({ok:true,bracket});
    }

    if(action==="auto-draft"){
      const players=(await all(approved)).filter(Boolean);
      if(players.length<18) return json({error:`Need at least 18 approved players to draft 3 full teams. Currently approved: ${players.length}.`},409);
      const shuffled=shuffle(players);
      const selected=shuffled.slice(0,18);
      const extras=shuffled.slice(18);
      const teams=buildBalancedTeams(selected);
      const now=new Date().toISOString();

      // A new draft starts a fresh tournament bracket.
      const freshBracket={...emptyBracket(),updated_at:now};
      await bracketStore().setJSON("state",freshBracket);
      for(let i=0;i<teams.length;i++){
        for(const p of teams[i]){
          p.tournament_group=`Team ${i+1}`;
          p.team_assigned_at=now;
          await approved.setJSON(p.id,p);
        }
      }
      for(const p of extras){
        p.tournament_group="Bench";
        p.team_assigned_at=now;
        await approved.setJSON(p.id,p);
      }
      return json({ok:true,drafted:18,benched:extras.length,teams:teams.map(t=>t.map(p=>p.gamer_tag))});
    }

    if(!id) return json({error:"Missing id"},400);

    if(action==="approve"){
      const p=await pending.get(id,{type:"json"});
      if(!p) return json({error:"Registration not found"},404);
      p.approved_at=new Date().toISOString();
      p.tournament_group=p.tournament_group||"Unassigned";
      await approved.setJSON(id,p);
      await pending.delete(id);
      return json({ok:true});
    }
    if(action==="reject"){ await pending.delete(id); return json({ok:true}); }
    if(action==="remove"){ await approved.delete(id); return json({ok:true}); }

    if(action==="assign"){
      const allowed=["Team 1","Team 2","Team 3","Free Agents","Bench","Unassigned"];
      if(!allowed.includes(group)) return json({error:"Invalid team/group"},400);
      const p=await approved.get(id,{type:"json"});
      if(!p) return json({error:"Approved player not found"},404);

      if(group.startsWith("Team ")){
        const players=(await all(approved)).filter(Boolean);
        const count=players.filter(x=>x.id!==id && x.tournament_group===group).length;
        if(count>=6) return json({error:`${group} already has 6 players.`},409);
      }

      p.tournament_group=group;
      p.team_assigned_at=new Date().toISOString();
      await approved.setJSON(id,p);
      return json({ok:true});
    }

    return json({error:"Invalid action"},400);
  }catch(e){
    return json({error:e?.message||"Server error"},500);
  }
};
