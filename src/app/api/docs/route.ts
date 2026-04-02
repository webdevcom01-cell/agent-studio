import { NextResponse } from "next/server";

export const dynamic = "force-static";

/**
 * GET /api/docs
 *
 * Renders Swagger UI pointing at /api/openapi.json.
 * Ships zero npm dependencies — Swagger UI is loaded from cdnjs.
 *
 * Usage:
 *   Open https://your-app.railway.app/api/docs in a browser.
 */
export function GET(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Studio — API Reference</title>
  <meta name="description" content="Interactive API documentation for Agent Studio" />
  <link rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css"
        integrity="sha512-wlFp2RJBiZDnpAK9+KCT4EvVnEoRHqGvOxX6+fBN2/N1e2/pnrFU0k1VVdEYlWNpLcPOqRs0iYz4D5JR7WUQ=="
        crossorigin="anonymous" referrerpolicy="no-referrer" />
  <style>
    * { box-sizing: border-box; }
    body  { margin: 0; background: #0f0f0f; color: #e4e4e7; font-family: ui-sans-serif, system-ui, sans-serif; }

    /* Dark-mode overrides for Swagger UI */
    .swagger-ui                      { filter: invert(0.88) hue-rotate(180deg); }
    .swagger-ui .topbar              { display: none !important; }
    .swagger-ui .info .title         { color: #e4e4e7 !important; }
    .swagger-ui .scheme-container    { background: #18181b !important; }

    /* Header bar */
    #header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 24px;
      background: #18181b;
      border-bottom: 1px solid #27272a;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    #header h1 { margin: 0; font-size: 1rem; font-weight: 600; color: #f4f4f5; }
    #header a  {
      margin-left: auto;
      font-size: 0.75rem;
      color: #a1a1aa;
      text-decoration: none;
    }
    #header a:hover { color: #f4f4f5; }
    #spec-badge {
      font-size: 0.7rem;
      background: #3f3f46;
      color: #a1a1aa;
      border-radius: 4px;
      padding: 2px 6px;
    }
    #swagger-ui { max-width: 1280px; margin: 0 auto; padding: 24px 16px; }
  </style>
</head>
<body>
  <div id="header">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa"
         stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>
    <h1>Agent Studio — API Reference</h1>
    <span id="spec-badge">OpenAPI 3.1</span>
    <a href="/api/openapi.json" target="_blank">openapi.json ↗</a>
  </div>

  <div id="swagger-ui"></div>

  <script
    src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"
    integrity="sha512-IG9cCCOBxJ0E6LUFq6oNe/xn5LbqZQ8DXcOVZLHI1o/5xSW5V3t+nNEEcDMnYaTFYX0fCnAB0B4i6OFKDoJA=="
    crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script
    src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-standalone-preset.min.js"
    integrity="sha512-xtHe5J2+8yFJEJnNGrpkBqJJiibFVhBx0Z0jFSaTbF5HRo5yGn6KqXz+iw0IXp6tQQH5xfcCOhcXA+nnmBQg=="
    crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "/api/openapi.json",
        dom_id: "#swagger-ui",
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset,
        ],
        layout: "StandaloneLayout",
        deepLinking: true,
        displayRequestDuration: true,
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 2,
        tryItOutEnabled: false,
        syntaxHighlight: { theme: "monokai" },
      });
    };
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
