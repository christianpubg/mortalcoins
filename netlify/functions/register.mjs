// POST /api/register  { mint, sig }
// Called by the site right after a launch confirms. Verifies the launch on-chain and adds the
// coin to the shared list everyone sees. (If this call never happens, /api/coins picks the coin
// up on its own a minute later.)
import { coinsStore, pendingStore, verifyAndSave, json, sleep, B58 } from "../../lib/mortal.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const mint = String(b.mint || ""), sig = String(b.sig || "");
  if (!B58.test(mint) || !/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig)) return json({ error: "Bad request" }, 400);

  const existing = await coinsStore().get(mint, { type: "json" });
  if (existing) return json({ coin: existing });
  const p = await pendingStore().get(mint, { type: "json" });
  if (!p) return json({ error: "Unknown launch" }, 404);

  let coin = null;
  for (let i = 0; i < 5 && !coin; i++) {
    try { coin = await verifyAndSave(p, sig); } catch {}
    if (!coin) await sleep(1500);
  }
  if (!coin) return json({ error: "Not verified yet" }, 202);
  return json({ coin });
};

export const config = { path: "/api/register" };
