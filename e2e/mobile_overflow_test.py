# Mobile horizontal-overflow guard (mock mode). Start `npm run dev` with NEXT_PUBLIC_RR_MOCK_MODE=1, then:
# RR_BASE=http://localhost:3431 RR_MOCK_DB=.mock-db.json RR_SHOTS=/tmp/shots/ python3 e2e/mobile_overflow_test.py
# Seeds long customer/project/visit names and puts Approved + Scheduled visits on today, then checks every main page at
# phone widths (mobile emulation): document.documentElement.scrollWidth must be <= innerWidth == device width (no sideways scroll / zoom-out on phones).
import asyncio, datetime, json, os
from playwright.async_api import async_playwright
B=os.environ.get('RR_BASE','http://localhost:3431'); OUT=os.environ.get('RR_SHOTS','screenshots/'); DB=os.environ.get('RR_MOCK_DB','.mock-db.json')
WIDTHS=[int(w) for w in os.environ.get('RR_WIDTHS','360,412').split(',')]
SHOT=os.environ.get('RR_SHOT_PREFIX','')  # e.g. "after-" -> saves Home screenshots at each width
errors=[]; results=[]
def ok(label, cond, extra=''):
    results.append(('PASS' if cond else 'FAIL', label)); print(('PASS ' if cond else 'FAIL ')+label+(('  '+extra) if extra and not cond else ''), flush=True)

LONG_CUST='Mallard Lake Apartments Condominium Association of Wheeling'
LONG_PROJ='Weatherization Project Phase 3 – Buildings 1572 through 1598 Teal Lane'
LONG_JOB='Exam rooms + hallway retrofit, operatories 3 & 4 and the back storage corridor'

def seed_long_names():
    d=json.load(open(DB))
    for c in d['customers']:
        if c['id']=='c1': c['name']=LONG_CUST; c['address']='1572 Teal Lane, Building 1598, Unit Superintendent Office'
    for p in d['projects']:
        if p['id']=='p1': p['title']=LONG_PROJ
    now=datetime.datetime.now(datetime.timezone.utc)
    for j in d['jobs']:
        if j['id']=='j2': j['title']=LONG_JOB
        if j['id']=='j1':  # approved visit today -> Today's visits shows both Approved and Scheduled pills
            j['starts_at']=(now.replace(minute=0,second=0,microsecond=0)).isoformat().replace('+00:00','Z')
            j['ends_at']=(now.replace(minute=0,second=0,microsecond=0)+datetime.timedelta(hours=2)).isoformat().replace('+00:00','Z')
        if j['id']=='j5': j['title']='RTU tune-up + thermostats with an unusually long review title for testing'
    json.dump(d, open(DB,'w'))
    return d

MEASURE='''(w) => {
  // is_mobile: Chrome widens the layout viewport (and zooms out) when content overflows, so compare against the device width w.
  // Also list elements poking past w that are not inside an intentional scroll/clip container, ignoring the app shell's
  // last-resort overflow guard, so the root causes stay fixed even though the guard would hide them.
  const vw = window.innerWidth, sw = document.documentElement.scrollWidth;
  const contained = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    if (a.hasAttribute('data-overflow-guard')) continue;
    if (['auto','scroll','hidden','clip'].includes(getComputedStyle(a).overflowX)) return true; } return false; };
  const off = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width && r.right > w + 0.5 && !contained(el))
      off.push(el.tagName.toLowerCase() + '.' + String(el.className.baseVal ?? el.className).slice(0,60) + ' r=' + Math.round(r.right) + ' "' + (el.textContent||'').trim().slice(0,30) + '"');
  }
  return { vw, sw, off: off.slice(0, 8), n: off.length };
}'''

async def main():
    os.makedirs(OUT, exist_ok=True)
    d=seed_long_names()
    sr=(d.get('service_requests') or [{}])[0].get('id')
    staff=['/','/schedule','/schedule?view=day','/customers','/customers/c1','/projects','/projects/p1','/jobs/j2','/jobs/j1','/service-requests','/team','/fleet','/account']
    if sr: staff.append(f'/service-requests/{sr}')
    tech=['/','/schedule','/jobs/j2','/account']
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        for uid, pages in (('u-admin', staff), ('u-tech1', tech)):
            for w in WIDTHS:
                ctx=await b.new_context(viewport={'width':w,'height':915}, device_scale_factor=3, is_mobile=True, has_touch=True)
                await ctx.add_cookies([{'name':'rr_mock_uid','value':uid,'url':B}])
                pg=await ctx.new_page()
                pg.on('pageerror', lambda e, t=f'{uid}@{w}': errors.append((t,str(e)[:300])))
                for path in pages:
                    await pg.goto(B+path); await pg.wait_for_load_state('networkidle')
                    m=await pg.evaluate(MEASURE, w)
                    ok(f'{uid} {path} @{w}px: scrollWidth {m["sw"]} / innerWidth {m["vw"]} <= {w}, {m["n"]} overflowing elements', m['sw']<=w and m['vw']==w and m['n']==0, ' | '.join(m['off']))
                    if SHOT and uid=='u-admin' and path=='/':
                        await pg.screenshot(path=f'{OUT}{SHOT}home-{w}.png')
                        await pg.screenshot(path=f'{OUT}{SHOT}home-{w}-full.png', full_page=True)
                    if SHOT and uid=='u-admin' and path in ('/projects/p1','/jobs/j2') and w==412:
                        await pg.screenshot(path=f'{OUT}{SHOT}{path.strip("/").replace("/","-")}-{w}.png')
                await ctx.close()
        await b.close()
    ok('no page errors', not errors)
    for e in errors: print('  ERR', e)
    f=[r for r in results if r[0]=='FAIL']; print(f'{len(results)-len(f)}/{len(results)} passed'); raise SystemExit(1 if f else 0)
asyncio.run(main())
