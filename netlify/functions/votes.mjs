import { getStore } from "@netlify/blobs";

const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});

const store=()=>getStore({name:"mr210-votes",consistency:"strong"});
const matches=["round1","round2","final"];

async function getState(){
  const saved=(await store().get("state",{type:"json"}))||{};
  const state={};
  for(const match of matches) state[match]=saved[match]||{counts:{}};
  return state;
}

export default async req=>{
  try{
    if(req.method==="GET") return json(await getState());
    if(req.method!=="POST") return json({error:"GET or POST only"},405);

    const {match,team}=await req.json();
    if(!matches.includes(match)) return json({error:"Invalid matchup"},400);
    if(!team||team==="TBD") return json({error:"Invalid team"},400);

    const state=await getState();
    state[match].counts[team]=Number(state[match].counts[team]||0)+1;
    state.updated_at=new Date().toISOString();
    await store().setJSON("state",state);
    return json(state[match]);
  }catch(e){
    return json({error:e?.message||"Server error"},500);
  }
};
