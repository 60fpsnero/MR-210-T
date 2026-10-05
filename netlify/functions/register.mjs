import { pendingStore, json } from "./_shared.mjs";
export default async (req) => {
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const b=await req.json();
    const required=["gamer_tag","discord","role","current_rank","peak_rank","team_status"];
    if(required.some(k=>!String(b[k]||"").trim())) return json({error:"Missing required fields"},400);
    if(!["Vanguard","Duelist","Strategist","Flex"].includes(b.role)) return json({error:"Invalid role"},400);
    if(!["Has Team","Free Agent"].includes(b.team_status)) return json({error:"Invalid team status"},400);
    if(b.team_status==="Has Team" && !String(b.team_name||"").trim()) return json({error:"Team name required"},400);
    const id=crypto.randomUUID();
    const record={id,created_at:new Date().toISOString(),gamer_tag:String(b.gamer_tag).slice(0,40),discord:String(b.discord).slice(0,80),role:b.role,current_rank:String(b.current_rank).slice(0,40),peak_rank:String(b.peak_rank).slice(0,40),team_status:b.team_status,team_name:b.team_status==="Has Team"?String(b.team_name).slice(0,60):null};
    await pendingStore().setJSON(id,record);
    return json({ok:true});
  }catch(e){return json({error:"Could not save registration"},500)}
};