import { approvedStore, safePublic, json } from "./_shared.mjs";
export default async () => {
 try{
  const store=approvedStore(); const {blobs}=await store.list();
  const rows=[];
  for(const b of blobs){const p=await store.get(b.key,{type:"json",consistency:"strong"}); if(p) rows.push(safePublic(p));}
  rows.sort((a,b)=>String(a.gamer_tag).localeCompare(String(b.gamer_tag)));
  return json(rows);
 }catch(e){return json({error:"Could not load players"},500)}
};