#!/usr/bin/env python3
"""Mobile layout regression in real headless Chromium with an isolated document.

Uses set_content and in-memory Storage; no live website, network, native keyboard
or physical-device validation is claimed. Requires the Python Playwright package
and Chromium (CHROMIUM_PATH). Run tools/build.cjs first, then this file.
"""
from __future__ import annotations
import json
import os
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'slowko-demo.html').read_text(encoding='utf-8')
OUT = Path(os.environ.get('SLOWKO_TEST_OUT', tempfile.mkdtemp(prefix='slowko-mobile-')))
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'slowko.czlowiek-01.v1'
reports = []
errors = []

def report(text):
    reports.append(text)
    print('PASS:', text, flush=True)

def mount(context):
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.evaluate('''() => {
      const items={};
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>items[k]??null,setItem:(k,v)=>{items[k]=String(v)},removeItem:k=>{delete items[k]}
      }});
      Math.random=()=>0;
    }''')
    page.set_content(HTML, wait_until='domcontentloaded')
    page.wait_for_timeout(60)
    return page

def current(page):
    return page.evaluate('''() => SLOWKO_DATA.words.find(w =>
      (w.prompt||w.pl)===document.getElementById('polish-word').textContent &&
      (w.cue||'')===document.getElementById('word-cue').textContent &&
      SLOWKO_DATA.categories.find(c=>c.id===w.category).label===document.getElementById('word-category').textContent)''')

def metrics(page, button, allow_panel_scroll=False):
    result = page.evaluate('''id=>{
      const el=document.getElementById(id), r=el.getBoundingClientRect();
      const panel=document.querySelector('.quiz-content');
      const node=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {height:innerHeight,doc:document.documentElement.scrollHeight,
        width:innerWidth,docWidth:document.documentElement.scrollWidth,
        x:r.x,y:r.y,right:r.right,bottom:r.bottom,buttonHeight:r.height,
        panelHeight:panel.clientHeight,panelScroll:panel.scrollHeight,
        hit:!!node && (node===el || el.contains(node)), scrollY:scrollY};
    }''', button)
    assert result['doc'] <= result['height'] + 2, result
    assert result['docWidth'] <= result['width'] + 1, result
    assert result['y'] >= 0 and result['bottom'] <= result['height'] + 1, result
    assert result['buttonHeight'] >= 44, result
    assert result['hit'], result
    assert result['scrollY'] == 0, result
    if not allow_panel_scroll:
        assert result['panelScroll'] <= result['panelHeight'] + 2, result
    return result

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),
                               headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    sizes = [(320,568),(360,540),(360,640),(375,667),(390,664),(412,710),(430,780)]
    for width,height in sizes:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True,device_scale_factor=1)
        page=mount(context)
        first=current(page)
        ready=metrics(page,'check-button')
        page.locator('#check-button').click()
        expect(page.locator('#input-error')).to_be_visible()
        metrics(page,'check-button')
        page.locator('#answer').fill('distinguishing feautures')
        page.locator('#check-button').click()
        expect(page.locator('#solution')).to_have_text(first['en'])
        wrong=metrics(page,'next-button')
        assert abs(ready['y']-wrong['y'])<1.1
        assert page.locator('.answer-fields').is_hidden()
        assert page.evaluate("document.activeElement.id") != 'answer'
        page.locator('#next-button').click()
        assert page.evaluate("document.activeElement.id") != 'answer'
        next_word=current(page)
        page.locator('#answer').fill(next_word['answers'][0])
        page.locator('#check-button').click()
        expect(page.locator('#feedback-title')).to_have_text('Brawo, poprawnie!')
        metrics(page,'next-button')
        page.locator('#next-button').click()
        page.locator('#skip-button').click()
        metrics(page,'next-button')
        report(f'{width}x{height}: question, empty input, wrong, correct and skipped fit; actions stay put')
        context.close()

    # Stress the actual layout with every photographed prompt, including hints.
    # This is a layout test, not a substitute for gameplay tests above.
    for width,height in [(320,568),(360,640),(412,710)]:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=True,has_touch=True)
        page=mount(context)
        result=page.evaluate('''() => {
          const $=id=>document.getElementById(id);
          const panel=document.querySelector('.quiz-content');
          const failures=[];
          $('quiz-card').classList.add('is-answered');
          $('feedback').hidden=false;
          $('feedback').classList.add('is-wrong');
          $('skip-button').hidden=true;$('check-button').hidden=true;$('next-button').hidden=false;
          $('feedback-details').open=false;
          $('feedback-title').textContent='Jeszcze troch\u0119 praktyki.';
          $('feedback-symbol').textContent='\u21ba';
          $('solution-label').textContent='ZAPAMI\u0118TAJ TEN ZAPIS';
          $('typed-answer').hidden=false;
          $('feedback-brief').textContent='To s\u0142\u00f3wko wr\u00f3ci do nauki.';
          for(const w of SLOWKO_DATA.words){
            const prompt=w.prompt||w.pl;
            $('word-category').textContent=SLOWKO_DATA.categories.find(c=>c.id===w.category).label;
            $('polish-word').textContent=prompt;
            $('polish-word').classList.toggle('long',prompt.length>44);
            $('word-cue').textContent=w.cue||'';$('word-cue').hidden=!w.cue;
            $('solution').textContent=w.en;
            $('typed-answer').textContent='Twoja odpowied\u017a: '+w.en.slice(0,-1)+'x';
            const diff=panel.scrollHeight-panel.clientHeight;
            if(diff>2)failures.push({id:w.id,prompt,en:w.en,overflow:diff});
          }
          return {count:SLOWKO_DATA.words.length,failures};
        }''')
        assert not result['failures'], (width,height,result)
        metrics(page,'next-button')
        report(f'{width}x{height}: all {result["count"]} base prompts fit with a wrong-answer panel')
        context.close()

    context=browser.new_context(viewport={'width':412,'height':710},is_mobile=True,has_touch=True,device_scale_factor=2)
    page=mount(context)
    page.screenshot(path=str(OUT/'telefon-pytanie.png'))
    page.locator('#answer').fill('distinguishing feautures')
    page.locator('#check-button').click()
    page.screenshot(path=str(OUT/'telefon-bledna-odpowiedz.png'))
    page.locator('#feedback-details > summary').click()
    expect(page.locator('#feedback-description')).to_be_visible()
    metrics(page,'next-button',True)
    page.locator('#next-button').click()
    assert not page.locator('#feedback-details').evaluate('(el)=>el.open')
    report('More-answer details expand on demand; Next remains reachable and details reset')

    # Simulated keyboard viewport: Chromium headless has no native phone keyboard.
    page.locator('#answer').focus()
    page.set_viewport_size({'width':412,'height':320})
    page.wait_for_timeout(120)
    expect(page.locator('.app-header')).to_be_hidden()
    expect(page.locator('.scope-card')).to_be_hidden()
    metrics(page,'check-button')
    page.screenshot(path=str(OUT/'telefon-mala-wysokosc.png'))
    page.locator('#answer').fill('wrong')
    page.locator('#check-button').click()
    metrics(page,'next-button',True)
    page.set_viewport_size({'width':412,'height':710})
    page.wait_for_timeout(100)
    expect(page.locator('.app-header')).to_be_visible()
    expect(page.locator('.scope-card')).to_be_visible()
    metrics(page,'next-button')
    report('Simulated 320px keyboard viewport hides secondary controls, then restores them')

    # VisualViewport-only shrinking (Safari-like shape, no native Safari claim).
    page.locator('#next-button').click()
    page.locator('#answer').focus()
    page.evaluate('''() => {
      Object.defineProperty(visualViewport,'height',{configurable:true,value:360});
      visualViewport.dispatchEvent(new Event('resize'));
    }''')
    page.wait_for_timeout(100)
    bounds=page.locator('#check-button').bounding_box()
    assert bounds['y']+bounds['height'] <= 360
    expect(page.locator('.app-header')).to_be_hidden()
    page.evaluate("delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize'))")
    page.locator('#answer').blur()
    page.wait_for_timeout(100)
    expect(page.locator('.app-header')).to_be_visible()
    report('VisualViewport resize alone adjusts the visible exercise height')

    page.locator('#add-vocab-button').click()
    long_pl='Dodatkowa bardzo dluga wskazowka do sprawdzenia ukladu na malym ekranie. '*3
    long_en='a very long imported expression with several additional explanatory words '*2
    page.locator('#vocab-text').fill(long_pl+';'+long_en+';Test mobilny')
    page.locator('#preview-vocab-button').click()
    page.locator('#confirm-vocab-import').click()
    expect(page.locator('#vocab-result')).to_contain_text('Dodano')
    page.locator('#close-vocab').click()
    option=page.locator('#category option').filter(has_text='Test mobilny').get_attribute('value')
    page.locator('#category').select_option(option)
    metrics(page,'check-button',True)
    page.locator('#skip-button').click()
    metrics(page,'next-button',True)
    assert page.evaluate("document.querySelector('.quiz-content').scrollHeight > document.querySelector('.quiz-content').clientHeight")
    page.locator('#feedback-details > summary').click()
    metrics(page,'next-button',True)
    report('Unusually long imported text scrolls only inside the card; Next never leaves the viewport')

    page.locator('#nav-library').click()
    expect(page.locator('#library-view')).to_be_visible()
    page.locator('#category').select_option('all')
    assert page.locator('.word-row').count()==367
    page.evaluate('window.scrollTo(0,500)')
    page.locator('#nav-study').click()
    page.wait_for_timeout(70)
    metrics(page,'check-button')
    page.locator('#settings-button').click()
    expect(page.locator('#settings-dialog')).to_be_visible()
    expect(page.locator('.version-label')).to_contain_text('1.2')
    page.locator('#close-settings').click()
    metrics(page,'check-button')
    report('Dictionary, category changes, TXT import, help and return to practice remain functional')

    # Rotation: compact landscape while retaining button access.
    page.set_viewport_size({'width':844,'height':390})
    page.wait_for_timeout(100)
    metrics(page,'check-button')
    page.locator('#skip-button').click()
    metrics(page,'next-button')
    page.set_viewport_size({'width':390,'height':664})
    page.wait_for_timeout(100)
    metrics(page,'next-button')
    report('Landscape 844x390 and rotation back to portrait keep actions visible')
    context.close()

    context=browser.new_context(viewport={'width':1365,'height':950})
    page=mount(context)
    page.locator('#skip-button').click()
    expect(page.locator('.answer-fields')).to_be_visible()
    expect(page.locator('#feedback-description')).to_be_visible()
    assert page.locator('#feedback-details').evaluate('(el)=>el.open')
    page.screenshot(path=str(OUT/'komputer.png'),full_page=True)
    report('Desktop retains its two-column layout, answer field and full feedback')
    context.close()
    assert not errors, errors
    report('No uncaught JavaScript errors in the mobile-layout scenarios')
    browser.close()

(OUT/'mobile-layout-report.json').write_text(json.dumps({'passed':reports,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print('Total mobile layout scenarios:',len(reports))
