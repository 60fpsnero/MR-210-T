import { getStore } from "@netlify/blobs";

const json = (data,status=200) => new Response(JSON.stringify(data),{
  status,
  headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});

const emptyBracket = () => ({
  round1_winner:null, round1_loser:null,
  round1_team1_score:null, round1_team2_score:null,
  round2_winner:null, round2_loser:null,
  round2_loser_score:null, round2_team3_score:null,
  champion:null, final_round1_score:null, final_round2_score:null
});

export default async req => {
  if(req.method!=="GET") return json({error:"GET only"},405);
  try{
    const store=getStore({name:"mr210-bracket", consistency:"strong"});
    const saved=(await store.get("state",{type:"json"})) || {};
    return json({...emptyBracket(),...saved});
  }catch(e){
    return json({error:e?.message||"Server error"},500);
  }
};
