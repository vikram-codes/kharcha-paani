import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login"];

/**
 * Refreshes the Supabase session cookie and does the optimistic auth redirect.
 * Real authorization is RLS in Postgres; this only keeps signed-out visitors on /login.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Claude's connector authenticates with its own token (src/app/api/mcp), not a browser session.
  if (pathname.startsWith("/api/mcp/")) return NextResponse.next();
  // The weekly backup job authenticates with CRON_SECRET (src/app/api/cron).
  if (pathname.startsWith("/api/cron/")) return NextResponse.next();
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isSupabaseConfigured) {
    return isPublic ? NextResponse.next() : NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Validates the JWT (and refreshes it when needed). Don't put code between
  // client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublic) {
    return withCookies(NextResponse.redirect(new URL("/login", request.url)), response);
  }
  if (signedIn && isPublic) {
    return withCookies(NextResponse.redirect(new URL("/", request.url)), response);
  }
  return response;
}

/** Carry refreshed auth cookies over to a redirect response. */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((c) => target.cookies.set(c));
  return target;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files (icons, manifest, images).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
