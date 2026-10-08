#!/usr/bin/env python3
"""Isolated DOM/UI checks; no browser navigation or network access.
The host browser may block navigation. This harness loads the standalone HTML
with set_content and substitutes in-memory Storage and the download transport.
These checks do NOT establish real browser disk persistence or offline support.
For real-origin checks use browser_test.py on a browser which allows navigation.
"""
from __future__ import annotations
import json, os, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "slowko-demo.html").read_text(encoding="utf-8")
OUT = Path(os.environ.get("SLOWKO_TEST_OUT", tempfile.mkdtemp(prefix="slowko-ui-")))
OUT.mkdir(parents=True, exist_ok=True)
KEY = "slowko.czlowiek-01.v1"
reports = []
errors = []

def report(message):
    reports.append(message)
    print("PASS:", message, flush=True)

def mount(context, seed=None, blocked=False):
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.evaluate("""({seed, blocked}) => {
      const items = {...seed};
      if (blocked) Object.defineProperty(window, 'localStorage', {configurable:true,
        get(){ throw new DOMException('Blocked for test', 'SecurityError'); }});
      else Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:key => items[key] ?? null,
        setItem:(key,value) => {items[key]=String(value);},
        removeItem:key => {delete items[key];},
        clear:() => {Object.keys(items).forEach(key=>delete items[key]);},
        key:index => Object.keys(items)[index] || null,
        get length(){return Object.keys(items).length}
      }});
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function(){
        if (this.download) {window.__testDownloadName = this.download; return;}
        return click.call(this);
      };
      URL.createObjectURL = blob => {window.__testExportBlob=blob;return 'blob:isolated-test';};
      Math.random = () => 0;
    }""", {"seed": seed or {}, "blocked":blocked})
    page.set_content(HTML, wait_until="domcontentloaded")
    return page

def stored(page):
    return page.evaluate("""(key) => {
      const value = JSON.parse(localStorage.getItem(key));
      if (value) delete value.customVocabulary;
      return value;
    }""", KEY)

def word(page):
    return page.evaluate("""() => {
      const q=document.getElementById('polish-word').textContent;
      const cue=document.getElementById('word-cue').textContent;
      const label=document.getElementById('word-category').textContent;
      const c=SLOWKO_DATA.categories.find(c=>c.label===label);
      return SLOWKO_DATA.words.find(w=>(w.prompt||w.pl)===q&&w.category===c.id&&(w.cue||'')===cue);
    }""")

def correct(page):
    w=word(page)
    page.locator("#answer").fill(w["answers"][0])
    page.locator("#check-button").click()
    expect(page.locator("#feedback-title")).to_have_text("Brawo, poprawnie!")
    return w

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH","/usr/bin/chromium"),
                             headless=True,args=["--no-sandbox"])
    ctx=browser.new_context(viewport={"width":1365,"height":1000})
    page=mount(ctx)
    expect(page.locator("#remaining-count")).to_have_text("366")
    page.locator("#check-button").click()
    expect(page.locator("#input-error")).to_be_visible()
    assert stored(page) is None
    report("Empty input is not counted; all 366 cards load")

    first=word(page)
    page.locator("#answer").fill("incorrect")
    page.locator("#answer").press("Enter")
    expect(page.locator("#solution")).to_have_text(first["en"])
    assert stored(page)["entries"][first["id"]]["wrong"]==1
    assert not stored(page)["entries"][first["id"]]["learned"]
    page.locator("#next-button").click()
    assert word(page)["id"]!=first["id"]
    success=correct(page)
    expect(page.locator("#learned-count")).to_have_text("1")
    expect(page.locator("#remaining-count")).to_have_text("365")
    saved=stored(page)
    page.close()
    page=mount(ctx,{KEY:json.dumps(saved)})
    expect(page.locator("#learned-count")).to_have_text("1")
    assert word(page)["id"]!=success["id"]
    report("Wrong/correct flow, no immediate retry, learned-card exclusion and state rehydration")

    skipped=word(page)
    page.locator("#skip-button").click()
    expect(page.locator("#solution")).to_have_text(skipped["en"])
    assert stored(page)["entries"][skipped["id"]]["skipped"]==1
    report("Nie wiem reveals the expected answer and retains the card")

    page.locator("#category").select_option("personal")
    seen=set()
    while page.locator("#quiz-card").is_visible():
        w=correct(page)
        assert w["id"] not in seen
        seen.add(w["id"])
        page.locator("#next-button").click()
    expect(page.locator("#done-card")).to_be_visible()
    expect(page.locator("#learned-count")).to_have_text("8")
    report("Filtered section can be completed; completion screen appears")

    page.locator("#settings-button").click()
    page.locator("#export-button").click()
    exported=page.evaluate("() => __testExportBlob.text().then(JSON.parse)")
    saved=stored(page)
    assert exported["state"]==saved
    assert exported["format"]=="slowko-progress"
    assert page.evaluate("__testDownloadName").endswith(".json")
    report("Export button constructs the correct JSON backup payload")

    page.locator("#import-file").set_input_files({"name":"invalid.json","mimeType":"application/json","buffer":b"{}"})
    expect(page.locator("#toast")).to_contain_text("To nie jest kopia")
    assert stored(page)==saved
    page.locator("#reset-all").click()
    page.locator("#confirm-cancel").click()
    assert stored(page)==saved
    page.locator("#reset-all").click()
    page.locator("#confirm-ok").click()
    expect(page.locator("#learned-count")).to_have_text("0")
    assert stored(page)["entries"]=={}
    report("Invalid backup and cancelled reset leave data intact; confirmed reset works")

    page.locator("#import-file").set_input_files({
      "name":"valid.json","mimeType":"application/json",
      "buffer":json.dumps(exported).encode()})
    expect(page.locator("#confirm-dialog")).to_be_visible()
    page.locator("#confirm-ok").click()
    expect(page.locator("#learned-count")).to_have_text("8")
    assert stored(page)==saved
    page.locator("#close-settings").click()
    report("Validated import restores all counts and selected category")

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
    report("Dictionary accent-insensitive search, pending filter and restoration of a learned word")
    ctx.close()

    clean=browser.new_context(viewport={"width":1365,"height":1000})
    desktop=mount(clean)
    desktop.screenshot(path=str(OUT/"desktop.png"),full_page=True, animations="disabled")
    correct(desktop)
    desktop.screenshot(path=str(OUT/"desktop-correct.png"),full_page=True, animations="disabled")
    clean.close()

    mobile=browser.new_context(viewport={"width":390,"height":844},device_scale_factor=2,is_mobile=True,has_touch=True)
    phone=mount(mobile)
    for width in [320,360,375,390,430,768]:
        phone.set_viewport_size({"width":width,"height":844})
        size=phone.evaluate("({w:innerWidth,s:document.documentElement.scrollWidth})")
        assert size["s"]<=size["w"],("Horizontal overflow",width,size)
    phone.set_viewport_size({"width":390,"height":844})
    phone.screenshot(path=str(OUT/"mobile.png"),full_page=True, animations="disabled")
    phone.locator("#answer").fill("wrong")
    phone.locator("#check-button").click()
    expect(phone.locator("#solution")).to_be_visible()
    phone.screenshot(path=str(OUT/"mobile-wrong.png"),full_page=True, animations="disabled")
    phone.locator("#next-button").click()
    correct(phone)
    phone.locator("#settings-button").click()
    expect(phone.locator("#settings-dialog")).to_be_visible()
    phone.screenshot(path=str(OUT/"mobile-settings.png"),full_page=True, animations="disabled")
    phone.locator("#close-settings").click()
    phone.locator(".brand").click()
    expect(phone.locator("#study-view")).to_be_visible()
    report("Touch-sized layouts at 320–768px, answer feedback, navigation and settings")
    mobile.close()

    blocked=browser.new_context(viewport={"width":390,"height":844})
    denied=mount(blocked,blocked=True)
    expect(denied.locator("#storage-notice")).to_be_visible()
    correct(denied)
    expect(denied.locator("#learned-count")).to_have_text("1")
    expect(denied.locator("#connection-status")).to_contain_text("zapisz kopię")
    report("Storage failure produces a warning without disabling learning")
    blocked.close()

    # Feed a stored state leaving exactly one card unlearned.
    fixture=json.loads((ROOT/"data/words.json").read_text())
    entries={w["id"]:{"learned":True,"correct":1,"wrong":0,"skipped":0,"updatedAt":"2026-10-08T20:00:00.000Z"} for w in fixture["words"]}
    target=fixture["words"][0]
    entries.pop(target["id"])
    state={"schemaVersion":1,"datasetId":fixture["id"],"category":"all","entries":entries}
    finalctx=browser.new_context()
    last=mount(finalctx,{KEY:json.dumps(state)})
    expect(last.locator("#remaining-count")).to_have_text("1")
    expect(last.locator("#progress-percent")).to_have_text("99%")
    last.locator("#skip-button").click()
    last.locator("#next-button").click()
    assert word(last)["id"]==target["id"]
    correct(last)
    expect(last.locator("#next-label")).to_have_text("Zobacz podsumowanie")
    last.locator("#next-button").click()
    expect(last.locator("#done-title")).to_have_text("Wszystko opanowane.")
    expect(last.locator("#remaining-count")).to_have_text("0")
    expect(last.locator("#progress-percent")).to_have_text("100%")
    last.screenshot(path=str(OUT/"completion.png"),full_page=True, animations="disabled")
    report("The very last card repeats until correct; full-dataset completion works")
    finalctx.close()
    assert not errors,errors
    report("No uncaught JavaScript errors in the tested interface flows")
    browser.close()
(OUT/"ui-report.json").write_text(json.dumps({
  "mode":"isolated set_content; in-memory Storage; mocked download transport",
  "passed":reports,"count":len(reports),
  "not_tested":["real browser disk persistence","real download transport","real-origin service worker","physical iPhone","Cloudflare deployment"]
},ensure_ascii=False,indent=2),encoding="utf-8")
print("All isolated UI checks passed:",len(reports))
