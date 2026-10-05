import { getStore } from "@netlify/blobs";

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const store=()=>getStore({name:"tournament-bracket",consistency:"strong"});

const emptyBracket=()=>({
  format:"round-robin-v1",
  match1_team1_score:null,match1_team2_score:null,match1_winner:null,
  match2_team2_score:null,match2_team3_score:null,match2_winner:null,
  match3_team1_score:null,match3_team3_score:null,match3_winner:null,
  finalist1:null,finalist2:null,finalists_manual:false,
  final_team1_score:null,final_team2_score:null,champion:null
});

function standingsFor(b){
  const s={"Team 1":{team:"Team 1",wins:0,losses:0,mapsWon:0,mapsLost:0},"Team 2":{team:"Team 2",wins:0,losses:0,mapsWon:0,mapsLost:0},"Team 3":{team:"Team 3",wins:0,losses:0,mapsWon:0,mapsLost:0}};
  const add=(a,c,sa,sb)=>{if(sa==null||sb==null)return; s[a].mapsWon+=sa;s[a].mapsLost+=sb;s[c].mapsWon+=sb;s[c].mapsLost+=sa;if(sa>sb){s[a].wins++;s[c].losses++;}else{s[c].wins++;s[a].losses++;}};
  add("Team 1","Team 2",b.match1_team1_score,b.match1_team2_score);
  add("Team 2","Team 3",b.match2_team2_score,b.match2_team3_score);
  add("Team 1","Team 3",b.match3_team1_score,b.match3_team3_score);
  return Object.values(s).map(x=>({...x,mapDiff:x.mapsWon-x.mapsLost})).sort((a,c)=>c.wins-a.wins||c.mapDiff-a.mapDiff||a.team.localeCompare(c.team));
}

export default async req=>{
  if(req.method!=="GET") return json({error:"GET only"},405);
  try{
    const saved=(await store().get("state",{type:"json"}))||{};
    const b=saved.format==="round-robin-v1"?{...emptyBracket(),...saved}:emptyBracket();
    const standings=standingsFor(b);
    const complete=[b.match1_winner,b.match2_winner,b.match3_winner].every(Boolean);
    const cutoffTied=complete && standings[1] && standings[2] && standings[1].wins===standings[2].wins && standings[1].mapDiff===standings[2].mapDiff && !(b.finalist1&&b.finalist2);
    return json({...b,standings,needs_tiebreak:cutoffTied});
  }catch(e){return json({error:e?.message||"Server error"},500)}
};
