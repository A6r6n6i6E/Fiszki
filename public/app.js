/* Słówko — interface. All learning data stays in this browser. */
(function () {
  "use strict";
  const BASE_DATA = window.SLOWKO_DATA;
  let DATA = BASE_DATA;
  const T = window.SlowkoTxt;
  const C = window.SlowkoCore;
  const $ = id => document.getElementById(id);
  if (!DATA || !C || !T) {
    $("storage-notice").hidden = false;
    $("storage-notice").textContent = "Nie załadowano wszystkich plików aplikacji. Odśwież stronę lub sprawdź, czy skopiowano cały katalog public.";
    return;
  }

  const STORAGE_KEY = "slowko." + DATA.id + ".v1";
  const categories = new Map();
  const byId = new Map();
  const baseIds = new Set(BASE_DATA.words.map(word => word.id));
  let customText = "";
  let stagedRows = null;
  let vocabularyFileLoad = 0;

  function setData(data) {
    DATA = data;
    categories.clear();
    byId.clear();
    for (const c of data.categories) categories.set(c.id, c);
    for (const w of data.words) byId.set(w.id, w);
  }
  setData(BASE_DATA);

  function personalData(data = DATA) {
    return { ...data, words: data.words.filter(word => !baseIds.has(word.id)) };
  }

  function readSession(raw) {
    const candidate = JSON.parse(raw);
    if (candidate.customVocabulary !== undefined && typeof candidate.customVocabulary !== "string") {
      throw new Error("Invalid vocabulary in session");
    }
    const text = candidate.customVocabulary || "";
    const data = text.trim() ? T.merge(BASE_DATA, T.ensureParsed(text).rows).data : BASE_DATA;
    return { data, text, state: T.reconcileState(candidate, data) };
  }
  const standalone = Boolean(window.SLOWKO_STANDALONE) || location.protocol === "file:";
  let storageAvailable = true;
  let offlineReady = false;
  let view = "study";
  let current = null;
  let answered = false;
  let queue;
  let toastTimer;
  let pendingConfirmation = null;
  let installPrompt = null;

  // Use the visible viewport, not the area hidden behind the on-screen keyboard.
  // Keep browser zoom available: do not resize the app to a pinch-zoomed viewport.
  const compactQuery = window.matchMedia("(max-width: 700px), (max-width: 960px) and (max-height: 500px)");
  let viewportFrame = 0;
  let largestViewport = 0;
  const isCompact = () => compactQuery.matches;
  function fitViewport() {
    viewportFrame = 0;
    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) > 0.05) return;
    const height = Math.round(vv ? vv.height : window.innerHeight);
    const answerFocused = document.activeElement === $("answer") && !answered;
    if (!answerFocused) largestViewport = height;
    else largestViewport = Math.max(largestViewport, height);
    document.documentElement.style.setProperty("--app-height", height + "px");
    document.body.classList.toggle("compact-height", isCompact() && height < 590);
    document.body.classList.toggle("tiny-viewport", isCompact() && height < 400);
    document.body.classList.toggle("keyboard-open", isCompact() && answerFocused &&
      (largestViewport - height > 115 || height < 480));
  }
  function scheduleViewport() {
    if (!viewportFrame) viewportFrame = requestAnimationFrame(fitViewport);
  }
  window.addEventListener("resize", scheduleViewport);
  window.visualViewport?.addEventListener("resize", scheduleViewport);
  document.addEventListener("focusin", scheduleViewport);
  document.addEventListener("focusout", scheduleViewport);
  compactQuery.addEventListener("change", () => {
    $("feedback-details").open = !isCompact();
    scheduleViewport();
  });
  fitViewport();

  function showNotice(message) {
    $("storage-notice").textContent = message;
    $("storage-notice").hidden = false;
  }

  function loadState() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); }
    catch {
      storageAvailable = false;
      showNotice("Przeglądarka blokuje zapis postępów. Nauka działa, ale wyniki mogą zniknąć po zamknięciu karty. Używaj opcji „Zapisz kopię” w ustawieniach.");
      return C.initialState(DATA);
    }
    if (!raw) return C.initialState(DATA);
    try {
      const loaded = readSession(raw);
      setData(loaded.data);
      customText = loaded.text;
      return loaded.state;
    }
    catch {
      // Preserve the unreadable original rather than silently deleting it.
      try { localStorage.setItem(STORAGE_KEY + ".recovery." + Date.now(), raw); }
      catch { storageAvailable = false; }
      showNotice("Nie udało się odczytać zapisanych wyników. Uruchomiono pustą sesję. Wczytaj ostatnią kopię JSON; nieprawidłowy zapis pozostawiono w pamięci przeglądarki.");
      return C.initialState(DATA);
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, customVocabulary: customText }));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
      showNotice("Nie można zapisać postępu w przeglądarce. Wyniki tej sesji są w pamięci karty — zapisz ich kopię w ustawieniach przed jej zamknięciem.");
    }
    renderConnection();
  }

  function toast(message) {
    clearTimeout(toastTimer);
    const node = $("toast");
    // A dialog lives in the browser's top layer, so keep messages in it while open.
    const parent = $("vocab-dialog").open ? $("vocab-dialog") : $("settings-dialog").open ? $("settings-dialog") : document.body;
    parent.append(node);
    node.textContent = message;
    node.hidden = false;
    toastTimer = setTimeout(() => { node.hidden = true; }, 5000);
  }

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.append(use);
    return svg;
  }

  function wordsInScope() { return C.scopedWords(DATA, state.category); }

  function initCategories() {
    const select = $("category");
    select.replaceChildren();
    select.append(new Option("Wszystkie działy · " + DATA.words.length, "all"));
    for (const category of DATA.categories) {
      const count = DATA.words.filter(word => word.category === category.id).length;
      select.append(new Option(category.label + " · " + count, category.id));
    }
    select.value = state.category;
    $("set-size").textContent = DATA.words.length + " fiszek · " + DATA.categories.length + " działów";
    $("source-summary").textContent = DATA.words.length + " fiszek w " + DATA.categories.length +
      " działach. Baza początkowa pochodzi z dwóch zdjęć rozdziału „Człowiek / Unit 01”. Wersja 1.2 czyta bazę projektu z pliku data/slowka.txt i obsługuje prywatne importy TXT.";
  }

  function renderStatistics() {
    const stats = C.statistics(wordsInScope(), state);
    const percent = stats.total ? Math.floor(100 * stats.learned / stats.total) : 0;
    $("learned-count").textContent = stats.learned;
    $("remaining-count").textContent = stats.remaining;
    $("accuracy").textContent = stats.accuracy === null ? "—" : stats.accuracy + "%";
    $("progress-percent").replaceChildren(document.createTextNode(String(percent)));
    const unit = document.createElement("span");
    unit.textContent = "%";
    $("progress-percent").append(unit);
    $("progress-ring").style.setProperty("--progress", percent + "%");
    $("progress-ring").setAttribute("aria-valuenow", String(percent));
    $("progress-ring").setAttribute("aria-valuetext", stats.learned + " z " + stats.total + " fiszek opanowanych");
    const global = C.statistics(DATA.words, state);
    $("global-progress").textContent = state.category === "all" ? "" :
      "Cały zestaw: " + global.learned + " / " + global.total + " opanowanych";
    $("reset-scope").disabled = stats.attempts === 0;
  }

  function rebuildQueue() { queue = new C.StudyQueue(wordsInScope(), state); }

  function renderCompletion() {
    $("quiz-card").hidden = true;
    $("done-card").hidden = false;
    const stats = C.statistics(wordsInScope(), state);
    const allStats = C.statistics(DATA.words, state);
    $("done-title").textContent = state.category === "all" ? "Wszystko opanowane." : "Ten dział już umiesz.";
    $("done-description").textContent = "Opanowane fiszki: " + stats.learned + " / " + stats.total +
      ". Nie ma już słówek do losowania w tym zakresie. Świetna robota!";
    $("done-all").hidden = state.category === "all" || allStats.remaining === 0;
    $("done-reset").textContent = state.category === "all" ? "Rozpocznij cały zestaw od nowa" : "Rozpocznij ten dział od nowa";
  }

  function nextCard(shouldFocus = false) {
    current = queue.draw(state);
    answered = false;
    $("quiz-card").classList.remove("is-answered");
    $("feedback-details").open = !isCompact();
    document.querySelector(".quiz-content").scrollTop = 0;
    scheduleViewport();
    renderStatistics();
    if (!current) { renderCompletion(); return; }
    $("quiz-card").hidden = false;
    $("done-card").hidden = true;
    $("word-category").textContent = categories.get(current.category).label;
    const prompt = current.prompt || current.pl;
    $("polish-word").textContent = prompt;
    $("polish-word").classList.toggle("long", prompt.length > 44);
    $("word-cue").textContent = current.cue || "";
    $("word-cue").hidden = !current.cue;
    const entry = C.getEntry(state, current.id);
    const isRetry = entry.wrong + entry.skipped > 0;
    $("attempt-label").textContent = isRetry ? "TO SŁÓWKO JESZCZE ĆWICZYMY" : "JAK TO NAPISZESZ PO ANGIELSKU?";
    $("attempt-label").classList.toggle("retry", isRetry);
    const answer = $("answer");
    answer.value = "";
    answer.readOnly = false;
    answer.setAttribute("aria-invalid", "false");
    $("input-wrap").classList.remove("is-correct", "is-wrong");
    $("input-icon").textContent = "";
    $("input-error").hidden = true;
    $("input-error").textContent = "";
    $("feedback").hidden = true;
    $("skip-button").hidden = false;
    $("check-button").hidden = false;
    $("next-button").hidden = true;
    $("answer-hint").textContent = /\b(sb|sth)\b/.test(current.en)
      ? "sb = somebody / someone, sth = something. Możesz wpisać skrót albo pełne słowo."
      : current.sourcePhoto && current.en.includes("(")
        ? "Część w nawiasie jest opcjonalna. Wielkość liter nie ma znaczenia."
        : "Wielkość liter i dodatkowe spacje nie mają znaczenia.";
    // On phones, show the new prompt first instead of immediately reopening the keyboard.
    if (shouldFocus && view === "study" && !isCompact()) answer.focus({ preventScroll: true });
  }

  function submitAnswer(skipped = false) {
    if (!current || answered) return;
    const value = $("answer").value;
    if (!skipped && !C.normalizeAnswer(value)) {
      $("input-error").textContent = "Najpierw wpisz odpowiedź albo wybierz „Nie wiem”.";
      $("input-error").hidden = false;
      $("answer").setAttribute("aria-invalid", "true");
      $("answer").focus();
      return;
    }

    answered = true; // Guard against Enter + click or rapid double taps.
    const correct = !skipped && C.isCorrect(current, value);
    const verdict = correct ? "correct" : skipped ? "skipped" : "wrong";
    const sibling = !correct && !skipped && (current.siblings || [])
      .map(id => byId.get(id)).find(word => word && C.isCorrect(word, value));
    state = C.recordAnswer(state, current.id, verdict);
    if (!correct) queue.retry(current.id);
    saveState();
    renderStatistics();

    if (isCompact()) $("answer").blur();
    $("quiz-card").classList.add("is-answered");
    $("feedback-details").open = !isCompact();
    $("answer").readOnly = true;
    $("answer").setAttribute("aria-invalid", correct || skipped ? "false" : "true");
    $("input-error").hidden = true;
    $("input-wrap").classList.toggle("is-correct", correct);
    $("input-wrap").classList.toggle("is-wrong", !correct);
    $("input-icon").textContent = correct ? "✓" : "↺";
    $("feedback").classList.toggle("is-wrong", !correct);
    $("feedback-title").textContent = correct ? "Brawo, poprawnie!" :
      sibling ? "To też poprawny synonim." : skipped ? "Spokojnie. Zapamiętaj i spróbuj później." : "Jeszcze trochę praktyki.";
    $("feedback-symbol").textContent = correct ? "✓" : "↺";
    $("solution-label").textContent = correct ? "POPRAWNA ODPOWIEDŹ" : sibling ? "W TEJ FISZCE ĆWICZYMY" : "ZAPAMIĘTAJ TEN ZAPIS";
    $("solution").textContent = current.en;
    $("typed-answer").textContent = !skipped && !correct ? "Twoja odpowiedź: " + value.trim() : "";
    $("typed-answer").hidden = skipped || correct;
    $("feedback-brief").textContent = correct
      ? "Opanowane. Nie wróci do losowania."
      : sibling ? "Tu ćwiczymy inne hasło. Ta fiszka wróci." : "To słówko wróci do nauki.";
    $("feedback-description").textContent = correct
      ? "To słówko jest opanowane i nie wróci do losowania."
      : sibling
        ? "Pytanie ze wskazówką dotyczy drugiego hasła. Ta fiszka zostaje do nauki; spróbujesz jej ponownie później."
        : "Ta fiszka zostaje w puli. Wróci w losowym miejscu, aż zapiszesz odpowiedź poprawnie.";
    $("variant-note").hidden = current.answers.length < 2;
    $("variant-note").textContent = current.answers.length > 1
      ? "Akceptowane warianty: " + current.answers.join(" · ") + "." : "";
    $("feedback").hidden = false;
    $("check-button").hidden = true;
    $("skip-button").hidden = true;
    $("next-label").textContent = C.statistics(wordsInScope(), state).remaining === 0
      ? "Zobacz podsumowanie" : "Następne słówko";
    $("next-button").hidden = false;
    $("next-button").focus({ preventScroll: true });
    document.querySelector(".quiz-content").scrollTop = 0;
    scheduleViewport();
  }

  function showView(next) {
    view = next;
    document.body.dataset.view = next;
    if (next === "study" && isCompact()) window.scrollTo({ top: 0, behavior: "auto" });
    scheduleViewport();
    $("study-view").hidden = next !== "study";
    $("library-view").hidden = next !== "library";
    for (const id of ["study", "library"]) {
      const button = $("nav-" + id);
      button.classList.toggle("active", id === next);
      if (id === next) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    $("page-title").textContent = next === "study" ? "Jedno słówko bliżej." : "Twoja kolekcja słów.";
    document.querySelector(".page-subtitle").textContent = next === "study"
      ? "Przeczytaj po polsku. Zapisz po angielsku. Zapamiętaj."
      : "Przeglądaj hasła, sprawdzaj znaczenia i wracaj do nauki.";
    if (next === "library") renderLibrary();
  }

  function renderLibrary() {
    const query = C.searchText($("word-search").value.trim());
    const status = $("status-filter").value;
    const matches = wordsInScope().filter(word => {
      const learned = C.getEntry(state, word.id).learned;
      if ((status === "learned" && !learned) || (status === "pending" && learned)) return false;
      return !query || C.searchText(word.pl + " " + word.en + " " + word.answers.join(" ") +
        " " + categories.get(word.category).label).includes(query);
    });
    $("library-count").textContent = "Wyświetlane fiszki: " + matches.length + " / " + wordsInScope().length;
    $("library-empty").hidden = matches.length !== 0;
    const fragment = document.createDocumentFragment();
    for (const word of matches) {
      const entry = C.getEntry(state, word.id);
      const li = document.createElement("li");
      li.className = "word-row";
      li.dataset.wordId = word.id;
      const main = document.createElement("div");
      main.className = "word-row-main";
      const pl = document.createElement("strong");
      pl.textContent = word.pl;
      const en = document.createElement("p");
      en.className = "word-english";
      en.lang = "en";
      en.textContent = word.en;
      const meta = document.createElement("p");
      meta.className = "word-meta";
      meta.textContent = categories.get(word.category).label + (word.sourcePhoto ? " · zdjęcie " + word.sourcePhoto : word.source === "import" ? " · import TXT" : " · baza TXT") +
        (word.note ? " · uzupełnione tłumaczenie" : "");
      if (word.note) meta.title = word.note;
      main.append(pl, en, meta);
      const right = document.createElement("div");
      right.className = "word-state";
      const chip = document.createElement("span");
      chip.className = "state-chip" + (entry.learned ? " learned" : "");
      chip.textContent = entry.learned ? "✓ Opanowane" : entry.wrong + entry.skipped > 0 ? "Do powtórki" : "Do nauki";
      right.append(chip);
      if (entry.learned) {
        const restore = document.createElement("button");
        restore.className = "icon-button restore-button";
        restore.type = "button";
        restore.setAttribute("aria-label", "Przywróć do nauki: " + word.en);
        restore.title = "Przywróć do nauki";
        restore.append(icon("refresh"));
        restore.addEventListener("click", () => {
          state = C.restoreWord(state, word.id);
          saveState();
          rebuildQueue();
          nextCard(false);
          renderLibrary();
          toast("Przywrócono do nauki: " + word.en + ".");
        });
        right.append(restore);
      }
      li.append(main, right);
      fragment.append(li);
    }
    $("word-list").replaceChildren(fragment);
  }

  function applyCategory(category, focus = false) {
    if (category !== "all" && !categories.has(category)) return;
    state = { ...state, category };
    $("category").value = category;
    saveState();
    rebuildQueue();
    nextCard(focus);
    if (view === "library") renderLibrary();
  }

  function ask(title, description, okLabel = "Potwierdź", danger = true) {
    if ($("confirm-dialog").open) return Promise.resolve(false);
    $("confirm-title").textContent = title;
    $("confirm-description").textContent = description;
    $("confirm-ok").textContent = okLabel;
    $("confirm-ok").className = "button " + (danger ? "button-danger" : "button-primary");
    return new Promise(resolve => {
      pendingConfirmation = resolve;
      $("confirm-dialog").showModal();
      $("confirm-cancel").focus();
    });
  }

  async function resetProgress(all = false) {
    const ids = (all ? DATA.words : wordsInScope()).map(word => word.id);
    const label = all || state.category === "all" ? "całym zestawie" : "dziale „" + categories.get(state.category).label + "”";
    if (!await ask("Rozpocząć od nowa?", "Usuniesz wszystkie wyniki w " + label +
      ". Liczba fiszek: " + ids.length + ". Tej operacji nie można cofnąć bez wcześniej zapisanej kopii.", "Wyzeruj wyniki")) return;
    const entries = { ...state.entries };
    for (const id of ids) delete entries[id];
    state = { ...state, entries };
    saveState();
    rebuildQueue();
    nextCard(false);
    if (view === "library") renderLibrary();
    toast("Wyniki wyzerowane. Możesz zacząć od początku.");
  }

  function openSettings(source = false) {
    $("settings-dialog").showModal();
    if (source) {
      $("source-details").open = true;
      $("source-details").scrollIntoView({ block: "nearest" });
    }
  }

  function exportProgress() {
    try {
      const text = JSON.stringify({ ...C.makeBackup(state), vocabularyText: T.serialize(DATA) }, null, 2);
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "slowko-postepy-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast("Przygotowano kopię JSON. Zachowaj ją w bezpiecznym miejscu.");
    } catch {
      toast("Nie udało się przygotować pliku. Spróbuj ponownie w zwykłej karcie przeglądarki.");
    }
  }

  async function importProgress(file) {
    if (!file) return;
    try {
      if (file.size > 6000000) throw new Error("Ten plik jest za duży. Wybierz kopię postępów JSON (do 6 MB).");
      const raw = await file.text();
      let snapshot;
      try { snapshot = JSON.parse(raw); }
      catch { throw new Error("Nie udało się odczytać pliku JSON."); }
      if (!snapshot || snapshot.format !== "slowko-progress") throw new Error("To nie jest kopia postępów z aplikacji Słówko.");
      if (snapshot.vocabularyText !== undefined && typeof snapshot.vocabularyText !== "string") throw new Error("Nieprawidłowa lista słówek w kopii.");
      const incomingData = snapshot.vocabularyText ? T.merge(BASE_DATA, T.ensureParsed(snapshot.vocabularyText).rows).data : DATA;
      const imported = C.validateState({ ...snapshot.state, category: incomingData.categories.some(c => c.id === snapshot.state?.category) ? snapshot.state.category : "all" }, incomingData);
      const importedStats = C.statistics(incomingData.words, imported);
      const accepted = await ask("Wczytać zapisaną kopię?",
        "Kopia zawiera " + importedStats.learned + " opanowanych fiszek i " +
        importedStats.attempts + " prób. Zastąpi obecne wyniki" + (snapshot.vocabularyText ? " i odtworzy listę prywatnych słówek" : "") + ". Najpierw możesz anulować i zapisać bieżącą kopię.",
        "Wczytaj kopię", false);
      if (!accepted) return;
      state = imported;
      setData(incomingData);
      const own = personalData();
      customText = own.words.length ? T.serialize(own) : "";
      initCategories();
      renderVocabularySummary();
      saveState();
      rebuildQueue();
      nextCard(false);
      if (view === "library") renderLibrary();
      toast("Wczytano kopię postępów.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Nie udało się wczytać kopii.");
    } finally {
      $("import-file").value = "";
    }
  }


  function refreshCollection() {
    initCategories();
    rebuildQueue();
    nextCard(false);
    if (view === "library") renderLibrary();
    renderVocabularySummary();
  }

  function renderVocabularySummary() {
    const count = personalData().words.length;
    $("vocab-summary").textContent = "Baza projektu: " + BASE_DATA.words.length +
      " \u00b7 Dodane na tym urz\u0105dzeniu: " + count + " \u00b7 Razem: " + DATA.words.length;
    $("export-own-txt").disabled = count === 0;
    $("clear-own-txt").disabled = count === 0;
  }

  function openVocabulary() {
    $("settings-dialog").close();
    renderVocabularySummary();
    $("vocab-dialog").showModal();
  }

  function invalidateVocabularyPreview() {
    stagedRows = null;
    $("vocab-preview").hidden = true;
    $("confirm-vocab-import").disabled = true;
    $("vocab-result").hidden = true;
  }

  function vocabularyError(message) {
    stagedRows = null;
    $("confirm-vocab-import").disabled = true;
    $("vocab-preview").hidden = true;
    const result = $("vocab-result");
    result.textContent = message;
    result.className = "vocab-result is-error";
    result.hidden = false;
  }

  function previewVocabulary() {
    invalidateVocabularyPreview();
    try {
      const parsed = T.parse($("vocab-text").value);
      if (parsed.errors.length) {
        vocabularyError("Nic nie zosta\u0142o dodane. Popraw list\u0119:\n" + parsed.errors.slice(0, 10)
          .map(e => (e.line ? "Wiersz " + e.line + ": " : "") + e.message).join("\n"));
        return;
      }
      const merged = T.merge(DATA, parsed.rows);
      stagedRows = parsed.rows;
      $("vocab-preview-title").textContent = "Nowe fiszki: " + merged.added +
        " \u00b7 Pomijane duplikaty: " + (merged.duplicates + parsed.duplicates);
      const fragment = document.createDocumentFragment();
      for (const row of merged.addedRows.slice(0, 5)) {
        const li = document.createElement("li");
        const pl = document.createElement("strong");
        pl.textContent = row.pl;
        const en = document.createElement("span");
        en.lang = "en";
        en.textContent = row.answers.join(" / ");
        li.append(pl, en);
        fragment.append(li);
      }
      $("vocab-preview-list").replaceChildren(fragment);
      $("vocab-preview-note").textContent = merged.added > 5 ? "Pokazano pierwsze 5 z " + merged.added + " nowych fiszek." :
        merged.added === 0 ? "Wszystkie has\u0142a s\u0105 ju\u017c w bazie. Ich wyniki i warianty odpowiedzi pozostaj\u0105 bez zmian." : "Wyniki dotychczasowych fiszek pozostan\u0105 bez zmian.";
      $("confirm-vocab-import").disabled = merged.added === 0;
      $("vocab-preview").hidden = false;
    } catch (error) { vocabularyError(error.message || "Nie uda\u0142o si\u0119 sprawdzi\u0107 listy."); }
  }

  async function loadVocabularyFile(file) {
    if (!file) return;
    const request = ++vocabularyFileLoad;
    invalidateVocabularyPreview();
    $("preview-vocab-button").disabled = true;
    try {
      if (file.size > T.MAX_LENGTH) throw new Error("Plik TXT jest za du\u017cy. Limit: 2 MB.");
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error("Nie uda\u0142o si\u0119 odczyta\u0107 TXT. Zapisz plik w kodowaniu UTF-8."); }
      if (request !== vocabularyFileLoad) return;
      $("vocab-text").value = text;
      $("vocab-file-name").textContent = "Wybrano: " + file.name;
      previewVocabulary();
    } catch (error) {
      if (request === vocabularyFileLoad) vocabularyError(error.message || "Nie uda\u0142o si\u0119 odczyta\u0107 pliku.");
    } finally {
      if (request === vocabularyFileLoad) {
        $("preview-vocab-button").disabled = false;
        $("vocab-file").value = "";
      }
    }
  }

  function commitVocabulary() {
    if (!stagedRows) return;
    try {
      // Recompute against the live collection in case a second tab changed it.
      const merged = T.merge(DATA, stagedRows);
      if (!merged.added) { previewVocabulary(); return; }
      setData(merged.data);
      customText = T.serialize(personalData());
      state = { ...state, category: "all" };
      saveState();
      refreshCollection();
      $("vocab-text").value = "";
      $("vocab-file-name").textContent = "";
      invalidateVocabularyPreview();
      $("vocab-result").textContent = "Dodano " + merged.added + " nowych fiszek. S\u0105 ju\u017c w puli do nauki. Dotychczasowy post\u0119p zachowany." +
        (storageAvailable ? "" : " UWAGA: zapis lokalny jest zablokowany. Zapisz kopi\u0119 JSON przed zamkni\u0119ciem karty.");
      $("vocab-result").className = "vocab-result";
      $("vocab-result").hidden = false;
      $("vocab-result").scrollIntoView({ block: "nearest" });
    } catch (error) { vocabularyError(error.message || "Nie uda\u0142o si\u0119 doda\u0107 s\u0142\u00f3wek."); }
  }

  function downloadText(text, filename) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast("Przygotowano plik " + filename + ".");
    } catch { toast("Nie uda\u0142o si\u0119 przygotowa\u0107 pliku. Spr\u00f3buj w zwyk\u0142ej karcie przegl\u0105darki."); }
  }

  async function clearPersonalVocabulary() {
    const count = personalData().words.length;
    if (!count || !await ask("Usun\u0105\u0107 prywatny import?", "Usuniesz " + count +
      " zaimportowanych fiszek i ich wyniki. Baza projektu i jej post\u0119p pozostan\u0105. Najpierw mo\u017cesz zapisa\u0107 kopi\u0119 JSON w ustawieniach.", "Usu\u0144 import")) return;
    setData(BASE_DATA);
    customText = "";
    state = T.reconcileState(state, DATA);
    saveState();
    refreshCollection();
    invalidateVocabularyPreview();
    toast("Usuni\u0119to prywatny import. Baza projektu i jej wyniki zosta\u0142y zachowane.");
  }

  function renderConnection() {
    const node = $("connection-status");
    const dot = $("connection-dot");
    dot.classList.toggle("warning", !storageAvailable);
    dot.classList.toggle("offline", !navigator.onLine && storageAvailable);
    if (!storageAvailable) node.textContent = "Postęp tylko w tej karcie — zapisz kopię";
    else if (standalone) node.textContent = "Wersja plikowa · postęp na tym urządzeniu";
    else if (!navigator.onLine) node.textContent = offlineReady ? "Tryb offline · postęp zapisany lokalnie" : "Brak połączenia · zapis lokalny";
    else if (offlineReady) node.textContent = "Gotowe offline · zapis lokalny";
    else node.textContent = "Postęp zapisywany lokalnie";
    $("connection-settings").textContent = node.textContent;
  }

  async function prepareOffline() {
    if (standalone || !("serviceWorker" in navigator) || !window.isSecureContext) return;
    try {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const registration = await navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (hadController) toast("Nowa wersja aplikacji jest gotowa. Odśwież stronę po zakończeniu odpowiedzi.");
      });
      await navigator.serviceWorker.ready;
      offlineReady = true;
      renderConnection();
    } catch {
      // Learning remains fully usable online even when offline caching is unavailable.
      offlineReady = false;
      renderConnection();
    }
  }

  document.querySelector(".brand").addEventListener("click", event => {
    event.preventDefault();
    showView("study");
    window.scrollTo({ top: 0, behavior: "auto" });
  });
  $("answer-form").addEventListener("submit", event => {
    event.preventDefault();
    if (answered) nextCard(true);
    else submitAnswer(false);
  });
  $("answer").addEventListener("input", () => {
    if (!answered) {
      $("input-error").hidden = true;
      $("answer").setAttribute("aria-invalid", "false");
    }
  });
  $("skip-button").addEventListener("click", () => submitAnswer(true));
  $("next-button").addEventListener("click", () => nextCard(true));
  $("nav-study").addEventListener("click", () => showView("study"));
  $("nav-library").addEventListener("click", () => showView("library"));
  $("category").addEventListener("change", event => applyCategory(event.target.value));
  $("word-search").addEventListener("input", renderLibrary);
  $("status-filter").addEventListener("change", renderLibrary);
  $("settings-button").addEventListener("click", () => openSettings());
  $("about-button").addEventListener("click", () => openSettings(true));
  $("close-settings").addEventListener("click", () => $("settings-dialog").close());
  $("settings-dialog").addEventListener("close", () => document.body.append($("toast")));
  $("settings-dialog").addEventListener("click", event => {
    if (event.target !== $("settings-dialog")) return;
    const rect = $("settings-dialog").getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) $("settings-dialog").close();
  });
  $("confirm-cancel").addEventListener("click", () => $("confirm-dialog").close("no"));
  $("confirm-ok").addEventListener("click", () => $("confirm-dialog").close("yes"));
  $("confirm-dialog").addEventListener("cancel", event => {
    event.preventDefault();
    $("confirm-dialog").close("no");
  });
  $("confirm-dialog").addEventListener("close", () => {
    if (pendingConfirmation) {
      const resolve = pendingConfirmation;
      pendingConfirmation = null;
      resolve($("confirm-dialog").returnValue === "yes");
    }
  });
  $("reset-scope").addEventListener("click", () => resetProgress(false));
  $("reset-all").addEventListener("click", () => resetProgress(true));
  $("done-reset").addEventListener("click", () => resetProgress(false));
  $("done-all").addEventListener("click", () => applyCategory("all"));
  $("done-library").addEventListener("click", () => showView("library"));
  $("export-button").addEventListener("click", exportProgress);
  $("import-button").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", event => importProgress(event.target.files[0]));

  $("add-vocab-button").addEventListener("click", openVocabulary);
  $("library-add-vocab").addEventListener("click", openVocabulary);
  $("settings-vocab-button").addEventListener("click", openVocabulary);
  $("close-vocab").addEventListener("click", () => $("vocab-dialog").close());
  $("vocab-dialog").addEventListener("close", () => document.body.append($("toast")));
  $("choose-vocab-file").addEventListener("click", () => $("vocab-file").click());
  $("vocab-file").addEventListener("change", event => loadVocabularyFile(event.target.files[0]));
  $("vocab-text").addEventListener("input", () => {
    ++vocabularyFileLoad;
    $("preview-vocab-button").disabled = false;
    $("vocab-file-name").textContent = "";
    invalidateVocabularyPreview();
  });
  $("preview-vocab-button").addEventListener("click", previewVocabulary);
  $("confirm-vocab-import").addEventListener("click", commitVocabulary);
  $("export-all-txt").addEventListener("click", () => downloadText(T.serialize(DATA), "slowka-wszystkie.txt"));
  $("export-own-txt").addEventListener("click", () => downloadText(T.serialize(personalData()), "slowka-wlasne.txt"));
  $("clear-own-txt").addEventListener("click", clearPersonalVocabulary);
  window.addEventListener("online", renderConnection);
  window.addEventListener("offline", renderConnection);
  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const loaded = readSession(event.newValue);
      setData(loaded.data);
      customText = loaded.text;
      state = loaded.state;
      refreshCollection();
      if (stagedRows) previewVocabulary();
      toast("Zaktualizowano postęp z drugiej karty przeglądarki.");
    } catch { /* Ignore invalid external writes without damaging current state. */ }
  });

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    $("install-button").hidden = false;
  });
  $("install-button").addEventListener("click", async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $("install-button").hidden = true;
  });

  initCategories();
  rebuildQueue();
  nextCard(false);
  renderConnection();
  if (document.readyState === "complete") prepareOffline();
  else window.addEventListener("load", prepareOffline, { once: true });
})();
