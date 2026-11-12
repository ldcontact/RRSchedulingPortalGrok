# Customer typeahead on New project (mock mode). Start `npm run dev` with NEXT_PUBLIC_RR_MOCK_MODE=1
# and a fresh .mock-db.json, then:
# RR_BASE=http://localhost:3433 RR_SHOTS=/tmp/shots/ python3 e2e/customer_picker_test.py
import asyncio, os
from playwright.async_api import async_playwright
B=os.environ.get('RR_BASE','http://localhost:3417'); OUT=os.environ.get('RR_SHOTS','screenshots/')
errors=[]; results=[]
def ok(label, cond, extra=''):
    results.append(('PASS' if cond else 'FAIL', label)); print(('PASS ' if cond else 'FAIL ')+label+(('  '+extra) if extra and not cond else ''), flush=True)
def hook(pg, tag):
    pg.on('console', lambda m: errors.append((tag, m.text[:300])) if m.type=='error' else None)
    pg.on('pageerror', lambda e: errors.append((tag,'pageerror '+str(e)[:300])))
async def as_user(ctx, uid):
    await ctx.clear_cookies(); await ctx.add_cookies([{'name':'rr_mock_uid','value':uid,'url':B}])
async def go(pg, path):
    await pg.goto(B+path); await pg.wait_for_load_state('networkidle')
async def settle(pg):
    await pg.wait_for_load_state('networkidle'); await pg.wait_for_timeout(400)
async def shot(pg, name, full=False):
    await pg.screenshot(path=OUT+name, full_page=full, caret='initial')

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1280,'height':900}); pg=await ctx.new_page(); hook(pg,'desktop')
        await as_user(ctx,'u-manager')

        await go(pg,'/projects/new?customer=c7'); await settle(pg)
        ok('preselect /projects/new?customer=c7 shows Itasca Print & Sign',
           await pg.locator('[data-testid=customer-search]').input_value()=='Itasca Print & Sign'
           and await pg.locator('input[name=customer_id]').input_value()=='c7')
        ok('preselect shows formatted address', await pg.locator('form.card', has_text='510 W Irving Park Rd').count()==1)

        await go(pg,'/projects/new'); await settle(pg)
        ok('new project has no customer selected', await pg.locator('input[name=customer_id]').input_value()=='')
        field=pg.locator('[data-testid=customer-search]')
        ok('customer field is a combobox', await field.get_attribute('role')=='combobox')
        await field.fill('Irving Park')
        await pg.wait_for_selector('[data-testid=customer-search-list] [role=option]', timeout=5000)
        options=pg.locator('[data-testid=customer-search-list] [role=option]')
        texts=[(await options.nth(i).inner_text()).replace('\n',' | ') for i in range(await options.count())]
        ok('partial address Irving Park matches two customers',
           any('Itasca Print & Sign' in t and '510 W Irving Park Rd' in t for t in texts)
           and any('Roselle Family Pharmacy' in t and '122 E Irving Park Rd' in t for t in texts),
           str(texts))
        marks=await pg.locator('[data-testid=customer-search-list] mark').count()
        ok('matching address text is highlighted', marks>=2, f'marks={marks}')
        await field.press('ArrowDown')  # first already active; down moves to second
        await field.press('Enter')
        await settle(pg)
        ok('keyboard Enter picks the highlighted customer',
           await pg.locator('input[name=customer_id]').input_value() in ('c7','c8')
           and await field.input_value() in ('Itasca Print & Sign','Roselle Family Pharmacy'))
        ok('dropdown closes after pick', await pg.locator('[data-testid=customer-search-list]').count()==0)

        await pg.click('[data-testid=customer-search-clear]')
        ok('clear button resets the selection',
           await pg.locator('input[name=customer_id]').input_value()=='' and await field.input_value()=='')

        await field.fill('Lunt')
        await pg.wait_for_selector('[role=option]:has-text("Elk Grove Precision Machining")', timeout=5000)
        await pg.click('[role=option]:has-text("Elk Grove Precision Machining")')
        await settle(pg)
        ok('click picks Elk Grove by partial street Lunt',
           await pg.locator('input[name=customer_id]').input_value()=='c4'
           and await field.input_value()=='Elk Grove Precision Machining')
        await shot(pg,'customer-picker-selected.png')

        await pg.click('[data-testid=customer-search-clear]')
        await field.fill('zzzxnotacustomer')
        await pg.wait_for_selector('[data-testid=customer-search-empty]', timeout=5000)
        ok('no-match state for an unknown query', 'No customers match' in await pg.locator('[data-testid=customer-search-empty]').inner_text())
        await shot(pg,'customer-picker-empty.png')

        # required: submitting without a pick stays on the form (browser or server validation)
        await field.fill('')
        await pg.fill('input[name=name]','Should not save')
        await pg.click('button:has-text("Create project")')
        await pg.wait_for_timeout(800)
        ok('required customer blocks create without a pick', '/projects/new' in pg.url)
        # tighter: still on new project, no redirect to a project page

        print('\nconsole errors:', len(errors))
        if errors:
            for e in errors: print(' ', e)
        failed=sum(1 for s,_ in results if s=='FAIL')
        print(f'{sum(1 for s,_ in results if s=="PASS")}/{len(results)} passed')
        await b.close()
        raise SystemExit(1 if failed or errors else 0)

asyncio.run(main())
