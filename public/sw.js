"use strict";
/* Generated cache version: cf-navfix-1-db5e4d0dc3a39ab6. Do not edit; run node tools/build.cjs. */
/* Cloudflare navigation fix: use the canonical root, not redirected index.html. */
const PREFIX = "slowko:" + self.registration.scope + ":";
const CACHE = PREFIX + "cf-navfix-1-db5e4d0dc3a39ab6";
const ASSETS = ["./","./index.html","./styles.css","./vocabulary.js","./core.js","./vocabulary-txt.js","./app.js","./manifest.webmanifest","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable.png","./icons/apple-touch-icon.png"];
const urlOf = path => new URL(path, self.registration.scope).href;
const ASSET_URLS = new Set(ASSETS.map(urlOf));
const SHELL_URL = urlOf("./");
const ENTRY_PATHS = new Set([
  new URL(SHELL_URL).pathname,
  new URL(urlOf("./index.html")).pathname
]);

// A followed redirect is not a valid response to a navigation with redirect
// mode "manual". Rebuild same-origin responses to remove redirect metadata.
// Keep all security and Content-Type headers. Never unwrap cross-origin data.
async function navigationSafe(response) {
  if (!response.redirected) return response;
  const finalURL = new URL(response.url);
  if (finalURL.origin !== self.location.origin ||
      !finalURL.href.startsWith(self.registration.scope)) {
    throw new Error("Refusing a redirected shell outside this app's scope");
  }
  const body = response.body || await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

async function readCache(key) {
  try {
    const cache = await caches.open(CACHE);
    return await cache.match(key);
  } catch {
    // Unavailable CacheStorage must not block a working online application.
    return undefined;
  }
}

async function writeCache(key, response) {
  try {
    const cache = await caches.open(CACHE);
    await cache.put(key, response);
  } catch {
    // Storage pressure must not turn a successful network response into an error.
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new Request(urlOf(path), {cache: "reload"})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE)
        .map(name => caches.delete(name)));
    } catch {
      // Old-cache cleanup is best effort. Local progress is NOT stored here.
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (request.mode === "navigate") {
    // Do not turn unrelated documents (or recovery pages) into the app shell.
    if (!ENTRY_PATHS.has(url.pathname)) return;
    event.respondWith((async () => {
      const shell = await readCache(SHELL_URL);
      if (shell) {
        try { return await navigationSafe(shell); } catch { /* Try the network. */ }
      }
      try {
        let response = await fetch(request);
        if (response.ok) {
          response = await navigationSafe(response);
          await writeCache(SHELL_URL, response.clone());
        }
        // Pass manual HTTP redirects through to the browser without caching them.
        return response;
      } catch {
        return new Response("Brak polaczenia. Polacz sie z internetem i odswiez strone.", {
          status: 503,
          headers: {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"}
        });
      }
    })());
  } else if (ASSET_URLS.has(url.href)) {
    event.respondWith((async () => {
      const cached = await readCache(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await writeCache(request, response.clone());
      return response;
    })());
  }
});
