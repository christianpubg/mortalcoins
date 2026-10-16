// Shared helpers for Mortal's Netlify Functions.
// Coins are stored in Netlify Blobs (built into Netlify, no setup needed).
import { getStore } from "@netlify/blobs";

export const coinsStore = () => getStore({ name: "mortal-coins", consistency: "strong" });
export const pendingStore = () => getStore({ name: "mortal-pending", consistency: "strong" });
export const filesStore = () => getStore({ name: "mortal-files", consistency: "strong" });

export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const json = (o, status = 200, headers = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json", ...headers } });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function rpc(method, params) {
  const r = await fetch(process.env.RPC_URL || "https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result;
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function b58decode(s) {
  const bytes = [0];
  for (const ch of s) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) throw new Error("bad base58");
    let carry = v;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 255;
      carry >>= 8;
    }
    while (carry) { bytes.push(carry & 255); carry >>= 8; }
  }
  for (const ch of s) { if (ch === "1") bytes.push(0); else break; }
  return Buffer.from(bytes.reverse());
}

// Checks on-chain that `sig` really created the pending coin (right creator, right mint,
// and the create instruction carries the exact metadata URI we uploaded), then saves it.
export async function verifyAndSave(p, sig) {
  const tx = await rpc("getTransaction", [sig, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
  if (!tx || (tx.meta && tx.meta.err)) return null;
  const msg = tx.transaction.message;
  const loaded = (tx.meta && tx.meta.loadedAddresses) || {};
  const keys = [...msg.accountKeys, ...(loaded.writable || []), ...(loaded.readonly || [])];
  if (keys[0] !== p.creator || !keys.includes(p.mint)) return null;
  const uri = Buffer.from(p.uri);
  const ixs = [...msg.instructions, ...((tx.meta && tx.meta.innerInstructions) || []).flatMap((x) => x.instructions)];
  const carriesUri = ixs.some((ix) => { try { return b58decode(ix.data).includes(uri); } catch { return false; } });
  if (!carriesUri) return null;

  const createdAt = tx.blockTime ? tx.blockTime * 1000 : Date.now();
  const coin = {
    mint: p.mint, name: p.name, symbol: p.symbol, description: p.description, image: p.image,
    twitter: p.twitter || "", website: p.website || "", creator: p.creator,
    lifespanHours: p.lifespanHours, createdAt, diesAt: createdAt + p.lifespanHours * 3600e3, sig,
  };
  await coinsStore().setJSON(p.mint, coin);
  await pendingStore().delete(p.mint);
  return coin;
}

// The coin's very first transaction is the create transaction.
export async function findCreateSig(mint) {
  const sigs = await rpc("getSignaturesForAddress", [mint, { limit: 1000, commitment: "confirmed" }]);
  if (!sigs || !sigs.length) return null;
  const ok = sigs.filter((s) => !s.err);
  return ok.length ? ok[ok.length - 1].signature : null;
}
