'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../public/core.js');
const T = require('../public/vocabulary-txt.js');
const reference = require('../data/words.json');
const legacy = require('./fixtures/czlowiek-legacy.json');
const home = require('./fixtures/home-legacy.json');
const data = T.compile(fs.readFileSync(path.join(__dirname,'../data/slowka.txt'),'utf8'), reference);
const rows = text => T.ensureParsed(text).rows;
const rowWord = (d, en) => d.words.find(w => w.answers[0] === en);

test('Three photo pages: 215 + 151 + 95 = 461 unique cards, 20 categories', () => {
  assert.equal(data.words.length,461);
  assert.equal(data.categories.length,20);
  assert.deepEqual(data.pages.map(p=>p.id), ['photo-1','photo-2','photo-3']);
  assert.deepEqual(data.pages.map(p=>C.scopedWords(data,'all',p.id).length), [215,151,95]);
  assert.equal(new Set(data.words.map(w=>w.id)).size,461);
  for(const w of data.words) assert.equal(w.page,'photo-'+w.sourcePhoto);
});

test('All original and home card identities, answers and display variants survive', () => {
  const current = new Map(data.words.map(w=>[w.id,w]));
  for(const old of [...legacy.words,...home.words]) {
    const w=current.get(old.id);
    assert.ok(w,old.id);
    assert.equal(w.en,old.en);
    assert.equal(w.pl,old.pl);
    assert.deepEqual(w.answers,old.answers);
    assert.equal(w.cue,old.cue);
  }
  assert.equal(data.id,legacy.id);
  assert.equal(data.id,home.id);
});

test('Filters intersect, including a category spread across the first two pages', () => {
  for(const p of ['all',...data.pages.map(p=>p.id)]) {
    for(const c of ['all',...data.categories.map(c=>c.id)]) {
      assert.deepEqual(C.scopedWords(data,c,p),data.words.filter(w=>
        (c==='all'||w.category===c)&&(p==='all'||w.page===p)));
    }
  }
  const one=C.scopedWords(data,'feelings','photo-1');
  const two=C.scopedWords(data,'feelings','photo-2');
  assert.ok(one.length>0 && two.length>0);
  assert.equal(one.length+two.length,C.scopedWords(data,'feelings').length);
  assert.equal(C.scopedWords(data,'personal','photo-3').length,0);
});

test('Older progress without a page field migrates to all without losing counters', () => {
  const w=legacy.words[0];
  const old={schemaVersion:1,datasetId:legacy.id,category:'personal',entries:{
    [w.id]:{learned:true,correct:1,wrong:2,skipped:1,updatedAt:null}
  }};
  const migrated=T.reconcileState(old,data);
  assert.equal(migrated.page,'all');
  assert.equal(migrated.category,'personal');
  assert.deepEqual(migrated.entries,old.entries);
  assert.deepEqual(C.parseBackup(JSON.stringify(C.makeBackup(old)),data),migrated);
});

test('The 95-card home-only version keeps its learned records after expanding the base', () => {
  let old=C.recordAnswer(C.initialState(home),home.words[0].id,'correct');
  old=C.recordAnswer(old,home.words[1].id,'wrong');
  delete old.page;
  const migrated=T.reconcileState(old,data);
  assert.equal(C.statistics(C.scopedWords(data,'all','photo-3'),migrated).learned,1);
  assert.equal(C.statistics(C.scopedWords(data,'all','photo-3'),migrated).wrong,1);
  assert.equal(C.statistics(C.scopedWords(data,'all','photo-1'),migrated).attempts,0);
});

test('Changing page/category does not reset shared progress or relearn finished cards', () => {
  const w=data.words[0];
  const state=C.recordAnswer(C.initialState(data),w.id,'correct');
  for(const page of ['photo-3','all','photo-1']) {
    const selected={...state,page};
    const queue=new C.StudyQueue(C.scopedWords(data,'all',page),selected,()=>0);
    assert.ok(!queue.queue.includes(w.id));
    assert.deepEqual(selected.entries,state.entries);
  }
  assert.equal(C.statistics(C.scopedWords(data,'all','photo-1'),state).learned,1);
  assert.equal(C.statistics(data.words,state).learned,1);
});

test('Wrong answers return only to the selected page until recorded correct', () => {
  const words=C.scopedWords(data,'all','photo-3');
  const w=words[0];
  let state=C.initialState(data);
  const q=new C.StudyQueue([w],state);
  assert.equal(q.draw(state).id,w.id);
  state=C.recordAnswer(state,w.id,'wrong');q.retry(w.id);
  assert.equal(q.draw(state).id,w.id);
  state=C.recordAnswer(state,w.id,'correct');
  assert.equal(q.draw(state),null);
  assert.equal(C.statistics(C.scopedWords(data,'all','photo-2'),state).attempts,0);
});

test('Fourth TXT field creates a new page automatically; empty category is valid', () => {
  const merged=T.merge(data,rows('kot testowy;test cat;;Strona 4'));
  const w=merged.data.words.at(-1);
  const p=merged.data.pages.find(p=>p.id===w.page);
  assert.equal(p.label,'Strona 4');
  assert.equal(merged.data.categories.find(c=>c.id===w.category).label,T.DEFAULT_CATEGORY);
  assert.equal(C.scopedWords(merged.data,'all',p.id).length,1);
});

test('New two/three-column imports remain usable under the unassigned filter', () => {
  const merged=T.merge(data,rows('kot testowy;test cat\npies testowy;test dog;Test'));
  assert.equal(C.scopedWords(merged.data,'all','unassigned').length,2);
  assert.equal(merged.data.pages.find(p=>p.id==='unassigned').label,T.DEFAULT_PAGE);
  assert.equal(merged.data.words.at(-1).page,'unassigned');
});

test('Legacy three-column base infers original pages using source metadata', () => {
  const old=T.compile(fs.readFileSync(path.join(__dirname,'fixtures/czlowiek-legacy.txt'),'utf8'),legacy);
  assert.equal(old.pages.length,2);
  assert.equal(C.scopedWords(old,'all','photo-1').length,215);
  assert.equal(C.scopedWords(old,'all','photo-2').length,151);
});

test('Changing a page or category in the project TXT preserves the stable card ID', () => {
  const first=T.merge(data,rows('kot testowy;test cat;Animals;Strona 4')).data;
  const moved=T.compile(T.serialize(first).replace('test cat;Animals;Strona 4','test cat;Other;Strona 5'),first);
  assert.equal(first.words.at(-1).id,moved.words.at(-1).id);
  assert.notEqual(first.words.at(-1).page,moved.words.at(-1).page);
  const state=C.recordAnswer(C.initialState(first),first.words.at(-1).id,'correct');
  assert.ok(C.getEntry(T.reconcileState(state,moved),moved.words.at(-1).id).learned);
});

test('No fourth column keeps a known page; explicit unassigned removes the assignment', () => {
  const first=T.merge(data,rows('kot testowy;test cat;Animals;Strona 4')).data;
  const old=first.words.at(-1);
  const noPage=T.compile('kot testowy;test cat;Animals',first);
  assert.equal(noPage.words[0].page,old.page);
  const removed=T.compile('kot testowy;test cat;Animals;'+T.DEFAULT_PAGE,first);
  assert.equal(removed.words[0].page,'unassigned');
  assert.equal(removed.words[0].id,old.id);
});

test('TXT roundtrip preserves pages and new-page IDs as well as answer variants', () => {
  const first=T.merge(data,rows('kolor testowy;test colour | test color;Animals;Strona 4')).data;
  const reloaded=T.merge(data,rows(T.serialize(first))).data;
  assert.deepEqual(reloaded.words.map(w=>[w.id,w.page,w.answers]),first.words.map(w=>[w.id,w.page,w.answers]));
  assert.deepEqual(reloaded.pages,first.pages);
});

test('JSON backup preserves the selected page and entries', () => {
  let state={...C.initialState(data),page:'photo-3'};
  state=C.recordAnswer(state,home.words[0].id,'correct');
  assert.deepEqual(C.parseBackup(JSON.stringify(C.makeBackup(state)),data),state);
});

test('Deleting the selected page resets the filter, not surviving page results', () => {
  let state={...C.initialState(data),page:'photo-2'};
  state=C.recordAnswer(state,data.words[0].id,'correct');
  const smaller={...data,words:data.words.filter(w=>w.page!=='photo-2'),pages:data.pages.filter(p=>p.id!=='photo-2')};
  const next=T.reconcileState(state,smaller);
  assert.equal(next.page,'all');
  assert.deepEqual(next.entries,state.entries);
});

test('Invalid stored page is rejected by strict validation and reconciled safely on updates', () => {
  const state={...C.initialState(data),page:'not-existing'};
  assert.throws(()=>C.validateState(state,data));
  assert.equal(T.reconcileState(state,data).page,'all');
  assert.throws(()=>C.validateState({...state,page:{id:'photo-3'}},data));
});

test('Duplicate imports cannot overwrite page assignment or introduce a phantom page', () => {
  const w=data.words[0];
  const merged=T.merge(data,rows(w.pl+';'+w.answers[0]+';Other;Strona 999'));
  assert.equal(merged.added,0);
  assert.equal(merged.duplicates,1);
  assert.equal(merged.data.pages.length,3);
  assert.equal(merged.data.words[0].page,w.page);
});

test('Five columns, page names over 80 chars, and invalid control characters are rejected', () => {
  for(const text of ['kot;cat;Animals;Strona 4;extra','kot;cat;Animals;'+'x'.repeat(81),'kot;cat;Animals;abc\0']) {
    assert.ok(T.parse(text).errors.length);
  }
  assert.equal(T.parse('kot;cat;Animals;'+ 'x'.repeat(80)).errors.length,0);
});

test('Page identity is whitespace/case stable and dangerous-looking labels stay data', () => {
  const one=T.merge(data,rows('kot testowy;test cat;Animals;STRONA 4')).data;
  const two=T.merge(data,rows('kot testowy;test cat;Animals;  strona   4  ')).data;
  assert.equal(one.words.at(-1).page,two.words.at(-1).page);
  const injected=T.merge(data,rows('kot testowy;test cat;Animals;<img src=x onerror=alert(1)>')).data;
  assert.ok(injected.pages.at(-1).id.startsWith('txt-page-'));
  assert.equal(injected.pages.at(-1).label,'<img src=x onerror=alert(1)>');
});

test('Resetting a scoped list removes only entries in that intersection', () => {
  const one=C.scopedWords(data,'all','photo-1')[0],two=C.scopedWords(data,'all','photo-2')[0];
  let state=C.recordAnswer(C.initialState(data),one.id,'correct');
  state=C.recordAnswer(state,two.id,'correct');
  const entries={...state.entries};
  for(const w of C.scopedWords(data,one.category,one.page)) delete entries[w.id];
  const reset={...state,entries};
  assert.equal(C.getEntry(reset,one.id).learned,false);
  assert.equal(C.getEntry(reset,two.id).learned,true);
});
