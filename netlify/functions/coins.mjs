// GET /api/coins
// Every coin launched through Mortal, for everyone, with live market caps from DexScreener.
// Also picks up any launch whose /api/register call never arrived (e.g. the tab was closed).
import { coinsStore, pendingStore, filesStore, verifyAndSave, findCreateSig, json } from "../../lib/mortal.mjs";

async function sweepPending() {
  const ps = pendingStore();
  const { blobs } = await ps.list();
  const now = Date.now();
  for (const b of blobs.slice(0, 8)) {
    const p = await ps.get(b.key, { type: "json" });
    if (!p) continue;
    const age = now - (p.preparedAt || 0);
    if (age > 3600e3) {                                         // abandoned launch: clean up its files
      await ps.delete(b.key);
      if (!(await coinsStore().get(b.key))) { const f = filesStore(); await f.delete(`img/${b.key}`); await f.delete(`meta/${b.key}`); }
      continue;
    }
    if (age < 45e3) continue;                                   // give /api/register a chance first
    try { const sig = await findCreateSig(p.mint); if (sig) await verifyAndSave(p, sig); } catch {}
  }
}

async function marketData(mints) {
  const out = {};
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    try {
      const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/" + chunk.join(","));
      if (!r.ok) continue;
      const pairs = await r.json();
      for (const p of Array.isArray(pairs) ? pairs : []) {
        const a = p.baseToken && p.baseToken.address;
        if (!a) continue;
        const liq = (p.liquidity && p.liquidity.usd) || 0;
        if (!out[a] || liq > out[a]._liq) {
          out[a] = { mcap: p.marketCap ?? p.fdv ?? null, price: p.priceUsd ? Number(p.priceUsd) : null, change24h: p.priceChange ? p.priceChange.h24 ?? null : null, _liq: liq };
        }
      }
    } catch {}
  }
  return out;
}

export default async () => {
  try { await sweepPending(); } catch {}
  const cs = coinsStore();
  const { blobs } = await cs.list();
  const coins = (await Promise.all(blobs.map((b) => cs.get(b.key, { type: "json" }).catch(() => null)))).filter(Boolean);
  const md = await marketData(coins.map((c) => c.mint));
  for (const c of coins) { const m = md[c.mint]; if (m) { c.mcap = m.mcap; c.price = m.price; c.change24h = m.change24h; } }
  coins.sort((a, b) => b.createdAt - a.createdAt);
  return json({ coins, now: Date.now() }, 200, {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
  });
};

export const config = { path: "/api/coins" };
