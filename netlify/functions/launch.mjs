// POST /api/launch
// 1. Saves the coin image + metadata JSON on this site (Netlify Blobs), served from /api/file/...
// 2. Asks PumpPortal for an unsigned pump.fun "create" transaction
// 3. Returns it (base64) to the browser, where the creator's wallet + the mint keypair sign it.
//
// No API keys needed. Optional env vars:
//   PRIORITY_FEE  SOL priority fee, default 0.0005

import { pendingStore, coinsStore, filesStore, json, B58 } from "../../lib/mortal.mjs";

const cleanUrl = (u) => {
  u = String(u || "").trim().slice(0, 200);
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { return new URL(u).toString(); } catch { return ""; }
};

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  const name = String(b.name || "").trim().slice(0, 32);
  const symbol = String(b.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const description = String(b.description || "").trim().slice(0, 500);
  const twitter = cleanUrl(b.twitter);
  const website = cleanUrl(b.website);
  const publicKey = String(b.publicKey || "");
  const mint = String(b.mint || "");
  const devBuy = Math.max(0, Math.min(50, Number(b.devBuy) || 0));
  const lifespanHours = Math.round(Number(b.lifespanHours));
  if (!(lifespanHours >= 24 && lifespanHours <= 168)) return json({ error: "Lifespan must be between 24 hours and 7 days." }, 400);
  const diesAt = new Date(Date.now() + lifespanHours * 3600e3).toISOString();

  if (!name || !symbol) return json({ error: "Name and ticker are required." }, 400);
  if (!B58.test(publicKey) || !B58.test(mint)) return json({ error: "Invalid wallet or mint address." }, 400);

  const m = /^data:(image\/(png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(b.image || "");
  if (!m) return json({ error: "Image must be PNG, JPG, GIF or WebP." }, 400);
  const buf = Buffer.from(m[3], "base64");
  if (buf.length > 3.5e6) return json({ error: "Image is too large (max ~3 MB)." }, 400);

  // Never overwrite a coin that already exists or someone else's launch in progress.
  if (await coinsStore().get(mint)) return json({ error: "That coin already exists." }, 409);
  const prev = await pendingStore().get(mint, { type: "json" });
  if (prev && prev.creator !== publicKey) return json({ error: "Try again." }, 409);

  const base = (process.env.URL || new URL(req.url).origin).replace(/\/$/, "");
  try {
    const files = filesStore();
    await files.set(`img/${mint}`, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { metadata: { contentType: m[1] } });
    const metadata = {
      name,
      symbol,
      description,
      image: `${base}/api/file/img/${mint}`,
      showName: true,
      ...(twitter && { twitter }),
      ...(website && { website }),
      mortal: { lifespanHours, diesAt },
    };
    await files.setJSON(`meta/${mint}`, metadata);
    const uri = `${base}/api/file/meta/${mint}.json`;

    const r = await fetch("https://pumpportal.fun/api/trade-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey,
        action: "create",
        tokenMetadata: { name, symbol, uri },
        mint,
        denominatedInSol: "true",
        amount: devBuy,
        slippage: 10,
        priorityFee: Number(process.env.PRIORITY_FEE) || 0.0005,
        pool: "pump",
      }),
    });
    if (r.status !== 200) {
      const t = await r.text().catch(() => "");
      return json({ error: "PumpPortal couldn't build the transaction: " + (t || r.statusText).slice(0, 200) }, 502);
    }
    const tx = Buffer.from(await r.arrayBuffer()).toString("base64");
    // Remember this launch so it can be verified on-chain and shown to everyone once it confirms.
    await pendingStore().setJSON(mint, { mint, name, symbol, description, image: metadata.image, twitter, website, uri, creator: publicKey, lifespanHours, preparedAt: Date.now() });
    return json({ tx, uri, image: metadata.image, diesAt });
  } catch (e) {
    return json({ error: e.message || "Launch failed." }, 502);
  }
};

export const config = { path: "/api/launch" };
