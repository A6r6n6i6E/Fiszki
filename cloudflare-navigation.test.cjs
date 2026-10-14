/* Regression tests: real HTTP redirects and native Fetch Response objects,
 * with an in-memory CacheStorage/worker-event harness. Not a browser E2E test.
 * Run: node --test tests/cloudflare-navigation.test.cjs
 * SLOWKO_WORKER_SOURCE may point to an older sw.js to reproduce failed assertions.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PUBLIC = path.resolve(__dirname, '../public');
const source = fs.readFileSync(process.env.SLOWKO_WORKER_SOURCE || path.join(PUBLIC, 'sw.js'), 'utf8');

async function setup(t, {redirectRoot = false} = {}) {
  const server = http.createServer((request, response) => {
    const route = new URL(request.url, 'http://test.invalid').pathname;
    if (route === '/app/index.html' || (redirectRoot && route === '/app/')) {
      response.writeHead(308, {Location: redirectRoot ? '/app/home' : '/app/'});
      response.end();
      return;
    }
    const relative = route === '/app/' || route === '/app/home' ? 'index.html' : route.slice('/app/'.length);
    const target = path.resolve(PUBLIC, relative);
    if (!target.startsWith(PUBLIC + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404); response.end('Not found'); return;
    }
    response.writeHead(200, {
      'Content-Type': relative.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream',
      'Content-Security-Policy': "default-src 'self'",
      'Cache-Control': 'no-cache'
    });
    response.end(fs.readFileSync(target));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const scope = 'http://127.0.0.1:' + server.address().port + '/app/';
  const listeners = {}, stores = new Map();
  const state = {offline: false, openFails: false, writeFails: false, fetches: 0, claimed: false};
  const keyOf = value => typeof value === 'string' ? value : value.url;
  const network = async input => {
    state.fetches++;
    if (state.offline) throw new TypeError('Simulated offline network');
    if (typeof input === 'string' || input instanceof Request) return fetch(input);
    return fetch(input.url, {method: input.method || 'GET', redirect: input.redirect || 'follow'});
  };
  const caches = {
    async open(name) {
      if (state.openFails) throw new Error('CacheStorage unavailable');
      if (!stores.has(name)) stores.set(name, new Map());
      const map = stores.get(name);
      return {
        async addAll(inputs) {
          const entries = await Promise.all(inputs.map(async input => {
            const response = await network(input);
            if (!response.ok) throw new Error('Precache HTTP error');
            return [keyOf(input), response];
          }));
          for (const [key, response] of entries) map.set(key, response.clone());
        },
        async match(input) { return map.get(keyOf(input))?.clone(); },
        async put(input, response) {
          if (state.writeFails) throw new Error('Simulated storage quota error');
          map.set(keyOf(input), response.clone());
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const self = {
    registration: {scope}, location: {origin: new URL(scope).origin},
    addEventListener(name, callback) { listeners[name] = callback; },
    async skipWaiting() {},
    clients: {async claim() { state.claimed = true; }}
  };
  vm.runInNewContext(source, {self, caches, fetch: network, Request, Response, URL, Set, Promise});
  return {
    scope, state, stores,
    async lifecycle(name) {
      let promise;
      listeners[name]({waitUntil(p) { promise = p; }});
      await promise;
    },
    request(relative = '', mode = 'navigate') {
      let promise;
      listeners.fetch({
        request: {url: new URL(relative, scope).href, method: 'GET', mode, redirect: mode === 'navigate' ? 'manual' : 'follow'},
        respondWith(p) { promise = p; }
      });
      return promise;
    },
    get store() { return [...stores.values()][0]; }
  };
}

test('Regression precondition: index.html on a Pages-like server produces a followed redirect', async t => {
  const h = await setup(t);
  await h.lifecycle('install');
  const redirected = h.store.get(h.scope + 'index.html');
  assert.equal(redirected.status, 200);
  assert.equal(redirected.redirected, true);
  assert.equal(redirected.url, h.scope);
});

test('First online navigation works before precaching', async t => {
  const h = await setup(t);
  const response = await h.request();
  assert.equal(response.status, 200);
  assert.equal(response.redirected, false);
  assert.match(await response.text(), /id="answer"/);
});

test('Repeated navigations return a navigation-safe shell after a real index.html redirect', async t => {
  const h = await setup(t);
  await h.lifecycle('install');
  for (let i = 0; i < 5; i++) {
    const response = await h.request();
    assert.equal(response.redirected, false, 'A navigation with redirect=manual must not receive a followed redirect');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /id="answer"/);
  }
});

test('Offline reloads and query-string entry URLs work after Pages-like precaching', async t => {
  const h = await setup(t);
  await h.lifecycle('install');
  h.state.offline = true;
  for (const entry of ['', '?source=homescreen', 'index.html']) {
    const response = await h.request(entry);
    assert.equal(response.redirected, false);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /id="answer"/);
  }
  for (const asset of ['app.js', 'vocabulary.js', 'vocabulary-txt.js', 'styles.css']) {
    assert.equal((await h.request(asset, 'cors')).status, 200);
  }
});

test('Even a redirected canonical root is normalized; HTML and security headers are preserved', async t => {
  const h = await setup(t, {redirectRoot: true});
  await h.lifecycle('install');
  assert.equal(h.store.get(h.scope).redirected, true);
  h.state.offline = true;
  const response = await h.request();
  assert.equal(response.redirected, false);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
  assert.equal(response.headers.get('Content-Security-Policy'), "default-src 'self'");
  assert.match(await response.text(), /id="answer"/);
});

test('CacheStorage read failure falls back to online navigation', async t => {
  const h = await setup(t);
  h.state.openFails = true;
  const response = await h.request();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="answer"/);
});

test('CacheStorage write failure does not discard a working network response', async t => {
  const h = await setup(t);
  h.state.writeFails = true;
  const response = await h.request();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="answer"/);
  assert.equal((await h.request('app.js', 'cors')).status, 200);
});

test('A manual network redirect is passed through and is not cached as the shell', async t => {
  const h = await setup(t, {redirectRoot: true});
  const response = await h.request();
  // Node exposes status 308 rather than a browser opaqueredirect wrapper.
  assert.equal(response.status, 308);
  assert.equal(h.store.has(h.scope), false);
});

test('Unrelated document navigations are not replaced by the app shell', async t => {
  const h = await setup(t);
  assert.equal(h.request('help.html'), undefined);
  assert.equal(h.request('sw.js'), undefined);
});

test('An unavailable offline shell returns a readable HTTP error rather than Response.error()', async t => {
  const h = await setup(t);
  h.state.offline = true;
  const response = await h.request();
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Brak polaczenia/);
});

test('Activation removes old app caches but not other applications or scopes', async t => {
  const h = await setup(t);
  await h.lifecycle('install');
  h.stores.set('slowko:' + h.scope + ':old-version', new Map());
  h.stores.set('slowko:https://other.test/:old-version', new Map());
  h.stores.set('other-application', new Map());
  await h.lifecycle('activate');
  assert.equal(h.stores.has('slowko:' + h.scope + ':old-version'), false);
  assert.equal(h.stores.has('slowko:https://other.test/:old-version'), true);
  assert.equal(h.stores.has('other-application'), true);
  assert.equal(h.state.claimed, true);
});
