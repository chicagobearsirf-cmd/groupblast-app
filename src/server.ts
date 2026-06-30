import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // The Facebook automation API only exists in the local Express server started
    // by `npm run dev` (proxied at /api on http://localhost:8080). When the app is
    // built/deployed/previewed there is no such proxy, so /api requests land here.
    // Return a clear JSON error instead of letting them fall through to a confusing
    // SPA/HTML 404 (the cause of "POST /api/facebook/check-session → 404").
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({
          error: `The local API is not reachable from this build (${request.method} ${pathname}). The Facebook automation API only runs locally via \`npm run dev\`.`,
          suggestion:
            "Open the app at http://localhost:8080 (started with `npm run dev`), not a hosted/preview/built URL. The local Express API serves /api on http://localhost:3001 and the dev server proxies it.",
        }),
        { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
