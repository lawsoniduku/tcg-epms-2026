"""Capture the seven acceptance screens and check layout and action access in Chromium."""
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright, expect

output = Path(os.getenv('SCREENSHOTS','artifacts/screenshots'))
output.mkdir(parents=True,exist_ok=True)
server = subprocess.Popen(['node','test/browser/fixture.mjs'],stdout=subprocess.PIPE,text=True)
try:
    base=json.loads(server.stdout.readline())['base']
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM'),args=['--no-sandbox'])
        for width in [390,768,1440]:
            page=browser.new_page(viewport={'width':width,'height':900},device_scale_factor=1)
            def capture(name,action):
                expect(action.first).to_be_visible()
                action.first.scroll_into_view_if_needed()
                box=action.first.bounding_box()
                assert box and box['x']>=-1 and box['x']+box['width']<=width+1,(name,width,box)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),(name,width)
                page.screenshot(path=str(output/f'{name}-{width}.png'),animations='disabled',full_page=name not in ['kpi-dialog','kpi-preview'])
            page.goto(base)
            capture('login',page.locator('#signin button'))
            page.locator('[name=userId]').select_option('manager')
            page.locator('#signin button').click()
            expect(page.locator('#signin')).to_have_count(0)
            capture('home',page.get_by_role('link',name='My tasks',exact=True) if width>700 else page.get_by_role('button',name='Open navigation'))
            page.goto(base+'/?screen=list#review')
            capture('review-list',page.locator('button[data-record]'))
            rows=page.request.get(base+'/api/platform/view').json()['rows']['review']
            rid=next(r['id'] for r in rows if r['status']=='Goal setting')
            page.goto(base+'/?screen=detail#review/'+rid)
            capture('review-detail',page.locator('[data-command="review.goal"]'))
            page.locator('[data-command="review.goal"]').click()
            capture('kpi-dialog',page.locator('#operation button[type=submit]'))
            page.locator('[data-cancel]').click()
            page.locator('[data-command="review.importGoals"]').click()
            template=page.request.get(base+'/api/platform/kpi-template?format=csv&id='+rid)
            assert template.ok
            page.locator('#upload-sheet').set_input_files({'name':'example.csv','mimeType':'text/csv','buffer':template.body()})
            page.locator('#operation button[type=submit]').click()
            expect(page.get_by_role('heading',name='Import preview')).to_be_visible()
            capture('kpi-preview',page.locator('#operation button[type=submit]'))
            page.close()
            page=browser.new_page(viewport={'width':width,'height':900})
            page.goto(base)
            page.locator('[name=userId]').select_option('pm')
            page.locator('#signin button').click()
            expect(page.locator('#signin')).to_have_count(0)
            page.goto(base+'/?screen=setup#setup')
            capture('setup',page.locator('[data-setup-link]'))
            page.close()
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=15)
