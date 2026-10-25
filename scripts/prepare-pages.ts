import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve(".output/public");
const assetsDir = path.join(publicDir, "assets");

if (!fs.existsSync(assetsDir)) {
  console.error("Assets directory not found:", assetsDir);
  process.exit(1);
}

const files = fs.readdirSync(assetsDir);
const cssFile = files.find((f) => f.startsWith("styles-") && f.endsWith(".css"));
const jsFile = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));

if (!cssFile || !jsFile) {
  console.warn("Could not find styles-*.css or index-*.js in assets", files);
}

// GitHub Pages base path
const basePath = "/Xperter";

const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lumen — Chrome & glass communication</title>
    <link rel="icon" href="${basePath}/favicon.ico" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Big+Shoulders+Display:wght@800;900&family=Geist:wght@200..600&display=swap" />
    ${cssFile ? `<link rel="stylesheet" href="${basePath}/assets/${cssFile}" />` : ""}
    <script>
      // Single Page App redirect handling for GitHub Pages
      (function() {
        var redirect = sessionStorage.redirect;
        delete sessionStorage.redirect;
        if (redirect && redirect != location.href) {
          history.replaceState(null, null, redirect);
        }
      })();
    </script>
  </head>
  <body>
    ${jsFile ? `<script type="module" src="${basePath}/assets/${jsFile}"></script>` : ""}
  </body>
</html>
`;

// 404.html script that captures route and redirects to index.html for SPA router
const notFoundHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lumen — Redirecting...</title>
    <script>
      sessionStorage.redirect = location.href;
    </script>
    <meta http-equiv="refresh" content="0;URL='${basePath}/'" />
  </head>
  <body>
    <p>Redirecting to <a href="${basePath}/">${basePath}/</a>...</p>
  </body>
</html>
`;

fs.writeFileSync(path.join(publicDir, "index.html"), htmlContent);
fs.writeFileSync(path.join(publicDir, "404.html"), notFoundHtml);
fs.writeFileSync(path.join(publicDir, ".nojekyll"), "");

console.log("Successfully prepared GitHub Pages static files (index.html, 404.html, .nojekyll) in .output/public");
