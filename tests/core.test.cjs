/* Run: node --test tests/core.test.cjs */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../public/core.js");
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/words.json"), "utf8"));
const find = english => {
  const word = DATA.words.find(item => item.en === english);
  assert.ok(word, "Missing word: " + english);
  return word;
};
const time = "2026-10-08T20:00:00.000Z";
function rng(seed = 1234) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

test("The complete transcription has 366 unique cards across 17 categories", () => {
  assert.equal(DATA.words.length, 366);
  assert.equal(DATA.categories.length, 17);
  assert.equal(new Set(DATA.words.map(w => w.id)).size, 366);
  const ids = new Set(DATA.categories.map(c => c.id));
  for (const word of DATA.words) {
    assert.ok(ids.has(word.category));
    assert.ok([1, 2].includes(word.sourcePhoto));
    assert.ok(word.pl.length && word.en.length && word.answers.length);
  }
});
test("Every recorded answer variant is accepted (including uppercase and extra spaces)", () => {
  for (const word of DATA.words) {
    for (const answer of word.answers) {
      assert.equal(C.isCorrect(word, answer), true, word.en + ": " + answer);
      assert.equal(C.isCorrect(word, "  " + answer.toUpperCase().replace(/ /g, "   ") + "  "), true, word.en);
    }
  }
});
test("Spelling mistakes, empty input and wrong meanings are rejected", () => {
  assert.equal(C.isCorrect(find("conscientious"), "consciencious"), false);
  assert.equal(C.isCorrect(find("achievement"), "achievment"), false);
  assert.equal(C.isCorrect(find("muscular"), "muscluar"), false);
  assert.equal(C.isCorrect(find("mature"), "immature"), false);
  for (const input of ["", "  ", "\n", null, undefined]) assert.equal(C.isCorrect(find("acne"), input), false);
});
test("Typographic punctuation is normalized, but a required hyphen is not omitted", () => {
  assert.equal(C.isCorrect(find("well-built"), "well–built"), true);
  assert.equal(C.isCorrect(find("well-built"), "well - built"), true);
  assert.equal(C.isCorrect(find("well-built"), "well built"), false);
  assert.equal(C.isCorrect(find("whisper (in sb's ear)"), "whisper in someone’s ear"), true);
});
test("Textbook placeholders accept both full words and abbreviations", () => {
  assert.equal(C.isCorrect(find("appeal to sb"), "appeal to somebody"), true);
  assert.equal(C.isCorrect(find("appeal to sb"), "appeal to someone"), true);
  assert.equal(C.isCorrect(find("cope with sth"), "cope with something"), true);
  assert.equal(C.isCorrect(find("long for sb/sth"), "long for somebody"), true);
  assert.equal(C.isCorrect(find("long for sb/sth"), "long for something"), true);
  assert.equal(C.isCorrect(find("regard sth as sth"), "regard something as something"), true);
  assert.equal(C.isCorrect(find("cope with sth"), "cope with someone"), false);
});
test("Optional phrase parts and slash alternatives have explicit valid answers", () => {
  for (const answer of ["whisper", "whisper in sb's ear"]) assert.equal(C.isCorrect(find("whisper (in sb's ear)"), answer), true);
  for (const answer of ["in the mood", "in the mood for something"]) assert.equal(C.isCorrect(find("in the mood (for sth)"), answer), true);
  for (const answer of ["family name", "last name"]) assert.equal(C.isCorrect(find("family / last name"), answer), true);
  assert.equal(C.isCorrect(find("proficient in / at"), "proficient at"), true);
  assert.equal(C.isCorrect(find("proficient in / at"), "proficient in"), true);
});
test("US orthographic variants are accepted where recorded", () => {
  assert.equal(C.isCorrect(find("organised"), "organized"), true);
  assert.equal(C.isCorrect(find("self-centred"), "self-centered"), true);
  assert.equal(C.isCorrect(find("judgement"), "judgment"), true);
  assert.equal(C.isCorrect(find("woollen"), "woolen"), true);
});
test("Opposites are separate targets, and identical Polish prompts have visible cues", () => {
  for (const [a,b] of [["mature","immature"],["zip","unzip"],["equality","inequality"],["lower lip","upper lip"]]) {
    assert.notEqual(find(a).id, find(b).id);
    assert.notEqual(find(a).pl, find(b).pl);
  }
  assert.ok(find("impolite").cue);
  assert.ok(find("rude").cue);
  assert.notEqual(find("self-assured").cue, find("self-confident").cue);
  for (const word of DATA.words.filter(w => w.siblings)) {
    for (const id of word.siblings) {
      const sibling = DATA.words.find(w => w.id === id);
      assert.ok(sibling);
      assert.equal(sibling.pl, word.pl);
      assert.equal(sibling.category, word.category);
    }
  }
});
test("Questions for vintage and piercing do not expose their English answers", () => {
  assert.equal(find("vintage").prompt.toLowerCase().includes("vintage"), false);
  assert.equal(find("piercing").prompt.toLowerCase().includes("piercing"), false);
  assert.ok(find("cope with sth").note.includes("ucięty"));
});
test("A correct answer immediately marks a card learned and resists duplicate submissions", () => {
  const w = find("acne");
  const empty = C.initialState(DATA);
  const updated = C.recordAnswer(empty, w.id, "correct", time);
  assert.equal(C.getEntry(updated, w.id).learned, true);
  assert.equal(C.getEntry(updated, w.id).correct, 1);
  assert.equal(C.getEntry(empty, w.id).learned, false);
  assert.equal(C.recordAnswer(updated, w.id, "correct", time), updated);
});
test("A wrong answer or skip remains pending and is included in accuracy", () => {
  const w = find("acne");
  let state = C.initialState(DATA);
  state = C.recordAnswer(state, w.id, "wrong", time);
  state = C.recordAnswer(state, w.id, "skipped", time);
  assert.equal(C.getEntry(state, w.id).learned, false);
  state = C.recordAnswer(state, w.id, "correct", time);
  assert.deepEqual(C.statistics([w], state), { total:1, learned:1, remaining:0, correct:1,
    wrong:1, skipped:1, attempts:3, accuracy:33 });
});
test("An all-correct run visits every card exactly once and then finishes", () => {
  let state = C.initialState(DATA);
  const queue = new C.StudyQueue(DATA.words, state, rng());
  const seen = new Set();
  for (let i = 0; i < DATA.words.length; i++) {
    const word = queue.draw(state);
    assert.ok(word);
    assert.equal(seen.has(word.id), false);
    seen.add(word.id);
    state = C.recordAnswer(state, word.id, "correct", time);
  }
  assert.equal(seen.size, 366);
  assert.equal(queue.draw(state), null);
  assert.equal(C.statistics(DATA.words, state).remaining, 0);
});
test("A wrong card returns, but after at least two other cards when possible", () => {
  const words = DATA.words.slice(0, 6);
  let state = C.initialState(DATA);
  const queue = new C.StudyQueue(words, state, rng(9));
  const first = queue.draw(state);
  state = C.recordAnswer(state, first.id, "wrong", time);
  queue.retry(first.id);
  for (let n = 0; n < 2; n++) {
    const word = queue.draw(state);
    assert.notEqual(word.id, first.id);
    state = C.recordAnswer(state, word.id, "correct", time);
  }
  const seen = [];
  let word;
  while ((word = queue.draw(state))) {
    seen.push(word.id);
    state = C.recordAnswer(state, word.id, "correct", time);
  }
  assert.ok(seen.includes(first.id));
});
test("The last pending card repeats after a mistake, then disappears after success", () => {
  const word = find("acne");
  let state = C.initialState(DATA);
  const queue = new C.StudyQueue([word], state, rng());
  assert.equal(queue.draw(state).id, word.id);
  state = C.recordAnswer(state, word.id, "wrong", time);
  queue.retry(word.id);
  assert.equal(queue.draw(state).id, word.id);
  state = C.recordAnswer(state, word.id, "correct", time);
  assert.equal(queue.draw(state), null);
});
test("Learned cards are removed even when already queued (another-tab safety)", () => {
  const words = DATA.words.slice(0, 10);
  let state = C.initialState(DATA);
  const queue = new C.StudyQueue(words, state, rng());
  for (const word of words) state = C.recordAnswer(state, word.id, "correct", time);
  assert.equal(queue.draw(state), null);
});
test("Random queue eventually completes a mixed run with repeated mistakes", () => {
  let state = C.initialState(DATA);
  const words = DATA.words.slice(0, 35);
  const queue = new C.StudyQueue(words, state, rng(124));
  let total = 0;
  let word;
  while ((word = queue.draw(state))) {
    assert.ok(++total < 200);
    const entry = C.getEntry(state, word.id);
    if (entry.wrong < 2) {
      state = C.recordAnswer(state, word.id, "wrong", time);
      queue.retry(word.id);
    } else {
      state = C.recordAnswer(state, word.id, "correct", time);
    }
  }
  assert.equal(total, 35 * 3);
  assert.equal(C.statistics(words, state).learned, 35);
});
test("Category filters affect the pool without changing global progress", () => {
  const words = C.scopedWords(DATA, "personal");
  assert.equal(words.length, 8);
  assert.equal(C.scopedWords(DATA, "all").length, 366);
  let state = C.recordAnswer(C.initialState(DATA), words[0].id, "correct", time);
  const queue = new C.StudyQueue(words, state, rng());
  for (let i=0; i<7; i++) {
    const word = queue.draw(state);
    assert.equal(word.category, "personal");
    state = C.recordAnswer(state, word.id, "correct", time);
  }
  assert.equal(queue.draw(state), null);
  assert.equal(C.statistics(DATA.words,state).remaining,358);
});
test("Backup roundtrip validates and preserves counts, statuses and selection", () => {
  let state = C.initialState(DATA);
  state.category = "face";
  state = C.recordAnswer(state, find("acne").id, "wrong", time);
  state = C.recordAnswer(state, find("scar").id, "correct", time);
  const restored = C.parseBackup(JSON.stringify(C.makeBackup(state, time)), DATA);
  assert.deepEqual(restored, state);
});
test("Malformed or incompatible backups cannot overwrite state", () => {
  const state = C.initialState(DATA);
  assert.throws(() => C.parseBackup("{", DATA));
  assert.throws(() => C.parseBackup("{}", DATA));
  assert.throws(() => C.parseBackup("x".repeat(2000001), DATA));
  assert.throws(() => C.validateState({...state, datasetId:"other"}, DATA));
  assert.throws(() => C.validateState({...state, category:"<script>"}, DATA));
  assert.throws(() => C.validateState({...state, entries:{unknown: {}}}, DATA));
  for (const changed of [
    {learned:"true"}, {correct:-1}, {wrong:"0"}, {skipped:Infinity},
    {updatedAt:"yesterday"}, {learned:true, correct:0}
  ]) {
    const entry = {learned:false,correct:0,wrong:0,skipped:0,updatedAt:null,...changed};
    assert.throws(() => C.validateState({...state, entries:{[find("acne").id]:entry}}, DATA));
  }
  const polluted = JSON.parse('{"__proto__":{"learned":true}}');
  assert.throws(() => C.validateState({...state,entries:polluted},DATA));
  assert.equal({}.learned, undefined);
});
test("Restoring an individual card retains its attempt history", () => {
  const w = find("acne");
  let state = C.recordAnswer(C.initialState(DATA), w.id, "correct", time);
  state = C.restoreWord(state, w.id, time);
  assert.equal(C.getEntry(state,w.id).learned,false);
  assert.equal(C.getEntry(state,w.id).correct,1);
  state = C.recordAnswer(state, w.id, "correct", time);
  assert.equal(C.getEntry(state,w.id).correct,2);
});
test("Search works without Polish diacritics", () => {
  assert.equal(C.searchText("Żółć ŁÓDŹ"),"zolc lodz");
  assert.equal(C.searchText("płeć").includes("plec"),true);
});
