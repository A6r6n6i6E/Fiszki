/* Rebuild ready-to-host data, service-worker version and standalone preview.
 * Run from anywhere: node tools/build.cjs
 * No npm install or external library is needed.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const pub = path.join(root, "public");
const T = require(path.join(pub, "vocabulary-txt.js"));
const reference = JSON.parse(fs.readFileSync(path.join(root, "data/words.json"), "utf8"));
const data = T.compile(fs.readFileSync(path.join(root, "data/slowka.txt"), "utf8"), reference);
data.version = 2;
data.sourceFile = "data/slowka.txt";
const ids = new Set();
const categories = new Set(data.categories.map(c => c.id));
for (const word of data.words) {
  if (!word.id || ids.has(word.id) || !categories.has(word.category) ||
      !word.en || !word.pl || !Array.isArray(word.answers) || word.answers.length === 0 ||
      word.answers.some(answer => typeof answer !== "string" || !answer.trim())) {
    throw new Error("Niepoprawna fiszka lub powtorzony identyfikator: " + word.id);
  }
  ids.add(word.id);
}
const vocabulary = "/* Generated from data/slowka.txt by tools/build.cjs. */\n" +
  "globalThis.SLOWKO_DATA = " + JSON.stringify(data).replace(/<\//g, "<\\/") + ";\n";
fs.writeFileSync(path.join(pub, "vocabulary.js"), vocabulary);
const assets = [
  "./", "./index.html", "./styles.css", "./vocabulary.js", "./core.js", "./vocabulary-txt.js", "./app.js",
  "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png",
  "./icons/icon-512.png", "./icons/icon-maskable.png", "./icons/apple-touch-icon.png"
];
const hash = crypto.createHash("sha256");
for (const asset of assets.slice(1)) hash.update(fs.readFileSync(path.join(pub, asset)));
const version = hash.digest("hex").slice(0, 16);
const sw = `"use strict";
/* Generated cache version: ${version}. Do not edit; run node tools/build.cjs. */
const PREFIX = "slowko:" + self.registration.scope + ":";
const CACHE = PREFIX + "${version}";
const ASSETS = ${JSON.stringify(assets)};
const urlOf = path => new URL(path, self.registration.scope).href;
const ASSET_URLS = new Set(ASSETS.map(urlOf));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(urlOf));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const shell = await cache.match(urlOf("./index.html"));
      if (shell) return shell;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(urlOf("./index.html"), response.clone());
        return response;
      } catch {
        return (await cache.match(urlOf("./index.html"))) || Response.error();
      }
    })());
  } else if (ASSET_URLS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
`;
fs.writeFileSync(path.join(pub, "sw.js"), sw);
let demo = fs.readFileSync(path.join(pub, "index.html"), "utf8")
  .replace(/<!-- PWA_LINKS_START -->[\s\S]*?<!-- PWA_LINKS_END -->/,
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' +
    encodeURIComponent(fs.readFileSync(path.join(pub, "icons/icon.svg"), "utf8")) + '">')
  .replace('<link rel="stylesheet" href="./styles.css">',
    () => "<style>\n" + fs.readFileSync(path.join(pub, "styles.css"), "utf8") + "\n</style>")
  .replace(/  <script src="\.\/(?:vocabulary|core|vocabulary-txt|app)\.js" defer><\/script>\n/g, "");
const code = ["window.SLOWKO_STANDALONE = true;", vocabulary,
  fs.readFileSync(path.join(pub, "core.js"), "utf8"),
  fs.readFileSync(path.join(pub, "vocabulary-txt.js"), "utf8"),
  fs.readFileSync(path.join(pub, "app.js"), "utf8")].join("\n");
demo = demo.replace("</body>", () => "<script>\n" + code.replace(/<\/script/gi, "<\\/script") + "\n</script>\n</body>");
fs.writeFileSync(path.join(root, "slowko-demo.html"), demo);
console.log("Ready:", data.words.length, "cards,", data.categories.length, "categories. Cache:", version);
