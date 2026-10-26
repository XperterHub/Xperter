import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve(".output/public");
const serverFile = path.resolve(".output/server/index.mjs");
const basePath = process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : (process.env.GITHUB_PAGES === "true" ? "/Xperter" : "");

async function main() {
  if (!fs.existsSync(publicDir)) {
    console.error("Public directory not found:", publicDir);
    process.exit(1);
  }

  if (!fs.existsSync(serverFile)) {
    console.error("Server build not found at:", serverFile);
    process.exit(1);
  }

  console.log("Loading Nitro SSR server...");
  const serverModule = await import(serverFile);
  const server = serverModule.default || serverModule;

  const routes = [
    { route: "/", targets: ["index.html"] },
    { route: "/sign-in", targets: ["sign-in.html", "sign-in/index.html"] },
    { route: "/sign-up", targets: ["sign-up.html", "sign-up/index.html"] },
    { route: "/welcome", targets: ["welcome.html", "welcome/index.html"] },
    { route: "/forgot-password", targets: ["forgot-password.html", "forgot-password/index.html"] },
    { route: "/app/page-2", targets: ["app/page-2/index.html"] },
    { route: "/app/messages", targets: ["app/messages/index.html"] },
    { route: "/privacy", targets: ["privacy.html", "privacy/index.html"] },
    { route: "/terms", targets: ["terms.html", "terms/index.html"] },
  ];

  for (const item of routes) {
    try {
      console.log(`Prerendering route: ${item.route}`);
      let currentUrl = `http://localhost${item.route}`;
      let res = await server.fetch(new Request(currentUrl), {}, { waitUntil: () => {} });
      let redirects = 0;
      while ((res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) && redirects < 5) {
        const loc = res.headers.get("location");
        if (!loc) break;
        currentUrl = new URL(loc, currentUrl).toString();
        console.log(`  -> Followed redirect to: ${currentUrl}`);
        res = await server.fetch(new Request(currentUrl), {}, { waitUntil: () => {} });
        redirects++;
      }

      let html = await res.text();
      if (!html || res.status !== 200) {
        console.warn(`Route ${item.route} returned status ${res.status}`);
        continue;
      }

      // Rewrite absolute asset paths to base path
      html = html.split('"/assets/').join(`"${basePath}/assets/`);
      html = html.split("'/assets/").join(`'${basePath}/assets/`);
      html = html.split('"/favicon.ico').join(`"${basePath}/favicon.ico`);
      html = html.split('"/glyphs/').join(`"${basePath}/glyphs/`);
      html = html.split('"/xperter-logo.svg').join(`"${basePath}/xperter-logo.svg`);
      html = html.split('"/robots.txt').join(`"${basePath}/robots.txt`);

      // Inject SPA redirect recovery snippet into head
      const spaRedirectScript = `<script>
        (function() {
          var redirect = sessionStorage.redirect;
          delete sessionStorage.redirect;
          if (redirect && redirect != location.href) {
            history.replaceState(null, null, redirect);
          }
        })();
      </script>`;

      if (html.includes("<head>")) {
        html = html.replace("<head>", `<head>${spaRedirectScript}`);
      }

      for (const target of item.targets) {
        const dest = path.join(publicDir, target);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, html);
        console.log(`  -> Wrote ${target} (${html.length} bytes)`);
      }
    } catch (err) {
      console.error(`Failed to prerender ${item.route}:`, err);
    }
  }

  // 404.html script that captures route and redirects to index.html for SPA router
  const notFoundHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lumen — Redirecting...</title>
    <script>
      sessionStorage.redirect = location.href;
    </script>
    <meta http-equiv="refresh" content="0;URL='${basePath ? `${basePath}/` : "/"}'" />
  </head>
  <body>
    <p>Redirecting to <a href="${basePath ? `${basePath}/` : "/"}">${basePath ? `${basePath}/` : "/"}</a>...</p>
  </body>
</html>
`;

  fs.writeFileSync(path.join(publicDir, "404.html"), notFoundHtml);
  fs.writeFileSync(path.join(publicDir, ".nojekyll"), "");

  console.log("Successfully prepared all static pages, 404.html, and .nojekyll in .output/public!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
