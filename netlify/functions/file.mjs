// GET /api/file/img/<mint>        the coin's image
// GET /api/file/meta/<mint>.json  the coin's metadata (this is the URI stored on-chain)
import { filesStore, B58 } from "../../lib/mortal.mjs";

export default async (req) => {
  const m = /\/api\/file\/(img|meta)\/([1-9A-HJ-NP-Za-km-z]{32,44})(\.json)?$/.exec(new URL(req.url).pathname);
  if (!m || !B58.test(m[2])) return new Response("Not found", { status: 404 });
  const files = filesStore();
  const cache = { "Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*" };
  if (m[1] === "meta") {
    const meta = await files.get(`meta/${m[2]}`, { type: "json" });
    if (!meta) return new Response("Not found", { status: 404 });
    return new Response(JSON.stringify(meta), { headers: { "Content-Type": "application/json", ...cache } });
  }
  const r = await files.getWithMetadata(`img/${m[2]}`, { type: "arrayBuffer" });
  if (!r || !r.data) return new Response("Not found", { status: 404 });
  return new Response(r.data, { headers: { "Content-Type": (r.metadata && r.metadata.contentType) || "image/png", ...cache } });
};

export const config = { path: "/api/file/*" };
