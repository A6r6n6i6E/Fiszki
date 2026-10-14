"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const crypto = require("node:crypto");
const {execFileSync} = require("node:child_process");
const root = path.resolve(__dirname, "..");
const pub = path.join(root, "public");

function runtimeData(dir = pub) {
  const scope = {};
  vm.runInNewContext(fs.readFileSync(path.join(dir, "vocabulary.js"), "utf8"), scope);
  return JSON.parse(JSON.stringify(scope.SLOWKO_DATA));
}

test("Full package includes every precached asset and manifest icon", () => {
  const worker = fs.readFileSync(path.join(pub, "sw.js"), "utf8");
  const assets = JSON.parse(worker.match(/const ASSETS = (.*);/)[1]);
  for (const asset of assets) {
    const file = asset === "./" ? "index.html" : asset;
    assert.ok(fs.statSync(path.join(pub, file)).isFile(), file);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(pub, "manifest.webmanifest"), "utf8"));
  for (const icon of manifest.icons) assert.ok(fs.statSync(path.join(pub, icon.src)).isFile());
  assert.ok(!assets.some(asset => asset.includes("wersja.json")));
});

test("Deployment diagnostics describe actual data and source hash", () => {
  const info = JSON.parse(fs.readFileSync(path.join(pub, "wersja.json"), "utf8"));
  const data = runtimeData();
  assert.equal(info.wydanie, "PELNA-PACZKA-1.3");
  assert.equal(info.liczbaFiszek, data.words.length);
  assert.equal(info.liczbaDzialow, data.categories.length);
  assert.equal(info.liczbaStron, data.pages.length);
  assert.deepEqual(info.strony, data.pages.map(p => ({
    nazwa: p.label, liczbaFiszek: data.words.filter(w => w.page === p.id).length
  })));
  assert.equal(info.sha256Bazy, crypto.createHash("sha256")
    .update(fs.readFileSync(path.join(root, "data/slowka.txt"))).digest("hex"));
  assert.match(fs.readFileSync(path.join(pub, "_headers"), "utf8"), /\/wersja\.json\s+Cache-Control: no-store/);
});

test("Fresh source tree builds without generated assets or previous packages", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slowko-full-"));
  try {
    for (const dir of ["public", "data", "tools"]) {
      fs.cpSync(path.join(root, dir), path.join(temp, dir), {recursive:true});
    }
    fs.copyFileSync(path.join(root, "package.json"), path.join(temp, "package.json"));
    for (const name of ["vocabulary.js", "sw.js", "wersja.json"]) {
      fs.rmSync(path.join(temp, "public", name), {force:true});
    }
    const revision = "1234567890abcdef1234567890abcdef12345678";
    const log = execFileSync(process.execPath, [path.join(temp, "tools/build.cjs")], {
      cwd: os.tmpdir(), env:{...process.env, CF_PAGES_COMMIT_SHA:revision}, encoding:"utf8"
    });
    const info = JSON.parse(fs.readFileSync(path.join(temp, "public/wersja.json"), "utf8"));
    assert.equal(info.commit, revision);
    assert.equal(info.liczbaFiszek, 461);
    assert.equal(info.liczbaStron, 3);
    assert.deepEqual(info.strony.map(p => p.liczbaFiszek), [215,151,95]);
    assert.equal(runtimeData(path.join(temp, "public")).words.length, 461);
    assert.match(log, /Ready: 461 cards, 20 categories, 3 pages/);
    assert.match(log, /PELNA-PACZKA-1\.3/);
    assert.ok(fs.statSync(path.join(temp, "slowko-demo.html")).size > 0);
  } finally { fs.rmSync(temp, {recursive:true,force:true}); }
});
