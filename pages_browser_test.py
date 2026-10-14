#!/usr/bin/env python3
"""Page filters, persistence, imports, backups, and offline navigation in Chromium.
Default: isolated HTML and in-memory Storage (no native persistence or network claim).
Set SLOWKO_HTTP=1 on an unrestricted machine for localhost, real Storage and
service worker checks. /index.html then redirects like Cloudflare Pages.
Requires playwright and Chromium. No account or external network access required.
"""
from __future__ import annotations
import json
import os
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('SLOWKO_TEST_OUT', tempfile.mkdtemp(prefix='slowko-pages-')))
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'slowko.czlowiek-01.v1'
HTTP = os.environ.get('SLOWKO_HTTP') == '1'
HTML = (ROOT/'slowko-demo.html').read_text(encoding='utf-8')
REPORTS, ERRORS = [], []

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/index.html':
            self.send_response(301)
            self.send_header('Location', '/')
            self.end_headers()
            return
        super().do_GET()
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT / 'public')))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{server.server_port}/'

def report(message):
    REPORTS.append(message)
    print('PASS:', message, flush=True)

def mount(browser, *, mobile=True, width=390, height=664, session=None, workers='block'):
    context=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,
        has_touch=mobile,device_scale_factor=2 if mobile else 1,service_workers=workers,accept_downloads=True)
    context.add_init_script('Math.random=()=>0;')
    if session is not None:
        script='if (!localStorage.getItem('+json.dumps(KEY)+')) localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(session))+');'
        context.add_init_script(script)
    page=context.new_page()
    page.on('pageerror',lambda e: ERRORS.append(str(e)))
    if HTTP:
        page.goto(URL,wait_until='networkidle')
    else:
        page.evaluate('''initial => {
          const items={...initial};
          Object.defineProperty(window,'localStorage',{configurable:true,value:{
            getItem:k=>items[k]??null,setItem:(k,v)=>{items[k]=String(v)},removeItem:k=>{delete items[k]}
          }});
          Math.random=()=>0;
        }''', {KEY:json.dumps(session)} if session else {})
        page.set_content(HTML,wait_until='domcontentloaded')
        page.wait_for_timeout(60)
    expect(page.locator('#page option')).to_have_count(4 if not session or not session.get('customVocabulary') else 5)
    return context,page

def reload_app(page):
    if HTTP:
        page.reload(wait_until='networkidle')
    else:
        # DOM reload over the same fake Storage. Not a native-browser persistence test.
        page.set_content(HTML,wait_until='domcontentloaded')
        page.wait_for_timeout(60)


def current(page):
    return page.evaluate('''() => SLOWKO_DATA.words.find(w =>
      (w.prompt||w.pl)===document.getElementById('polish-word').textContent &&
      (w.cue||'')===document.getElementById('word-cue').textContent &&
      SLOWKO_DATA.categories.find(c=>c.id===w.category).label===document.getElementById('word-category').textContent)''')

def stored(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)

def layout(page, button):
    d=page.evaluate('''id=>{
      const b=document.getElementById(id),r=b.getBoundingClientRect();
      const p=document.getElementById('page').getBoundingClientRect();
      const c=document.getElementById('category').getBoundingClientRect();
      const t=document.getElementById('add-vocab-button').getBoundingClientRect();
      return {width:innerWidth,height:innerHeight,doc:document.documentElement.scrollHeight,
       docWidth:document.documentElement.scrollWidth,scroll:scrollY,
       bottom:r.bottom,bh:r.height,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),
       filters:[p,c,t].map(r=>({x:r.x,right:r.right,y:r.y,bottom:r.bottom,h:r.height})),
       gap:p.right<=c.left && c.right<=t.left};
    }''',button)
    assert d['doc'] <= d['height']+2 and d['docWidth']<=d['width']+1,d
    assert d['bottom']<=d['height'] and d['bh']>=44 and d['hit'],d
    assert d['gap'] and all(f['h']>=44 and f['bottom']<=d['height'] for f in d['filters']),d
    return d

try:
 with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,
      args=['--no-sandbox','--disable-dev-shm-usage'])
    context,page=mount(browser)
    expect(page.locator('#remaining-count')).to_have_text('461')
    expect(page.locator('#category option')).to_have_count(21)
    for pid,total,options in [('photo-1',215,12),('photo-2',151,8),('photo-3',95,4)]:
        page.locator('#page').select_option(pid)
        expect(page.locator('#category')).to_have_value('all')
        expect(page.locator('#remaining-count')).to_have_text(str(total))
        expected=page.evaluate('(pid)=>new Set(SLOWKO_DATA.words.filter(w=>w.page===pid).map(w=>w.category)).size+1',pid)
        expect(page.locator('#category option')).to_have_count(expected)
        for _ in range(8):
            assert current(page)['page']==pid
            page.locator('#skip-button').click()
            page.locator('#next-button').click()
    report('Each page contains only its own cards; category options match that page')
    page.locator('#page').select_option('photo-1')
    page.locator('#category').select_option('feelings')
    count1=page.evaluate("SlowkoCore.scopedWords(SLOWKO_DATA,'feelings','photo-1').length")
    expect(page.locator('#remaining-count')).to_have_text(str(count1))
    page.locator('#page').select_option('photo-2')
    expect(page.locator('#category')).to_have_value('feelings')
    assert current(page)['category']=='feelings' and current(page)['page']=='photo-2'
    page.locator('#page').select_option('photo-3')
    expect(page.locator('#category')).to_have_value('all')
    expect(page.locator('#remaining-count')).to_have_text('95')
    report('Page and category intersect; an unavailable category falls back to all on the new page')
    homeword=current(page)
    page.locator('#answer').fill(homeword['answers'][0])
    page.locator('#check-button').click()
    expect(page.locator('#learned-count')).to_have_text('1')
    expect(page.locator('#remaining-count')).to_have_text('94')
    page.locator('#page').select_option('photo-1')
    expect(page.locator('#learned-count')).to_have_text('0')
    page.locator('#page').select_option('all')
    expect(page.locator('#learned-count')).to_have_text('1')
    page.locator('#page').select_option('photo-3')
    assert current(page)['id']!=homeword['id']
    reload_app(page)
    expect(page.locator('#page')).to_have_value('photo-3')
    expect(page.locator('#learned-count')).to_have_text('1')
    assert stored(page)['entries'][homeword['id']]['learned']
    report('Page switching and reload preserve the filter, counters, and exclusion of learned cards')
    page.locator('#nav-library').click()
    assert page.locator('.word-row').count()==95
    page.locator('#status-filter').select_option('learned')
    assert page.locator('.word-row').count()==1
    page.locator('#status-filter').select_option('all')
    page.locator('#page').select_option('photo-2')
    assert page.locator('.word-row').count()==151
    page.locator('#nav-study').click()
    report('Dictionary and learned/pending filters respect the selected page')
    context.close()

    # Import a new page and a legacy three-column row; reload and JSON roundtrip.
    context,page=mount(browser)
    page.locator('#add-vocab-button').click()
    page.locator('#vocab-text').fill('kot testowy;test cat;Test;Strona 4\npies testowy;test dog;Test')
    page.locator('#preview-vocab-button').click()
    page.locator('#confirm-vocab-import').click()
    expect(page.locator('#vocab-result')).to_contain_text('Dodano 2')
    page.locator('#close-vocab').click()
    pid=page.locator('#page option').filter(has_text='Strona 4').get_attribute('value')
    page.locator('#page').select_option(pid)
    expect(page.locator('#polish-word')).to_have_text('kot testowy')
    expect(page.locator('#remaining-count')).to_have_text('1')
    page.locator('#answer').fill('test cat')
    page.locator('#check-button').click()
    page.locator('#next-button').click()
    expect(page.locator('#done-card')).to_be_visible()
    expect(page.locator('#done-title')).to_have_text('Ten zakres ju\u017c umiesz.')
    report('TXT fourth column creates a usable page, while a legacy row receives an unassigned page')
    reload_app(page)
    expect(page.locator('#page')).to_have_value(pid)
    expect(page.locator('#done-card')).to_be_visible()
    page.locator('#settings-button').click()
    with page.expect_download() as download_info:
        page.locator('#export-button').click()
    backup_path=OUT/'test-backup.json'
    download_info.value.save_as(backup_path)
    snapshot=json.loads(backup_path.read_text())
    assert snapshot['state']['page']==pid
    assert ';Strona 4' in snapshot['vocabularyText']
    page.locator('#close-settings').click()
    page.locator('#done-all').click()
    expect(page.locator('#page')).to_have_value('all')
    expect(page.locator('#category')).to_have_value('all')
    page.locator('#settings-button').click()
    page.locator('#import-file').set_input_files(backup_path)
    expect(page.locator('#confirm-dialog')).to_be_visible()
    page.locator('#confirm-ok').click()
    page.locator('#close-settings').click()
    expect(page.locator('#page')).to_have_value(pid)
    expect(page.locator('#done-card')).to_be_visible()
    report('Custom pages survive reload and JSON export/import; completion can return to all pages')
    page.locator('#done-reset').click()
    expect(page.locator('#confirm-description')).to_contain_text('Strona 4')
    page.locator('#confirm-ok').click()
    expect(page.locator('#remaining-count')).to_have_text('1')
    page.locator('#page').select_option('unassigned')
    expect(page.locator('#polish-word')).to_have_text('pies testowy')
    report('Reset targets the chosen page; unassigned words remain directly selectable')
    page.locator('#page').select_option('all')
    page.locator('#add-vocab-button').click()
    page.locator('.vocab-help').evaluate('(el)=>el.open=true')
    page.locator('#clear-own-txt').click()
    page.locator('#confirm-ok').click()
    expect(page.locator('#page option')).to_have_count(4)
    page.locator('#close-vocab').click()
    report('Removing private imports removes their page options without changing the photo base')
    context.close()

    # Simulate v1.2 data without a page field, including private legacy TXT.
    home=json.loads((ROOT/'tests/fixtures/home-legacy.json').read_text())
    word=home['words'][0]
    legacy={'schemaVersion':1,'datasetId':'czlowiek-01','category':'all','entries':{
      word['id']:{'learned':True,'correct':1,'wrong':2,'skipped':0,'updatedAt':None}},
      'customVocabulary':'kot testowy;test cat;Test'}
    context,page=mount(browser,session=legacy)
    page.locator('#page').select_option('photo-3')
    expect(page.locator('#learned-count')).to_have_text('1')
    expect(page.locator('#remaining-count')).to_have_text('94')
    assert stored(page)['entries'][word['id']]['wrong']==2
    page.locator('#page').select_option('unassigned')
    expect(page.locator('#polish-word')).to_have_text('kot testowy')
    expect(page.locator('#storage-notice')).to_be_hidden()
    report(('Real' if HTTP else 'Simulated')+' localStorage migration keeps home-only v1.2 results and old private TXT')
    context.close()

    for width,height in [(320,568),(360,640),(390,664),(412,710)]:
        context,page=mount(browser,width=width,height=height)
        for pid in ['photo-1','photo-2','photo-3']:
            page.locator('#page').select_option(pid)
            layout(page,'check-button')
            if width==390 and pid=='photo-3':
                page.wait_for_timeout(220)
                page.screenshot(path=str(OUT/'telefon-strona-3.png'),full_page=True)
            page.locator('#answer').fill('blad')
            page.locator('#check-button').click()
            layout(page,'next-button')
            if width==390 and pid=='photo-3':
                page.wait_for_timeout(220)
                page.screenshot(path=str(OUT/'telefon-strona-3-wynik.png'),full_page=True)
        context.close()
        report(f'{width}x{height}: both selectors, TXT and Next fit on screen for all three pages')

    context,page=mount(browser,mobile=False,width=1365,height=1000)
    page.locator('#page').select_option('photo-3')
    page.locator('#category').select_option(label='Okolica domu \u00b7 28')
    expect(page.locator('#remaining-count')).to_have_text('28')
    page.screenshot(path=str(OUT/'komputer-strony.png'),full_page=True)
    report('Desktop sidebar exposes full page/category controls and filtered counts')
    context.close()

    if HTTP:
        context,page=mount(browser,workers='allow')
        page.wait_for_function('navigator.serviceWorker.controller !== null')
        for _ in range(2):
            reload_app(page)
            expect(page.locator('#page option')).to_have_count(4)
        page.goto(URL+'index.html',wait_until='networkidle')
        expect(page.locator('#page option')).to_have_count(4)
        context.set_offline(True)
        page.goto(URL,wait_until='domcontentloaded')
        expect(page.locator('#page option')).to_have_count(4)
        page.locator('#page').select_option('photo-3')
        expect(page.locator('#remaining-count')).to_have_text('95')
        page.reload(wait_until='domcontentloaded')
        expect(page.locator('#page')).to_have_value('photo-3')
        context.set_offline(False)
        report('Actual service worker: repeat visits, index.html redirect, and offline reload keep page filters usable')
        context.close()
    else:
        print('SKIP: Native service worker/offline tests require SLOWKO_HTTP=1 and a browser allowed to visit localhost.')
    assert not ERRORS,ERRORS
    report('No uncaught JavaScript errors in page-filter scenarios')
    browser.close()
finally:
 server.shutdown()
 server.server_close()
(OUT/'pages-test-report.json').write_text(json.dumps({'mode':'http' if HTTP else 'isolated','scenarios':len(REPORTS),'passed':REPORTS,'errors':ERRORS},indent=2))
print('Total page-filter scenarios:',len(REPORTS))
