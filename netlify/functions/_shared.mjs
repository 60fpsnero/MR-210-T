import { getStore } from "@netlify/blobs";

export const json = (data, status=200) =>
  new Response(JSON.stringify(data), {
    status,
    headers:{
      "Content-Type":"application/json",
      "Cache-Control":"no-store"
    }
  });

export const adminOK = req => {
  const expected = process.env.ADMIN_PASSWORD || "";
  const got = req.headers.get("x-admin-password") || "";
  return expected.length >= 6 && got === expected;
};

export const pendingStore = () =>
  getStore({name:"tournament-pending", consistency:"strong"});

export const approvedStore = () =>
  getStore({name:"tournament-approved", consistency:"strong"});

export const safePublic = p => ({
  id:p.id,
  gamer_tag:p.gamer_tag,
  role:p.role,
  current_rank:p.current_rank,
  peak_rank:p.peak_rank,
  team_status:p.team_status,
  team_name:p.team_status==="Has Team" ? p.team_name : null,
  tournament_group:p.tournament_group || "Unassigned"
});
