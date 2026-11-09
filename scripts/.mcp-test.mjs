import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: u } = await db.auth.admin.listUsers(); const uid = u.users[0].id;
const token = randomBytes(32).toString("base64url");
const { data: row } = await db.from("api_tokens").insert({ user_id: uid, name: "QA test", token_hash: createHash("sha256").update(token).digest("hex") }).select("id").single();
const url = (process.argv[2] ?? "http://localhost:3100") + "/api/mcp/" + token;
let id = 0;
async function rpc(method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const body = await r.text();
  const json = body.startsWith("{") ? JSON.parse(body) : JSON.parse(body.split("\n").find((l) => l.startsWith("data:")).slice(5));
  return json;
}
try {
  const bad = await fetch(url.replace(token, "x".repeat(43)), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  console.log("bad token →", bad.status);
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "qa", version: "1" } });
  console.log("server:", init.result?.serverInfo, "| instructions:", (init.result?.instructions ?? "").slice(0, 50) + "…");
  const tools = await rpc("tools/list", {});
  console.log("tools:", tools.result?.tools?.map((t) => t.name).join(", "));
  const ov = await rpc("tools/call", { name: "get_overview", arguments: {} });
  console.log("overview:", ov.result?.content?.[0]?.text?.replace(/\s+/g, " ").slice(0, 260));
  const dr = await rpc("tools/call", { name: "draft_transactions", arguments: { items: [{ type: "expense", amount: 12.34, category: "groceries", account: "triangle", note: "QA-MCP" }] } });
  const draft = JSON.parse(dr.result.content[0].text);
  console.log("draft:", JSON.stringify(draft));
  const before = (await db.from("transactions").select("id").eq("note", "QA-MCP")).data.length;
  const cf = await rpc("tools/call", { name: "confirm_draft", arguments: { draft_id: draft.draft_id } });
  console.log("confirm:", cf.result.content[0].text.replace(/\s+/g, " "));
  const again = await rpc("tools/call", { name: "confirm_draft", arguments: { draft_id: draft.draft_id } });
  console.log("confirm twice:", again.result.content[0].text);
  const amb = await rpc("tools/call", { name: "draft_transactions", arguments: { items: [{ amount: 5, category: "home" }] } });
  console.log("ambiguous:", amb.result.content[0].text.replace(/\s+/g, " ").slice(0, 200));
  const after = (await db.from("transactions").select("id,source,amount_cents").eq("note", "QA-MCP")).data;
  console.log("rows before confirm:", before, "| after:", JSON.stringify(after));
} finally {
  await db.from("transactions").delete().eq("note", "QA-MCP");
  await db.from("mcp_drafts").delete().eq("user_id", uid);
  await db.from("api_tokens").delete().eq("id", row.id);
  console.log("cleaned up");
}
