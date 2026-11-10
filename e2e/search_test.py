# Customers / Projects search click-through (mock mode). Start `npm run dev` with NEXT_PUBLIC_RR_MOCK_MODE=1 and a fresh
# .mock-db.json, then: RR_BASE=http://localhost:3461 RR_SHOTS=/tmp/shots/ python3 e2e/search_test.py
import asyncio, os, re, urllib.parse
from playwright.async_api import async_playwright
B=os.environ.get('RR_BASE','http://localhost:3461'); OUT=os.environ.get('RR_SHOTS','screenshots/')
errors=[]; results=[]
def ok(label, cond, extra=''):
    results.append(('PASS' if cond else 'FAIL', label)); print(('PASS ' if cond else 'FAIL ')+label+(f'  [{extra}]' if extra and not cond else ''), flush=True)
def hook(pg, tag):
    pg.on('console', lambda m: errors.append((tag, m.text[:300])) if m.type=='error' else None)
    pg.on('pageerror', lambda e: errors.append((tag,'pageerror '+str(e)[:300])))
async def go(pg, path):
    await pg.goto(B+path); await pg.wait_for_load_state('networkidle')
async def ids(pg, kind):
    hrefs=await pg.locator(f'main a[href^="/{kind}/"]').evaluate_all('els => els.map(e => e.getAttribute("href"))')
    return sorted({h.split('/')[2] for h in hrefs if re.fullmatch(rf'/{kind}/[a-z]+\d+', h)})
async def search(pg, kind, q):
    await go(pg, f'/{kind}?q='+urllib.parse.quote(q)); return await ids(pg, kind)

CUSTOMERS=[  # (what, query, expected customer ids)
    ('customer name', 'Prairie Bean', ['c3']),
    ('contact first name', 'Dave', ['c4']),
    ('contact last name', 'Kowalski', ['c4']),
    ('contact first + last (non-primary contact)', 'Janet Brooks', ['c1']),
    ('street address', '1420 W Algonquin', ['c1']),
    ('city', 'Elk Grove Village', ['c4']),
    ('zip', '60173', ['c2']),
    ('state + city', 'IL Palatine', ['c3']),
    ('phone 847-555-0174', '847-555-0174', ['c4']),
    ('phone (847) 555 0174', '(847) 555 0174', ['c4']),
    ('phone 8475550174', '8475550174', ['c4']),
    ('partial digits 5550174', '5550174', ['c4']),
    ('last four 0174', '0174', ['c4']),
    ('contact-only phone (Janet)', '847.555.0142', ['c1']),
    ('email (existing match)', 'tony@golfrd', ['c2']),
    ('no match', 'zzzz nothing', []),
]
PROJECTS=[
    ('project name', 'high-bay', ['p2']),
    ('scope (existing match)', 'troffers', ['p1', 'p7']),
    ('customer name', 'Golf Road Auto', ['p2', 'p8']),
    ('contact first name', 'Dave', ['p4', 'p7']),
    ('contact last name', 'Kowalski', ['p4', 'p7']),
    ('contact first + last', 'Dave Kowalski', ['p4', 'p7']),
    ('street address', '2250 Lunt', ['p4', 'p7']),
    ('city', 'Schaumburg', ['p2', 'p8']),
    ('zip', '60007', ['p4', 'p7']),
    ('phone 847-555-0174', '847-555-0174', ['p4', 'p7']),
    ('phone (847) 555 0174', '(847) 555 0174', ['p4', 'p7']),
    ('phone 8475550174', '8475550174', ['p4', 'p7']),
    ('partial digits 0174', '0174', ['p4', 'p7']),
    ('no match', 'zzzz nothing', []),
]

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}); pg=await ctx.new_page(); hook(pg,'desktop')
        await ctx.add_cookies([{'name':'rr_mock_uid','value':'u-manager','url':B}])
        await go(pg,'/customers')
        ph=await pg.get_attribute('input[name=q]','placeholder')
        ok('customers placeholder hints the new fields', ph and 'address' in ph and 'phone' in ph and 'contact' in ph, ph)
        allc=await ids(pg,'customers'); ok('customers: no search lists all 8', len(allc)==8, allc)
        # type into the search box like a user (form submit)
        await pg.fill('input[name=q]','Kowalski'); await pg.press('input[name=q]','Enter'); await pg.wait_for_url('**q=Kowalski*'); await pg.wait_for_load_state('networkidle')
        got=await ids(pg,'customers'); ok('customers: typing "Kowalski" + Enter finds Elk Grove Precision (contact last name)', got==['c4'], got)
        await pg.screenshot(path=OUT+'01-customers-contact-last-name.png')
        for what,q,exp in CUSTOMERS:
            got=await search(pg,'customers',q); ok(f'customers: {what}: "{q}"', got==exp, got)
            if q=='(847) 555 0174': await pg.screenshot(path=OUT+'02-customers-phone-formatted.png')
            if q=='1420 W Algonquin': await pg.screenshot(path=OUT+'03-customers-address.png')
            if q=='Janet Brooks': await pg.screenshot(path=OUT+'04-customers-contact-full-name.png')
            if q=='zzzz nothing': ok('customers: empty search shows empty state', await pg.locator('main').inner_text() and 'No customers' in await pg.locator('main').inner_text() or 'No match' in await pg.locator('main').inner_text(), (await pg.locator('main').inner_text())[:200])

        await go(pg,'/projects')
        ph=await pg.get_attribute('input[name=q]','placeholder')
        ok('projects placeholder hints the new fields', ph and 'address' in ph and 'phone' in ph and 'contact' in ph, ph)
        await pg.fill('input[name=q]','(847) 555-0174'); await pg.press('input[name=q]','Enter'); await pg.wait_for_url('**q=*'); await pg.wait_for_load_state('networkidle')
        got=await ids(pg,'projects'); ok('projects: typing a formatted phone + Enter finds both Elk Grove projects', got==['p4','p7'], got)
        await pg.screenshot(path=OUT+'05-projects-phone.png')
        for what,q,exp in PROJECTS:
            got=await search(pg,'projects',q); ok(f'projects: {what}: "{q}"', got==exp, got)
            if q=='Dave Kowalski': await pg.screenshot(path=OUT+'06-projects-contact-name.png')
            if q=='2250 Lunt': await pg.screenshot(path=OUT+'07-projects-address.png')
        # status tabs keep the search and their counts reflect it
        await go(pg,'/projects?q=Kowalski&status=complete'); got=await ids(pg,'projects'); ok('projects: search + Complete tab -> p7 only', got==['p7'], got)

        # mobile
        m=await b.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True); mp=await m.new_page(); hook(mp,'mobile')
        await m.add_cookies([{'name':'rr_mock_uid','value':'u-manager','url':B}])
        await go(mp,'/customers?q='+urllib.parse.quote('847-555-0174')); got=await ids(mp,'customers'); ok('mobile: customers phone search', got==['c4'], got)
        await mp.screenshot(path=OUT+'08-mobile-customers-phone.png')
        await go(mp,'/projects?q=dave'); got=await ids(mp,'projects'); ok('mobile: projects contact search', got==['p4','p7'], got)
        await mp.screenshot(path=OUT+'09-mobile-projects-contact.png')
        await b.close()
    real=[e for e in errors if 'favicon' not in e[1]]
    ok('no console/page errors', not real, real[:3])
    fails=[r for r in results if r[0]=='FAIL']
    print(f'\n{len(results)-len(fails)}/{len(results)} passed'); raise SystemExit(1 if fails else 0)
asyncio.run(main())
