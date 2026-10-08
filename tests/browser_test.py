#!/usr/bin/env python3
"""End-to-end checks in Chromium using Playwright.
Run a server first: python3 -m http.server 8765 --directory public
Then: python3 tests/browser_test.py
Requires: pip install playwright ; an installed Chromium executable.
"""
from __future__ import annotations
import json, os, re, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("SLOWKO_TEST_URL", "http://127.0.0.1:8765")
BROWSER = os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium")
OUT = Path(os.environ.get("SLOWKO_TEST_OUT", tempfile.mkdtemp(prefix="slowko-tests-")))
OUT.mkdir(parents=True, exist_ok=True)
KEY = "slowko.czlowiek-01.v1"
reports: list[str] = []

def report(message: str) -> None:
    reports.append(message)
    print("PASS:", message, flush=True)

def current_word(page):
    return page.evaluate("""() => {
      const prompt = document.getElementById('polish-word').textContent;
      const cue = document.getElementById('word-cue').textContent;
      const category = document.getElementById('word-category').textContent;
      const c = SLOWKO_DATA.categories.find(c => c.label === category);
      return SLOWKO_DATA.words.find(w => (w.prompt || w.pl) === prompt &&
        w.category === c.id && (w.cue || '') === cue);
    }""")

def stored(page):
    return page.evaluate("""(key) => {
      const value = JSON.parse(localStorage.getItem(key));
      if (value) delete value.customVocabulary;
      return value;
    }""", KEY)

def correct(page):
    word = current_word(page)
    page.locator("#answer").fill(word["answers"][0])
    page.locator("#check-button").click()
    expect(page.locator("#feedback-title")).to_have_text("Brawo, poprawnie!")
    return word

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=BROWSER, headless=True,
                                args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 1365, "height": 1000}, accept_downloads=True)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.goto(BASE)
    expect(page.locator("#remaining-count")).to_have_text("366")
    expect(page.locator("#polish-word")).not_to_be_empty()
    page.locator("#check-button").click()
    expect(page.locator("#input-error")).to_be_visible()
    expect(page.locator("#learned-count")).to_have_text("0")
    assert not stored(page)
    report("Startup, all 366 cards, and blank submission without a counted attempt")

    first = current_word(page)
    page.locator("#answer").fill("this is definitely not the answer")
    page.locator("#answer").press("Enter")
    expect(page.locator("#solution")).to_have_text(first["en"])
    expect(page.locator("#remaining-count")).to_have_text("366")
    assert stored(page)["entries"][first["id"]]["wrong"] == 1
    assert not stored(page)["entries"][first["id"]]["learned"]
    page.locator("#next-button").click()
    assert current_word(page)["id"] != first["id"]
    success = correct(page)
    expect(page.locator("#learned-count")).to_have_text("1")
    expect(page.locator("#remaining-count")).to_have_text("365")
    assert stored(page)["entries"][success["id"]]["learned"]
    page.reload()
    expect(page.locator("#learned-count")).to_have_text("1")
    assert current_word(page)["id"] != success["id"]
    report("Wrong answer shown, retry retained, correct answer removed, progress persists after reload")

    skip = current_word(page)
    page.locator("#skip-button").click()
    expect(page.locator("#solution")).to_have_text(skip["en"])
    assert stored(page)["entries"][skip["id"]]["skipped"] == 1
    assert not stored(page)["entries"][skip["id"]]["learned"]
    report("Nie wiem reveals the solution without learning the card")

    page.locator("#category").select_option("personal")
    learned_in_scope = set()
    while page.locator("#quiz-card").is_visible():
        w = correct(page)
        assert w["id"] not in learned_in_scope
        learned_in_scope.add(w["id"])
        page.locator("#next-button").click()
    expect(page.locator("#done-card")).to_be_visible()
    expect(page.locator("#remaining-count")).to_have_text("0")
    expect(page.locator("#learned-count")).to_have_text("8")
    report("Category filtering and completion of an entire 8-card section")

    page.locator("#settings-button").click()
    with page.expect_download() as download_info:
        page.locator("#export-button").click()
    download = download_info.value
    backup_path = OUT / "test-backup.json"
    download.save_as(str(backup_path))
    exported = json.loads(backup_path.read_text(encoding="utf-8"))
    assert exported["format"] == "slowko-progress"
    saved_state = stored(page)
    assert exported["state"] == saved_state
    report("Export produces a valid JSON backup matching the stored progress")

    page.locator("#import-file").set_input_files({
        "name": "invalid.json", "mimeType": "application/json",
        "buffer": b'{"format":"wrong"}'
    })
    expect(page.locator("#toast")).to_contain_text("To nie jest kopia")
    assert stored(page) == saved_state
    report("Invalid imports are rejected without modifying progress")

    page.locator("#reset-all").click()
    expect(page.locator("#confirm-dialog")).to_be_visible()
    page.locator("#confirm-cancel").click()
    assert stored(page) == saved_state
    page.locator("#reset-all").click()
    page.locator("#confirm-ok").click()
    expect(page.locator("#learned-count")).to_have_text("0")
    expect(page.locator("#remaining-count")).to_have_text("8")
    assert stored(page)["entries"] == {}
    report("Reset confirmation can be cancelled and confirmed safely")

    page.locator("#import-file").set_input_files(str(backup_path))
    expect(page.locator("#confirm-dialog")).to_be_visible()
    page.locator("#confirm-ok").click()
    expect(page.locator("#learned-count")).to_have_text("8")
    assert stored(page) == saved_state
    page.locator("#close-settings").click()
    report("Import restores progress, statistics and selected category")

    page.locator("#nav-library").click()
    page.locator("#word-search").fill("plec")
    expect(page.locator(".word-row")).to_have_count(1)
    expect(page.locator(".word-english")).to_have_text("gender / sex")
    page.locator(".restore-button").click()
    expect(page.locator("#learned-count")).to_have_text("7")
    page.locator("#status-filter").select_option("pending")
    expect(page.locator(".word-row")).to_have_count(1)
    page.locator("#nav-study").click()
    expect(page.locator("#polish-word")).to_have_text("płeć")
    correct(page)
    report("Dictionary search without diacritics, status filters, and restoring a learned card")

    page.locator("#category").select_option("all")
    page.evaluate("""() => Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Offline cache timeout')), 12000))
    ]).then(() => true)""")
    page.wait_for_function("!!navigator.serviceWorker.controller", timeout=12000)
    ctx.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    expect(page.locator("#polish-word")).not_to_be_empty()
    expect(page.locator("#connection-status")).to_contain_text("offline")
    offline_word = correct(page)
    assert stored(page)["entries"][offline_word["id"]]["learned"]
    ctx.set_offline(False)
    report("A reload and answer checking work offline with persisted progress")

    page2 = ctx.new_page()
    page2.goto(BASE)
    page.locator("#next-button").click()
    another = correct(page2)
    page.wait_for_function("(id) => JSON.parse(localStorage.getItem('slowko.czlowiek-01.v1')).entries[id].learned",
                           arg=another["id"])
    expect(page.locator("#toast")).to_contain_text("drugiej karty")
    report("Progress changes are reflected across two open tabs")
    page2.close()
    assert not errors, errors
    ctx.close()

    # Screenshots use a fresh profile, with no fabricated learner progress.
    clean = browser.new_context(viewport={"width":1365, "height":1000})
    desktop = clean.new_page()
    desktop.add_init_script("Math.random = () => 0;")
    desktop.goto(BASE)
    desktop.screenshot(path=str(OUT / "desktop.png"), full_page=True, animations="disabled")
    correct(desktop)
    desktop.screenshot(path=str(OUT / "desktop-correct.png"), full_page=True, animations="disabled")
    clean.close()

    mobile = browser.new_context(viewport={"width":390, "height":844},
            device_scale_factor=2, is_mobile=True, has_touch=True)
    phone = mobile.new_page()
    phone.add_init_script("Math.random = () => 0;")
    phone.goto(BASE)
    for width in [320, 360, 375, 390, 430, 768]:
        phone.set_viewport_size({"width":width,"height":844})
        assert phone.evaluate("document.documentElement.scrollWidth <= innerWidth"), (
            "Horizontal overflow", width,
            phone.evaluate("({scroll:document.documentElement.scrollWidth, inner:innerWidth})"))
    phone.set_viewport_size({"width":390,"height":844})
    phone.screenshot(path=str(OUT / "mobile.png"), full_page=True, animations="disabled")
    phone.locator("#answer").fill("wrong")
    phone.locator("#check-button").click()
    expect(phone.locator("#solution")).to_be_visible()
    phone.screenshot(path=str(OUT / "mobile-wrong.png"), full_page=True, animations="disabled")
    phone.locator("#next-button").click()
    correct(phone)
    phone.locator("#settings-button").click()
    expect(phone.locator("#settings-dialog")).to_be_visible()
    phone.screenshot(path=str(OUT / "mobile-settings.png"), full_page=True, animations="disabled")
    phone.locator("#close-settings").click()
    report("Mobile touch layout, wrong/correct answers, settings and no horizontal overflow at 320–768px")
    mobile.close()

    blocked = browser.new_context(viewport={"width":390,"height":844})
    blocked.add_init_script("""Object.defineProperty(window, 'localStorage', {
      get(){throw new DOMException('Blocked', 'SecurityError')}
    });""")
    blocked_page = blocked.new_page()
    blocked_page.goto(BASE)
    expect(blocked_page.locator("#storage-notice")).to_be_visible()
    correct(blocked_page)
    expect(blocked_page.locator("#learned-count")).to_have_text("1")
    expect(blocked_page.locator("#connection-status")).to_contain_text("zapisz kopię")
    report("Blocked localStorage shows a warning but the quiz remains usable")
    blocked.close()

    standalone = browser.new_context()
    standalone_page = standalone.new_page()
    demo_path = Path(__file__).resolve().parents[1] / "slowko-demo.html"
    standalone_page.goto(demo_path.as_uri())
    expect(standalone_page.locator("#remaining-count")).to_have_text("366")
    correct(standalone_page)
    standalone_page.locator(".brand").click()
    assert standalone_page.url.startswith("file:")
    expect(standalone_page.locator("#learned-count")).to_have_text("1")
    report("Standalone HTML works directly from file without external resources")
    standalone.close()
    browser.close()
(OUT / "browser-report.json").write_text(json.dumps({"passed":reports,"count":len(reports)},ensure_ascii=False,indent=2),encoding="utf-8")
print("All browser checks passed:",len(reports),"\nOutput:",OUT)
