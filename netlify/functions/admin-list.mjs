import { pendingStore, approvedStore, adminOK, json } from "./_shared.mjs";
async function all(store){const {blobs}=await store.list();const rows=[];for(const b of blobs){const p=await store.get(b.key,{type:"json",consistency:"strong"});if(p)rows.push(p)}return rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))}
export default async req => {
 if(!adminOK(req)) return json({error:"Unauthorized"},401);
 try{return json({pending:await all(pendingStore()),approved:await all(approvedStore())})}catch(e){return json({error:"Could not load admin data"},500)}
};