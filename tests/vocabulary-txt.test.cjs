'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../public/vocabulary-txt.js');
const C = require('../public/core.js');
const original = require('../data/words.json');
const txt = fs.readFileSync(path.join(__dirname, '../data/slowka.txt'), 'utf8');
const base = T.compile(txt, original);
const row = text => T.ensureParsed(text).rows;

test('Full external TXT preserves all 366 photo IDs, answers and source metadata', () => {
  assert.equal(base.words.length, 366);
  assert.equal(base.categories.length, 17);
  for (let i = 0; i < base.words.length; i++) {
    assert.equal(base.words[i].id, original.words[i].id);
    assert.equal(base.words[i].pl, original.words[i].pl);
    assert.equal(base.words[i].en, original.words[i].en);
    assert.deepEqual(base.words[i].answers, original.words[i].answers);
    assert.equal(base.words[i].sourcePhoto, original.words[i].sourcePhoto);
  }
});
test('Two/three columns, optional category and comments', () => {
  const p = T.parse('# comment\napple in Polish;apple\ntravel;journey;Travel\n');
  assert.equal(p.errors.length, 0);
  assert.equal(p.rows.length, 2);
  assert.equal(p.rows[0].category, T.DEFAULT_CATEGORY);
  assert.equal(p.rows[1].category, 'Travel');
});
test('UTF-8 BOM, CRLF and CR line endings', () => {
  const p = T.parse('\uFEFF# comment\r\none;one\rtwo;two\n');
  assert.equal(p.rows.length, 2);
  assert.equal(p.errors.length, 0);
});
test('Alternative answers separated by a pipe are accepted, not concatenated', () => {
  const d = T.merge(base, row('kolor;colour | color;Nowe')).data;
  const w = d.words.at(-1);
  assert.equal(C.isCorrect(w, 'colour'), true);
  assert.equal(C.isCorrect(w, 'color'), true);
  assert.equal(C.isCorrect(w, 'Colour'), true);
  assert.equal(C.isCorrect(w, 'colur'), false);
  assert.equal(C.isCorrect(w, 'colour / color'), false);
});
test('Duplicate rows within a file and in the existing collection are ignored', () => {
  const p = T.parse('kot;cat;One\n KOT ; CAT ;Two');
  assert.equal(p.duplicates, 1);
  const a = T.merge(base, p.rows);
  const b = T.merge(a.data, p.rows);
  assert.equal(a.added, 1); assert.equal(b.added, 0); assert.equal(b.duplicates, 1);
  assert.equal(b.data.words.length, 367);
});
test('An entire exported base can be imported without duplicates', () => {
  const merged = T.merge(base, row(T.serialize(base)));
  assert.equal(merged.added, 0);
  assert.equal(merged.duplicates, 366);
});
test('Stable custom IDs survive reordering, whitespace and category changes', () => {
  const a = T.merge(base, row('kot;cat;Animals\npies;dog;Animals')).data;
  const b = T.merge(base, row(' PIES ; DOG ;New\n kot ; cat ;New')).data;
  assert.equal(a.words.at(-2).id, b.words.at(-1).id);
  assert.equal(a.words.at(-1).id, b.words.at(-2).id);
});
test('Changing either primary answer or translation creates a different card', () => {
  const a = T.merge(base, row('kot;cat')).data.words.at(-1);
  const b = T.merge(base, row('kot;kitten')).data.words.at(-1);
  const c = T.merge(base, row('kotek;cat')).data.words.at(-1);
  assert.notEqual(a.id, b.id); assert.notEqual(a.id, c.id);
});
test('Adding aliases does not change a card ID during a rebuild', () => {
  const a = T.merge(base, row('kot;cat')).data;
  const b = T.compile(T.serialize(a).replace('kot;cat;', 'kot;cat | kitty;'), original);
  assert.equal(a.words.at(-1).id, b.words.at(-1).id);
  assert.equal(C.isCorrect(b.words.at(-1), 'kitty'), true);
});
test('Import duplicates cannot override an existing answer or its category', () => {
  const a = T.merge(base, row('kot;cat;Animals')).data;
  const b = T.merge(a, row('kot;cat | wrong;Unexpected')).data;
  assert.deepEqual(b.words.at(-1), a.words.at(-1));
});
test('Empty/invalid lines have precise line numbers; parser does not throw', () => {
  for (const text of ['# empty', '', 'word', ';cat', 'kot;', 'kot;cat;', 'kot;cat|', 'kot;cat;x;extra']) {
    const p = T.parse(text);
    if (text === 'kot;cat;') assert.equal(p.errors.length, 0);
    else assert.ok(p.errors.length);
  }
  const p = T.parse('# header\nkot;cat\nbadline');
  assert.equal(p.errors[0].line, 3);
  assert.throws(() => T.compile('# header\nkot;cat\nbadline', base));
});
test('Invalid UTF encodings, long answers and oversized files are rejected', () => {
  for (const s of ['a;\uFFFD', 'a;\0bad', 'a;' + 'b'.repeat(241), 'x'.repeat(2000001)]) {
    assert.ok(T.parse(s).errors.length);
  }
});
test('Normalized duplicate alternatives are collapsed', () => {
  assert.deepEqual(row('kot;cat | CAT |  cat ')[0].answers, ['cat']);
});
test('Limit of 5000 words applies to the merged collection', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ pl: 'p' + i, answers: ['e' + i], category: 'New' }));
  assert.throws(() => T.merge(base, rows), /5000/);
});
test('Export/import round trip preserves custom IDs and alternatives', () => {
  const a = T.merge(base, row('kolor;colour | color;Nowe\nkot;cat;Animals')).data;
  const b = T.merge(base, row(T.serialize(a))).data;
  assert.deepEqual(b.words.map(w => w.id), a.words.map(w => w.id));
  assert.deepEqual(b.words.map(w => w.answers), a.words.map(w => w.answers));
});
test('Adding new TXT words preserves all old learned/wrong counters', () => {
  let state = C.recordAnswer(C.initialState(base), base.words[0].id, 'correct');
  state = C.recordAnswer(state, base.words[1].id, 'wrong');
  const data = T.merge(base, row('kot;cat')).data;
  const updated = T.reconcileState(state, data);
  assert.deepEqual(updated, state);
  assert.equal(C.statistics(data.words, updated).remaining, 366);
});
test('An updated source file removes only results for removed cards', () => {
  let state = C.recordAnswer(C.initialState(base), base.words[0].id, 'correct');
  state = C.recordAnswer(state, base.words[1].id, 'correct');
  const data = { ...base, words: base.words.slice(1) };
  const updated = T.reconcileState(state, data);
  assert.equal(Object.keys(updated.entries).length, 1);
  assert.ok(updated.entries[base.words[1].id].learned);
});
test('A removed selected category falls back to all without losing surviving results', () => {
  const data = { ...base, categories: base.categories.slice(1), words: base.words.filter(w => w.category !== 'personal') };
  const state = { ...C.initialState(base), category: 'personal' };
  assert.equal(T.reconcileState(state, data).category, 'all');
});
test('Changed collection cannot bypass validation of counters or dataset ID', () => {
  const state = C.recordAnswer(C.initialState(base), base.words[0].id, 'correct');
  assert.throws(() => T.reconcileState({ ...state, datasetId: 'another' }, base));
  state.entries[base.words[0].id].correct = -1;
  assert.throws(() => T.reconcileState(state, base));
});
test('Ambiguous translations receive cues and sibling IDs', () => {
  const d = T.merge(base, row('test;pencil;Nowe\ntest;pen;Nowe')).data;
  assert.ok(d.words.at(-1).cue); assert.ok(d.words.at(-2).cue);
  assert.deepEqual(d.words.at(-1).siblings, [d.words.at(-2).id]);
});
test('HTML-like vocabulary is kept as text data', () => {
  const d = T.merge(base, row('<img src=x onerror=alert(1)>;safe')).data;
  assert.equal(d.words.at(-1).pl, '<img src=x onerror=alert(1)>');
});
test('New words use the same retry/learned exclusion rules', () => {
  const d = T.merge(base, row('kot;cat')).data;
  const w = d.words.at(-1);
  let state = C.initialState(d);
  const queue = new C.StudyQueue([w], state);
  assert.equal(queue.draw(state).id, w.id);
  state = C.recordAnswer(state, w.id, 'wrong'); queue.retry(w.id);
  assert.equal(queue.draw(state).id, w.id);
  state = C.recordAnswer(state, w.id, 'correct');
  assert.equal(queue.draw(state), null);
});
