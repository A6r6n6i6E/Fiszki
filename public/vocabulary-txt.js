/* Plain-text vocabulary parser. Shared by the browser and the build script. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'));
  else root.SlowkoTxt = factory(root.SlowkoCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const MAX_LENGTH = 2000000;
  const MAX_WORDS = 5000;
  const DEFAULT_CATEGORY = 'W\u0142asne s\u0142\u00f3wka';
  const clean = value => String(value).normalize('NFC').trim().replace(/\s+/g, ' ');
  const norm = value => clean(value).toLocaleLowerCase('pl');
  const identity = row => JSON.stringify([norm(row.pl), C.normalizeAnswer(row.answers[0])]);

  // Stable content IDs keep progress when rows are reordered or recategorized.
  // These are identifiers, not cryptographic hashes. Collisions are checked below.
  function hash(text) {
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) {
      a = Math.imul(a ^ text.charCodeAt(i), 16777619);
      b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }

  function parse(text) {
    const rows = [], errors = [], seen = new Set();
    let duplicates = 0;
    const fail = (line, message) => { if (errors.length < 100) errors.push({ line, message }); };
    if (typeof text !== 'string' || text.length > MAX_LENGTH || new TextEncoder().encode(text).length > MAX_LENGTH) {
      return { rows, errors: [{ line: 0, message: 'Plik musi by\u0107 tekstem UTF-8 o rozmiarze do 2 MB.' }], duplicates };
    }
    const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/.test(line)) {
        fail(i + 1, 'Nieprawid\u0142owe znaki. Zapisz plik jako zwyk\u0142y tekst UTF-8.'); continue;
      }
      const fields = line.split(';').map(clean);
      if (fields.length < 2 || fields.length > 3) {
        fail(i + 1, 'U\u017cyj formatu: polski;angielski;dzia\u0142 (dzia\u0142 jest opcjonalny).'); continue;
      }
      const [pl, english, category = DEFAULT_CATEGORY] = fields;
      if (!pl || !english) { fail(i + 1, 'Brakuje polskiego lub angielskiego has\u0142a.'); continue; }
      if (pl.length > 300 || category.length > 80) { fail(i + 1, 'Polskie has\u0142o: do 300 znak\u00f3w; nazwa dzia\u0142u: do 80.'); continue; }
      const variants = english.split('|').map(clean);
      if (variants.length > 16 || variants.some(v => !C.normalizeAnswer(v) || v.length > 240)) {
        fail(i + 1, 'Wpisz od 1 do 16 niepustych odpowiedzi (do 240 znak\u00f3w ka\u017cda), rozdzielonych znakiem |.'); continue;
      }
      const answerSet = new Set();
      const answers = variants.filter(v => {
        const key = C.normalizeAnswer(v);
        if (answerSet.has(key)) return false;
        answerSet.add(key); return true;
      });
      const row = { pl, answers, category: category || DEFAULT_CATEGORY, line: i + 1 };
      const key = identity(row);
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key); rows.push(row);
      if (rows.length > MAX_WORDS) { fail(i + 1, 'Limit bazy to 5000 fiszek. Podziel list\u0119 na mniejsze zestawy.'); break; }
    }
    if (!rows.length && !errors.length) fail(0, 'Plik nie zawiera s\u0142\u00f3wek. Dodaj przynajmniej jeden wiersz.');
    return { rows, errors, duplicates };
  }

  function ensureParsed(text) {
    const parsed = parse(text);
    if (parsed.errors.length) throw new Error(parsed.errors.map(e =>
      (e.line ? 'Wiersz ' + e.line + ': ' : '') + e.message).join('\n'));
    return parsed;
  }

  function rowsOf(data) {
    const categories = new Map(data.categories.map(c => [c.id, c.label]));
    return data.words.map(w => ({ pl: w.pl, answers: [...w.answers], category: categories.get(w.category) }));
  }

  function serialize(data) {
    const rows = rowsOf(data);
    return '# S\u0142\u00f3wko - lista s\u0142\u00f3wek (UTF-8)\n' +
      '# polski;angielski;dzia\u0142\n' +
      '# Dzia\u0142 mo\u017cna pomin\u0105\u0107. Warianty odpowiedzi rozdziel znakiem |.\n' +
      '# Pierwszy wariant identyfikuje fiszk\u0119 - nie zmieniaj jego kolejno\u015bci bez potrzeby.\n\n' +
      rows.map(r => r.pl + ';' + r.answers.join(' | ') + ';' + r.category).join('\n') + '\n';
  }

  function fromRows(rows, reference, source = 'txt') {
    if (rows.length > MAX_WORDS) throw new Error('Limit bazy to 5000 fiszek.');
    const known = new Map(reference.words.map(w => [identity(w), w]));
    const knownCategories = new Map(reference.categories.map(c => [norm(c.label), c]));
    const categoryMap = new Map(), ids = new Map(), keys = new Set(), words = [];
    for (const row of rows) {
      const key = identity(row);
      if (keys.has(key)) continue;
      keys.add(key);
      const labelKey = norm(row.category);
      if (!categoryMap.has(labelKey)) {
        const category = knownCategories.get(labelKey) || {
          id: 'txt-category-' + hash(labelKey), label: row.category, group: 'W\u0142asna baza'
        };
        if ([...categoryMap.values()].some(c => c.id === category.id && norm(c.label) !== labelKey)) {
          throw new Error('Konflikt nazw dzia\u0142\u00f3w. Zmie\u0144 jedn\u0105 z nazw.');
        }
        categoryMap.set(labelKey, category);
      }
      const old = known.get(key);
      const id = old ? old.id : 'txt-' + hash(key);
      if (ids.has(id) && ids.get(id) !== key) throw new Error('Konflikt identyfikator\u00f3w fiszek. Zmie\u0144 polskie has\u0142o.');
      ids.set(id, key);
      const unchanged = old && JSON.stringify(row.answers) === JSON.stringify(old.answers);
      words.push({ ...(old || {}), id, pl: row.pl, answers: [...row.answers],
        en: unchanged ? old.en : row.answers.join(' / '), category: categoryMap.get(labelKey).id,
        ...(old ? {} : { source }) });
    }
    // Keep the original hints; add hints when user-supplied translations collide.
    const groups = new Map();
    for (const w of words) {
      const key = w.category + ':' + norm(w.prompt || w.pl);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    }
    for (const group of groups.values()) if (group.length > 1) {
      for (const w of group) {
        const answer = w.answers[0];
        if (!w.cue) w.cue = 'G\u0142\u00f3wny wariant: ' + answer.slice(0, Math.min(3, Math.max(1, answer.length - 1))) +
          '\u2026 (' + answer.length + ' znak\u00f3w, \u0142\u0105cznie ze spacjami).';
        w.siblings = group.filter(other => other.id !== w.id).map(other => other.id);
      }
    }
    const data = { ...reference, words, categories: [...categoryMap.values()] };
    if (new TextEncoder().encode(serialize(data)).length > MAX_LENGTH) {
      throw new Error('Cała lista TXT przekracza 2 MB. Usuń część haseł przed importem.');
    }
    return data;
  }

  function compile(text, reference) { return fromRows(ensureParsed(text).rows, reference); }

  function merge(base, rows) {
    const seen = new Set(base.words.map(identity));
    const fresh = [];
    let duplicates = 0;
    for (const row of rows) {
      const key = identity(row);
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key); fresh.push(row);
    }
    const data = fromRows([...rowsOf(base), ...fresh], base, 'import');
    return { data, added: fresh.length, duplicates, addedRows: fresh };
  }

  // A changed TXT file may remove a card/category. Keep every surviving result.
  // Validation remains strict for entry types, dataset IDs and counters.
  function reconcileState(candidate, data) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) ||
        !candidate.entries || typeof candidate.entries !== 'object' || Array.isArray(candidate.entries)) {
      return C.validateState(candidate, data); // throws the normal validation error
    }
    const allowed = new Set(data.words.map(w => w.id));
    const categories = new Set(['all', ...data.categories.map(c => c.id)]);
    const entries = Object.fromEntries(Object.entries(candidate.entries).filter(([id]) => allowed.has(id)));
    return C.validateState({ ...candidate, entries,
      category: categories.has(candidate.category) ? candidate.category : 'all' }, data);
  }

  return Object.freeze({ MAX_LENGTH, MAX_WORDS, DEFAULT_CATEGORY, parse, ensureParsed,
    identity, serialize, rowsOf, fromRows, compile, merge, reconcileState });
});
