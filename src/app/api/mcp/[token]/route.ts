import { createMcpHandler } from "mcp-handler";
import { runAsUser } from "@/lib/data";
import { clientForToken } from "@/lib/mcp/auth";
import { INSTRUCTIONS, registerTools } from "@/lib/mcp/server";

/**
 * Remote MCP endpoint for the owner's Claude app: https://<app>/api/mcp/<token>.
 * The token (from Settings → Connect Claude) is checked on every request; the
 * tools then run as its owner, with Row Level Security.
 */
const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "kharcha-paani", version: "1.0.0" },
  instructions: INSTRUCTIONS,
});

async function serve(request: Request, ctx: RouteContext<"/api/mcp/[token]">) {
  const { token } = await ctx.params;
  const db = await clientForToken(token);
  if (!db) return new Response("Unknown or revoked connector link.", { status: 404 });
  return runAsUser(db as never, () => handler(request));
}

export { serve as GET, serve as POST, serve as DELETE };
