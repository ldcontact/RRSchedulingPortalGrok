# Project page "Completion photos" section (mock mode). Start `npm run dev` with NEXT_PUBLIC_RR_MOCK_MODE=1 and a fresh
# .mock-db.json, then: RR_BASE=http://localhost:3421 RR_MOCK_DB=.mock-db.json RR_SHOTS=/tmp/shots/ python3 e2e/project_completion_photos_test.py
import asyncio, datetime, json, os, uuid
from playwright.async_api import async_playwright
B=os.environ.get('RR_BASE','http://localhost:3417'); OUT=os.environ.get('RR_SHOTS','screenshots/'); DB=os.environ.get('RR_MOCK_DB','.mock-db.json')
errors=[]; results=[]
def ok(label, cond):
    results.append(('PASS' if cond else 'FAIL', label)); print(('PASS ' if cond else 'FAIL ')+label, flush=True)
def hook(pg, tag):
    pg.on('console', lambda m: errors.append((tag, m.text[:300])) if m.type=='error' else None)
    pg.on('pageerror', lambda e: errors.append((tag,'pageerror '+str(e)[:300])))
async def go(pg, path):
    await pg.goto(B+path); await pg.wait_for_load_state('networkidle')
card=lambda pg: pg.locator('[data-testid=project-completion-photos]')
count=lambda pg: pg.locator('[data-testid=project-completion-count]').inner_text()
groups=lambda pg: pg.locator('[data-testid=project-completion-group]')

def add_imported_photos(n):
    """Simulate HCP-imported completion photos on visit j1 (project p1), like the production backfill."""
    d=json.load(open(DB)); base=datetime.datetime(2026,6,15,17,0,tzinfo=datetime.timezone.utc)
    for i in range(n):
        d['photos'].append({'id':str(uuid.uuid4()),'project_id':'p1','job_id':'j1','kind':'completion','storage_path':f'seed/completion/Imported%20{i+1}.svg',
            'caption':'From Housecall Pro','requirement_id':None,'uploaded_by':'u-admin','created_at':(base+datetime.timedelta(minutes=i)).isoformat().replace('+00:00','Z')})
    json.dump(d, open(DB,'w'))

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}); pg=await ctx.new_page(); hook(pg,'desktop')
        await ctx.add_cookies([{'name':'rr_mock_uid','value':'u-manager','url':B}])
        await go(pg,'/projects/p3')
        ok('p3 shows Completion photos card', await card(pg).count()==1)
        ok('p3 count is 2 from 1 visit', (await count(pg)).startswith('2 · from 1 visit'))
        ok('p3 group links to its visit', await groups(pg).first.locator('a[href="/jobs/j5"]').count()>=1)
        ok('p3 group shows 2 thumbnails', await groups(pg).first.locator('img').count()==2)
        ok('before photos card still there', await pg.locator('h3:has-text("Before photos")').count()==1)
        await go(pg,'/projects/p6')
        ok('project without visits photos shows empty state', 'No completion photos yet' in await card(pg).inner_text() and (await count(pg)).startswith('0'))
        add_imported_photos(18)
        await go(pg,'/projects/p1')
        ok('p1 count is 19 from 1 visit after import', (await count(pg)).startswith('19 · from 1 visit'))
        ok('p1 thumbnails capped at 12', await groups(pg).first.locator('img').count()==12)
        more=pg.locator('[data-testid=project-completion-more]')
        ok('p1 shows "View all 19 on the visit" link to j1', await more.count()==1 and '19' in await more.inner_text() and await more.get_attribute('href')=='/jobs/j1')
        await groups(pg).first.locator('button').first.click(); await pg.wait_for_selector('[role=dialog]')
        ok('thumbnail opens viewer without delete', await pg.locator('[role=dialog] button:has-text("Delete")').count()==0)
        await pg.keyboard.press('Escape'); await pg.locator('[role=dialog] button:has-text("Close")').click()
        await card(pg).scroll_into_view_if_needed(); await pg.wait_for_timeout(400)
        await card(pg).screenshot(path=OUT+'project-completion-desktop.png')
        await pg.screenshot(path=OUT+'project-page-desktop-full.png', full_page=True)
        m=await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True); mp=await m.new_page(); hook(mp,'mobile')
        await m.add_cookies([{'name':'rr_mock_uid','value':'u-manager','url':B}])
        await go(mp,'/projects/p1'); await card(mp).scroll_into_view_if_needed(); await mp.wait_for_timeout(400)
        ok('mobile shows completion section', await card(mp).count()==1)
        await card(mp).screenshot(path=OUT+'project-completion-mobile.png')
        await b.close()
    bad=[e for e in errors if 'favicon' not in e[1]]
    ok('no console/page errors', not bad)
    for e in bad: print('  ERR', e)
    f=[r for r in results if r[0]=='FAIL']; print(f'{len(results)-len(f)}/{len(results)} passed'); raise SystemExit(1 if f else 0)
asyncio.run(main())
