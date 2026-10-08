"use strict";
/* Generated cache version: 9cd1a219f238d15f. Do not edit; run node tools/build.cjs. */
const PREFIX = "slowko:" + self.registration.scope + ":";
const CACHE = PREFIX + "9cd1a219f238d15f";
const ASSETS = ["./","./index.html","./styles.css","./vocabulary.js","./core.js","./vocabulary-txt.js","./app.js","./manifest.webmanifest","./icons/icon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable.png","./icons/apple-touch-icon.png"];
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
