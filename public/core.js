/* Słówko — logic independent of the interface; no dependencies. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SlowkoCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SCHEMA_VERSION = 1;

  /** Normalize typography and textbook placeholders, never spelling mistakes. */
  function normalizeAnswer(value) {
    if (typeof value !== "string") return "";
    return value.normalize("NFKC").toLowerCase()
      .replace(/[\u2018\u2019\u02bc\u0060]/g, "'")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/[()]/g, "")
      .replace(/\bsb\b/g, "somebody")
      .replace(/\bsth\b/g, "something")
      .replace(/\bsomeone\b/g, "somebody")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ").trim();
  }

  function isCorrect(word, answer) {
    const candidate = normalizeAnswer(answer);
    return candidate.length > 0 &&
      word.answers.some(variant => normalizeAnswer(variant) === candidate);
  }

  function initialState(data) {
    return { schemaVersion: SCHEMA_VERSION, datasetId: data.id, category: "all", entries: {} };
  }

  function blankEntry() {
    return { learned: false, correct: 0, wrong: 0, skipped: 0, updatedAt: null };
  }

  function getEntry(state, id) {
    return Object.prototype.hasOwnProperty.call(state.entries, id) ? state.entries[id] : blankEntry();
  }

  /** A result is recorded at most once for a learned card. */
  function recordAnswer(state, id, verdict, now = new Date().toISOString()) {
    if (!["correct", "wrong", "skipped"].includes(verdict)) throw new Error("Nieznany wynik odpowiedzi.");
    const previous = getEntry(state, id);
    if (previous.learned) return state;
    const entry = { ...previous, [verdict]: previous[verdict] + 1, updatedAt: now };
    if (verdict === "correct") entry.learned = true;
    return { ...state, entries: { ...state.entries, [id]: entry } };
  }

  function restoreWord(state, id, now = new Date().toISOString()) {
    const entry = getEntry(state, id);
    return { ...state, entries: {
      ...state.entries, [id]: { ...entry, learned: false, updatedAt: now }
    } };
  }

  function scopedWords(data, category = "all") {
    return category === "all" ? data.words : data.words.filter(word => word.category === category);
  }

  function statistics(words, state) {
    const stats = { total: words.length, learned: 0, remaining: 0, correct: 0,
      wrong: 0, skipped: 0, attempts: 0, accuracy: null };
    for (const word of words) {
      const entry = getEntry(state, word.id);
      if (entry.learned) stats.learned++;
      stats.correct += entry.correct;
      stats.wrong += entry.wrong;
      stats.skipped += entry.skipped;
    }
    stats.remaining = stats.total - stats.learned;
    stats.attempts = stats.correct + stats.wrong + stats.skipped;
    if (stats.attempts) stats.accuracy = Math.round(100 * stats.correct / stats.attempts);
    return stats;
  }

  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Every pending card starts in a shuffled queue. A mistake is inserted at
   * a random position, behind at least two other cards when those exist.
   * Learned cards are filtered again at draw time (also safe across tabs).
   */
  class StudyQueue {
    constructor(words, state, random = Math.random) {
      this.words = words;
      this.byId = new Map(words.map(word => [word.id, word]));
      this.random = random;
      this.last = null;
      this.queue = shuffle(words.filter(word => !getEntry(state, word.id).learned)
        .map(word => word.id), random);
    }
    draw(state) {
      this.queue = this.queue.filter(id => !getEntry(state, id).learned);
      if (!this.queue.length) {
        this.queue = shuffle(this.words.filter(word => !getEntry(state, word.id).learned)
          .map(word => word.id), this.random);
      }
      if (!this.queue.length) return null;
      if (this.queue.length > 1 && this.queue[0] === this.last) {
        const index = 1 + Math.floor(this.random() * (this.queue.length - 1));
        [this.queue[0], this.queue[index]] = [this.queue[index], this.queue[0]];
      }
      const id = this.queue.shift();
      this.last = id;
      return this.byId.get(id);
    }
    retry(id) {
      if (!this.byId.has(id) || this.queue.includes(id)) return;
      const min = Math.min(2, this.queue.length);
      const index = min + Math.floor(this.random() * (this.queue.length - min + 1));
      this.queue.splice(index, 0, id);
    }
  }

  /** Whitelist every imported field. Untrusted backup values never reach HTML. */
  function validateState(candidate, data) {
    const fail = () => { throw new Error("Kopia ma nieprawidłowy format lub pochodzi z innego zestawu."); };
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
        candidate.schemaVersion !== SCHEMA_VERSION || candidate.datasetId !== data.id ||
        !candidate.entries || typeof candidate.entries !== "object" || Array.isArray(candidate.entries)) fail();
    const allowedIds = new Set(data.words.map(word => word.id));
    const validCategories = new Set(["all", ...data.categories.map(category => category.id)]);
    if (!validCategories.has(candidate.category)) fail();
    const entries = {};
    for (const [id, value] of Object.entries(candidate.entries)) {
      if (!allowedIds.has(id) || !value || typeof value !== "object" || Array.isArray(value) ||
          typeof value.learned !== "boolean") fail();
      for (const field of ["correct", "wrong", "skipped"]) {
        if (!Number.isSafeInteger(value[field]) || value[field] < 0 || value[field] > 10000000) fail();
      }
      if (value.learned && value.correct < 1) fail();
      if (value.updatedAt !== null &&
          (typeof value.updatedAt !== "string" || value.updatedAt.length > 40 ||
           !Number.isFinite(Date.parse(value.updatedAt)))) fail();
      entries[id] = { learned: value.learned, correct: value.correct, wrong: value.wrong,
        skipped: value.skipped, updatedAt: value.updatedAt };
    }
    return { schemaVersion: SCHEMA_VERSION, datasetId: data.id, category: candidate.category, entries };
  }

  function makeBackup(state, now = new Date().toISOString()) {
    return { format: "slowko-progress", exportedAt: now, state };
  }

  function parseBackup(text, data) {
    if (typeof text !== "string" || text.length > 2000000) throw new Error("Kopia jest zbyt duża.");
    let backup;
    try { backup = JSON.parse(text); }
    catch { throw new Error("Nie udało się odczytać pliku JSON."); }
    if (!backup || backup.format !== "slowko-progress") {
      throw new Error("To nie jest kopia postępów z aplikacji Słówko.");
    }
    return validateState(backup.state, data);
  }

  function searchText(value) {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[łŁ]/g, "l").toLowerCase();
  }

  return Object.freeze({ SCHEMA_VERSION, normalizeAnswer, isCorrect, initialState, getEntry,
    recordAnswer, restoreWord, scopedWords, statistics, shuffle, StudyQueue,
    validateState, makeBackup, parseBackup, searchText });
});
