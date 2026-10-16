// POST /api/rpc  { method, params }
// Forwards a small allow-list of Solana JSON-RPC calls to your RPC, so the key stays server-side.
//
// Env vars:
//   RPC_URL  recommended - e.g. https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
//            (falls back to the public mainnet RPC, which is rate-limited)

const ALLOW = new Set(["sendTransaction", "getSignatureStatuses", "getBalance", "getLatestBlockhash"]);

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let b;
  try { b = await req.json(); } catch { return Response.json({ error: { message: "Bad request" } }, { status: 400 }); }
  if (!ALLOW.has(b.method)) return Response.json({ error: { message: "Method not allowed" } }, { status: 403 });

  const r = await fetch(process.env.RPC_URL || "https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: b.method, params: Array.isArray(b.params) ? b.params : [] }),
  });
  return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
};

export const config = { path: "/api/rpc" };
