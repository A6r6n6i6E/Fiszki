/* Service-worker unit tests in a simulated worker environment.
 * These verify cache logic, not a real browser's installation/eviction behavior.
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const PUBLIC = path.resolve(__dirname,"../public");
const source = fs.readFileSync(path.join(PUBLIC,"sw.js"),"utf8");

function harness(scope="https://slowko.test/sub/") {
  const listeners = {};
  const stores = new Map();
  let offline=false;
  let claimed=false, skipped=false;
  let fetches=0;
  const keyOf = request => typeof request==="string" ? request : request.url;
  const network = async request => {
    fetches++;
    if (offline) throw new Error("Offline test");
    const url = new URL(keyOf(request));
    const relative=url.pathname.slice(new URL(scope).pathname.length) || "index.html";
    const local=path.resolve(PUBLIC,relative);
    if (!local.startsWith(PUBLIC+path.sep) || !fs.existsSync(local)) return new Response("Not found",{status:404});
    return new Response(fs.readFileSync(local),{status:200});
  };
  const caches={
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const map=stores.get(name);
      return {
        async addAll(urls){
          for(const url of urls){
            const response=await network(url);
            if(!response.ok)throw new Error("Missing precache asset: "+url);
            map.set(url,response);
          }
        },
        async match(request){const response=map.get(keyOf(request));return response?.clone();},
        async put(request,response){map.set(keyOf(request),response.clone());}
      };
    },
    async keys(){return [...stores.keys()];},
    async delete(name){return stores.delete(name);}
  };
  const self={
    registration:{scope},
    location:{origin:new URL(scope).origin},
    clients:{async claim(){claimed=true;}},
    async skipWaiting(){skipped=true;},
    addEventListener(name,callback){listeners[name]=callback;}
  };
  vm.runInNewContext(source,{self,caches,fetch:network,URL,Set,Response,Promise});
  return {
    stores,
    async lifecycle(name){let done;listeners[name]({waitUntil(p){done=p;}});await done;},
    request(url,mode="cors",method="GET"){
      let response;
      listeners.fetch({request:{url,mode,method},respondWith(p){response=p;}});
      return response;
    },
    setOffline(value){offline=value;},
    get claimed(){return claimed;},
    get skipped(){return skipped;},
    get fetches(){return fetches;}
  };
}

test("Installation precaches the shell, vocabulary and icons using relative scope URLs",async()=>{
  const h=harness();
  await h.lifecycle("install");
  const store=[...h.stores.values()][0];
  assert.equal(store.size,13);
  assert.ok(store.has("https://slowko.test/sub/vocabulary-txt.js"));
  assert.ok(store.has("https://slowko.test/sub/index.html"));
  assert.ok(store.has("https://slowko.test/sub/vocabulary.js"));
  assert.ok(store.has("https://slowko.test/sub/icons/apple-touch-icon.png"));
  assert.equal(h.skipped,true);
});
test("Activation deletes only old versions belonging to this exact app scope",async()=>{
  const h=harness();
  h.stores.set("slowko:https://slowko.test/sub/:old",new Map());
  h.stores.set("slowko:https://slowko.test/other/:old",new Map());
  h.stores.set("unrelated-app",new Map());
  await h.lifecycle("install");
  await h.lifecycle("activate");
  assert.equal(h.stores.has("slowko:https://slowko.test/sub/:old"),false);
  assert.equal(h.stores.has("slowko:https://slowko.test/other/:old"),true);
  assert.equal(h.stores.has("unrelated-app"),true);
  assert.equal(h.claimed,true);
});
test("Offline navigation returns the precached HTML and all core scripts",async()=>{
  const h=harness();
  await h.lifecycle("install");
  h.setOffline(true);
  const response=await h.request("https://slowko.test/sub/","navigate");
  assert.ok((await response.text()).includes('id="answer"'));
  for(const filename of ["app.js","core.js","vocabulary.js","styles.css"]){
    const cached=await h.request("https://slowko.test/sub/"+filename);
    assert.ok(cached.ok);
    assert.ok((await cached.text()).length>100);
  }
});
test("Cached scripts do not require a network fetch",async()=>{
  const h=harness();
  await h.lifecycle("install");
  const count=h.fetches;
  await h.request("https://slowko.test/sub/app.js");
  assert.equal(h.fetches,count);
});
test("External origins, other scopes and non-GET requests are not intercepted",()=>{
  const h=harness();
  assert.equal(h.request("https://external.test/app.js"),undefined);
  assert.equal(h.request("https://slowko.test/other/app.js"),undefined);
  assert.equal(h.request("https://slowko.test/sub/app.js","cors","POST"),undefined);
});
test("All published asset paths exist and PWA icons have the declared dimensions",()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(PUBLIC,"manifest.webmanifest"),"utf8"));
  assert.equal(manifest.start_url,"./");
  assert.equal(manifest.scope,"./");
  assert.equal(manifest.display,"standalone");
  for(const icon of manifest.icons){
    const bytes=fs.readFileSync(path.join(PUBLIC,icon.src));
    const [width,height]=icon.sizes.split("x").map(Number);
    assert.equal(bytes.subarray(1,4).toString(),"PNG");
    assert.equal(bytes.readUInt32BE(16),width);
    assert.equal(bytes.readUInt32BE(20),height);
  }
});

test("Navigation uses the same cached shell version as its scripts",async()=>{
  const h=harness();
  await h.lifecycle("install");
  const count=h.fetches;
  const response=await h.request("https://slowko.test/sub/","navigate");
  assert.ok((await response.text()).includes('id="answer"'));
  assert.equal(h.fetches,count);
});
