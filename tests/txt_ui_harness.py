#!/usr/bin/env python3
"""Isolated TXT interface tests. Storage and downloads are simulated, not disk/IPhone tests."""
from __future__ import annotations
import json, os, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'slowko-demo.html').read_text(encoding='utf-8')
BASE=json.loads((ROOT/'data/words.json').read_text(encoding='utf-8'))
KEY='slowko.czlowiek-01.v1'
OUT=Path(os.environ.get('SLOWKO_TEST_OUT',tempfile.mkdtemp(prefix='slowko-txt-ui-')))
OUT.mkdir(parents=True,exist_ok=True)
reports=[]
errors=[]

def report(message):
    reports.append(message)
    print('PASS:',message,flush=True)

def mount(context,seed=None,blocked=False):
    page=context.new_page()
    page.on('pageerror',lambda error:(errors.append(str(error)),print('PAGEERROR',str(error),flush=True)))
    page.evaluate('''({seed,blocked}) => {
      const items={...seed};
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:key=>items[key]??null,
        setItem:(key,value)=>{if(blocked)throw new DOMException('Test quota','QuotaExceededError');items[key]=String(value);},
        removeItem:key=>{delete items[key];},clear:()=>{Object.keys(items).forEach(k=>delete items[k]);}
      }});
      HTMLAnchorElement.prototype.click=function(){window.__filename=this.download;};
      URL.createObjectURL=blob=>{window.__blob=blob;return 'blob:test';};
      Math.random=()=>0;
    }''',{'seed':seed or {},'blocked':blocked})
    page.set_content(HTML,wait_until='domcontentloaded')
    return page

def stored(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)

def current(page):
    return page.evaluate('''(key)=>{
      const raw=JSON.parse(localStorage.getItem(key));
      const data=raw?.customVocabulary?SlowkoTxt.merge(SLOWKO_DATA,SlowkoTxt.ensureParsed(raw.customVocabulary).rows).data:SLOWKO_DATA;
      const category=data.categories.find(c=>c.label===document.getElementById('word-category').textContent);
      return data.words.find(w=>(w.prompt||w.pl)===document.getElementById('polish-word').textContent&&w.category===category.id);
    }''',KEY)

def add(page,text):
    page.locator('#vocab-text').fill(text)
    page.locator('#preview-vocab-button').click()
    page.locator('#confirm-vocab-import').click()
    expect(page.locator('#vocab-result')).to_contain_text('Dodano')

def export_blob(page):
    return page.evaluate('()=>__blob.text()')

legacy={'schemaVersion':1,'datasetId':BASE['id'],'category':'all','entries':{
    BASE['words'][0]['id']:{'learned':True,'correct':1,'wrong':0,'skipped':0,'updatedAt':'2026-10-08T20:00:00.000Z'}
}}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    ctx=browser.new_context(viewport={'width':1365,'height':1100})
    page=mount(ctx,{KEY:json.dumps(legacy)})
    expect(page.locator('#learned-count')).to_have_text('1')
    page.locator('#add-vocab-button').click()
    page.locator('#vocab-text').fill('kot;cat;Moje testy\npies;dog;Moje testy\nkolor;colour | color;Kolory')
    page.locator('#preview-vocab-button').click()
    expect(page.locator('#vocab-preview-title')).to_contain_text('Nowe fiszki: 3')
    assert stored(page)==legacy
    page.locator('#confirm-vocab-import').click()
    assert stored(page)['entries']==legacy['entries']
    expect(page.locator('#vocab-summary')).to_contain_text('Razem: 369')
    report('Legacy 1.0 progress survives a previewed import of three new cards')

    page.locator('#vocab-text').fill('kot;cat;Different\nkot;CAT\nkolor;colour | color;Kolory')
    page.locator('#preview-vocab-button').click()
    expect(page.locator('#vocab-preview-title')).to_contain_text('Pomijane duplikaty: 3')
    expect(page.locator('#confirm-vocab-import')).to_be_disabled()
    report('Reimport skips duplicates without changing categories or progress')

    before=stored(page)
    page.locator('#vocab-file').set_input_files({'name':'invalid.txt','mimeType':'text/plain','buffer':b'valid;correct\ninvalid line'})
    expect(page.locator('#vocab-result')).to_contain_text('Wiersz 2')
    assert stored(page)==before
    expect(page.locator('#confirm-vocab-import')).to_be_disabled()
    page.locator('#vocab-file').set_input_files({'name':'utf16.txt','mimeType':'text/plain','buffer':'kot;cat'.encode('utf-16')})
    expect(page.locator('#vocab-result')).to_contain_text('UTF-8')
    assert stored(page)==before
    report('Malformed TXT and non-UTF-8 text are rejected atomically with line errors')

    page.locator('#vocab-file').set_input_files({'name':'nowe.txt','mimeType':'text/plain','buffer':'\ufeff# komentarz\r\njab\u0142ko;apple;Jedzenie\r\n'.encode('utf-8')})
    expect(page.locator('#vocab-preview-title')).to_contain_text('Nowe fiszki: 1')
    page.locator('#vocab-text').fill('jab\u0142ko;apple;Jedzenie\ngruba linia bez separatora')
    expect(page.locator('#confirm-vocab-import')).to_be_disabled()
    add(page,'jab\u0142ko;apple;Jedzenie')
    expect(page.locator('#vocab-summary')).to_contain_text('Razem: 370')
    report('File picker handles UTF-8 BOM/CRLF and text edits invalidate stale previews')

    raw=stored(page)
    page.close()
    page=mount(ctx,{KEY:json.dumps(raw)})
    expect(page.locator('#set-size')).to_contain_text('370 fiszek')
    expect(page.locator('#learned-count')).to_have_text('1')
    page.locator('#category').select_option(label='Kolory \u00b7 1')
    page.locator('#answer').fill('color')
    page.locator('#check-button').click()
    expect(page.locator('#feedback-title')).to_have_text('Brawo, poprawnie!')
    page.locator('#next-button').click()
    expect(page.locator('#done-card')).to_be_visible()
    report('Imported cards persist in a reconstructed session; alternative spelling is accepted')

    page.locator('#category').select_option(label='Moje testy \u00b7 2')
    first=current(page)
    page.locator('#answer').fill('not-correct')
    page.locator('#check-button').click()
    expect(page.locator('#solution')).to_have_text(first['en'])
    assert not stored(page)['entries'][first['id']]['learned']
    page.locator('#next-button').click()
    second=current(page)
    assert second['id']!=first['id']
    page.locator('#answer').fill(second['answers'][0]);page.locator('#check-button').click();page.locator('#next-button').click()
    assert current(page)['id']==first['id']
    page.locator('#answer').fill(first['answers'][0]);page.locator('#check-button').click();page.locator('#next-button').click()
    expect(page.locator('#done-card')).to_be_visible()
    report('Wrong imported answers return later; correct answers leave the pool')

    page.locator('#add-vocab-button').click()
    page.locator('.vocab-help summary').click()
    page.locator('#export-all-txt').click()
    alltxt=export_blob(page)
    assert 'jab\u0142ko;apple;Jedzenie' in alltxt
    assert page.evaluate('(text)=>SlowkoTxt.ensureParsed(text).rows.length',alltxt)==370
    page.locator('#export-own-txt').click()
    owntxt=export_blob(page)
    assert page.evaluate('(text)=>SlowkoTxt.ensureParsed(text).rows.length',owntxt)==4
    assert page.evaluate('__filename')=='slowka-wlasne.txt'
    report('Export creates parseable TXT for the full collection or just the four personal cards')

    page.locator('#close-vocab').click();page.locator('#settings-button').click();page.locator('#export-button').click()
    snapshot=json.loads(export_blob(page))
    assert snapshot['state']['entries']==stored(page)['entries']
    assert 'cat' in snapshot['vocabularyText']
    other=mount(ctx)
    other.locator('#settings-button').click()
    other.locator('#import-file').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':json.dumps(snapshot).encode()})
    expect(other.locator('#confirm-dialog')).to_be_visible();other.locator('#confirm-ok').click()
    expect(other.locator('#set-size')).to_contain_text('370 fiszek')
    assert stored(other)['entries']==snapshot['state']['entries']
    other.locator('#close-settings').click()
    report('New JSON backup restores vocabulary and old/new word progress on a clean session')

    other.locator('#add-vocab-button').click();other.locator('.vocab-help summary').click()
    before=stored(other)
    other.locator('#clear-own-txt').click();other.locator('#confirm-cancel').click()
    assert stored(other)==before
    other.locator('#clear-own-txt').click();other.locator('#confirm-ok').click()
    expect(other.locator('#vocab-summary')).to_contain_text('Razem: 366')
    assert stored(other)['entries']==legacy['entries']
    report('Removing a private import needs confirmation and retains original base progress')

    other.locator('#close-vocab').click()
    other.evaluate('''({key,snapshot})=>{
      localStorage.setItem(key,JSON.stringify(snapshot));
      window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(snapshot)}));
    }''',{'key':KEY,'snapshot':before})
    expect(other.locator('#set-size')).to_contain_text('370 fiszek')
    report('A storage event refreshes both vocabulary and results from another session')

    other.locator('#add-vocab-button').click()
    xss='<img src=x onerror=alert(1)>;safe;Security'
    other.locator('#vocab-text').fill(xss);other.locator('#preview-vocab-button').click()
    expect(other.locator('#vocab-preview-list img')).to_have_count(0)
    expect(other.locator('#vocab-preview-list')).to_contain_text('<img')
    other.locator('#confirm-vocab-import').click()
    other.locator('#close-vocab').click();other.locator('#nav-library').click();other.locator('#category').select_option('all')
    other.locator('#word-search').fill('onerror')
    expect(other.locator('#word-list img')).to_have_count(0)
    expect(other.locator('.word-row')).to_have_count(1)
    report('HTML-like imported words remain literal text in preview and dictionary')

    mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    phone=mount(mobile)
    phone.locator('#add-vocab-button').click()
    sample='jab\u0142ko;apple;Jedzenie\npodr\u00f3\u017c;journey | trip;Podr\u00f3\u017ce\nuczy\u0107 si\u0119;learn'
    phone.locator('#vocab-text').fill(sample);phone.locator('#preview-vocab-button').click()
    for width in [320,360,375,390,430,768]:
        phone.set_viewport_size({'width':width,'height':844})
        sizes=phone.evaluate('''()=>({page:document.documentElement.scrollWidth,width:innerWidth,
          dialog:document.getElementById('vocab-dialog').clientWidth,scroll:document.getElementById('vocab-dialog').scrollWidth})''')
        assert sizes['page']<=sizes['width'] and sizes['scroll']<=sizes['dialog'],sizes
    phone.set_viewport_size({'width':390,'height':844})
    phone.locator('#vocab-dialog').evaluate('(el)=>el.scrollTop=0')
    phone.screenshot(path=str(OUT/'mobile-txt.png'),animations='disabled')
    phone.locator('#vocab-preview').scroll_into_view_if_needed()
    phone.screenshot(path=str(OUT/'mobile-txt-preview.png'),animations='disabled')
    report('TXT dialog and preview have no horizontal overflow at 320-768 pixels')

    desk=mount(ctx);desk.locator('#add-vocab-button').click();desk.locator('#vocab-text').fill(sample);desk.locator('#preview-vocab-button').click()
    desk.screenshot(path=str(OUT/'desktop-txt.png'),animations='disabled')
    blocked=mount(ctx,blocked=True);blocked.locator('#add-vocab-button').click();add(blocked,'kot;cat')
    expect(blocked.locator('#vocab-result')).to_contain_text('UWAGA')
    expect(blocked.locator('#storage-notice')).to_be_visible()
    blocked.locator('#close-vocab').click();blocked.locator('#category').select_option(label='W\u0142asne s\u0142\u00f3wka \u00b7 1')
    blocked.locator('#answer').fill('cat');blocked.locator('#check-button').click()
    expect(blocked.locator('#feedback-title')).to_have_text('Brawo, poprawnie!')
    report('Blocked storage shows an explicit backup warning while imported-word practice still works')

    assert not errors,errors
    report('No uncaught JavaScript errors in the new TXT workflows')
    (OUT/'txt-ui-results.json').write_text(json.dumps({'passed':len(reports),'reports':reports,'errors':errors},indent=2))
    browser.close()
print('All isolated TXT UI checks passed:',len(reports))
