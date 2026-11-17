"""Capture corresponding screens from the previous reference checkout."""
import json
import os
from pathlib import Path
import subprocess
from playwright.sync_api import sync_playwright, expect
out=Path(os.environ['SCREENSHOTS'])
out.mkdir(parents=True,exist_ok=True)
server=subprocess.Popen(['node','test/browser/fixture.mjs'],stdout=subprocess.PIPE,text=True)
try:
    base=json.loads(server.stdout.readline())['base']
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM'),args=['--no-sandbox'])
        for width in [390,768,1440]:
            page=browser.new_page(viewport={'width':width,'height':900})
            def shot(name):page.screenshot(path=str(out/f'before-{name}-{width}.png'),animations='disabled')
            page.goto(base);expect(page.locator('#signin')).to_be_visible();shot('login')
            page.locator('[name=userId]').select_option('manager');page.locator('#signin button').click()
            expect(page.locator('#signin')).to_have_count(0);shot('home')
            page.goto(base+'/?before=list#review');expect(page.locator('button[data-record]').first).to_be_visible();shot('review-list')
            rows=page.request.get(base+'/api/platform/view').json()['rows']['review']
            rid=next(r['id'] for r in rows if r['status']=='Goal setting')
            page.goto(base+'/?before=detail#review/'+rid);expect(page.locator('[data-command="review.goal"]')).to_be_visible();shot('review-detail')
            page.locator('[data-command="review.goal"]').click();expect(page.locator('dialog')).to_be_visible();shot('kpi-dialog')
            page.close()
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=15)
