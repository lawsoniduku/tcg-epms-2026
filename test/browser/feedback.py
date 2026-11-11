"""Run from the repository root with Python Playwright, Chromium and Node 24."""
import json
import os
import shutil
import subprocess
from playwright.sync_api import sync_playwright, expect

server = subprocess.Popen(['node', 'test/browser/fixture.mjs'], stdout=subprocess.PIPE, text=True)
try:
    fixture = json.loads(server.stdout.readline())
    base = fixture['base']
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=os.getenv('CHROMIUM'), args=['--no-sandbox'])
        pages = {}
        def page_for(user):
            if user not in pages:
                page = browser.new_page()
                page.set_default_timeout(7000)
                page.goto(base)
                page.locator('[name=userId]').select_option(user)
                page.locator('#signin button').click()
                expect(page.locator('#signin')).to_have_count(0)
                pages[user] = page
            return pages[user]
        def act(user, kind, rid, verb, values=None):
            page = page_for(user)
            page.goto(f'{base}/?step={verb}#{kind}/{rid}')
            page.locator(f'[data-command="{kind}.{verb}"]').click()
            form = page.locator('#operation')
            for key,value in (values or {}).items():
                field = form.locator(f'[name="{key}"]')
                if field.evaluate('(e)=>e.tagName')=='SELECT':
                    field.select_option(value=str(value))
                else:
                    field.fill(str(value))
            with page.expect_response(lambda res: res.url.endswith('/api/platform/command')) as submitted:
                form.locator('button[type=submit]').click()
            assert submitted.value.ok, (user,verb,submitted.value.text())
            expect(page.locator('dialog')).not_to_be_visible()
        for case in fixture['cases']:
            rid = case['id']
            raters = [('manager','Manager'),('observer1','Peer'),('observer2','Peer'),('observer3','Peer'),('observer4','Stakeholder')]
            if case['isLead']:
                raters += [('sales','Direct report'),('er','Direct report'),('talent','Direct report')]
            for user,category in raters:
                act('employee','review',rid,'nominate',{'rater':user,'category':category,'exposure':'Worked together on a shared deliverable'})
                # Look up the new nomination in the manager's scoped assignment list.
                rows = page_for('manager').request.get(base+'/api/platform/view').json()['rows']['response']
                assignment = next(r['id'] for r in rows if r['status']=='Nomination' and str(case['year']) in r['title'])
                act('manager','response',assignment,'endorse',{'decision':'Endorse','reason':'Working relationship verified'})
                act('pm','response',assignment,'invite',{'validation':'Exposure and conflicts reviewed'})
                act(user,'response',assignment,'start')
                answers = dict.fromkeys(['improvement','execution','customerFocus','integrity','teamwork'],4)
                if case['isLead']:
                    answers['leadership']=4
                act(user,'response',assignment,'submit',{**answers,'example':'Private example from observer'})
                act('pm','response',assignment,'moderate',{'decision':'Valid','reason':'Relevant working evidence'})
            assessment={'summary':'Verified quarterly results'}
            for goal in case['goals']:
                for key,value in [('actual',110),('evidence','Verified period register'),('stretch','No'),('rationale','Exceeded agreed target')]:
                    assessment[key+'_'+goal]=value
            act('manager','review',rid,'assess',assessment)
            act('pm','review',rid,'panel',dict(chair='hod',members='Function head',mandate='Synthetic mandate',conflicts='Checked'))
            act('hod','review',rid,'calibrate',dict(score=4,reason='Evidence supports the score',evidence='Register',members='Function head',consequential='No'))
            act('pm','review',rid,'feedbackThemes',{'Peer':'Colleagues observed effective collaboration','check':'Reviewed and safe to release'})
            act('pm','review',rid,'lock')
            act('pm','review',rid,'release')
            employee = page_for('employee')
            employee.goto(f'{base}/?released={rid}#review/{rid}')
            expect(employee.get_by_text('Colleagues observed effective collaboration',exact=True)).to_have_count(1)
            expect(employee.get_by_text('Private example from observer',exact=True)).to_have_count(0)
            act('manager','review',rid,'conversation',dict(discussion='Discussed feedback together',owner='Manager',due='2099-06-01'))
            act('employee','review',rid,'ack',dict(comment='Received and discussed'))
            act('pm','review',rid,'close',dict(development='Coaching follow-up'))
            print('PASS', 'People manager' if case['isLead'] else 'Individual contributor', 'nomination through receipt and closure',flush=True)
        browser.close()
finally:
    server.terminate()
    server.wait(timeout=15)
