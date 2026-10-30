import asyncio, datetime, zoneinfo, re
from playwright.async_api import async_playwright
B='http://localhost:3417'; OUT='/workspace/rr-scheduler/screenshots/'
IMG='/workspace/rr-scheduler/screenshots/01-login-desktop.png'
T=datetime.datetime.now(zoneinfo.ZoneInfo('America/Chicago')).date()
D=lambda n: (T+datetime.timedelta(days=n)).isoformat()
errors=[]; results=[]
def ok(label, cond):
    results.append(('PASS' if cond else 'FAIL', label)); print(('PASS ' if cond else 'FAIL ')+label, flush=True)
def hook(pg, tag):
    pg.on('console', lambda m: errors.append((tag, m.text[:300])) if m.type=='error' else None)
    pg.on('pageerror', lambda e: errors.append((tag,'pageerror '+str(e)[:300])))
async def as_user(ctx, uid):
    await ctx.clear_cookies(); await ctx.add_cookies([{'name':'rr_mock_uid','value':uid,'url':B}])
async def go(pg, path):
    await pg.goto(B+path); await pg.wait_for_load_state('networkidle')
async def shot(pg, name, full=False):
    await pg.screenshot(path=OUT+name, full_page=full, caret='initial')
async def settle(pg):
    await pg.wait_for_load_state('networkidle'); await pg.wait_for_timeout(600)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1440,'height':900}); pg=await ctx.new_page(); hook(pg,'desktop')
        await as_user(ctx,'u-manager')
        # dashboard
        await go(pg,'/')
        ok('dashboard shows awaiting-review list with RTU job', await pg.locator('[data-testid=awaiting-review] >> text=RTU tune-up + thermostats').count()==1)
        ok('dashboard counts render', await pg.locator('[data-testid=dashboard-counts] >> text=Visits today').count()==1)
        await shot(pg,'17-dashboard-desktop.png')
        # projects list + filters
        await go(pg,'/projects')
        ok('projects list shows active projects', await pg.locator('a[href^="/projects/p"]').count()==6)
        await pg.click('[role=tab]:has-text("Proposed")'); await pg.wait_for_url('**status=proposed'); await settle(pg)
        ok('status filter: Proposed -> 2 projects', await pg.locator('a[href^="/projects/p"]').count()==2)
        await go(pg,'/projects'); await shot(pg,'18-projects-desktop.png')
        # create project
        await go(pg,'/projects/new?customer=c7')
        await pg.fill('input[name=name]','Print shop LED retrofit'); await pg.select_option('select[name=type]','lighting')
        await pg.fill('input[name=value]','9,800'); await pg.fill('input[name=est_rebate]','4200'); await pg.fill('textarea[name=scope]','Replace 30 T8 fixtures in the press room.\nAdd 2 exterior wall packs.')
        await pg.click('button:has-text("Create project")'); await pg.wait_for_url('**saved=1'); await settle(pg)
        pid=re.search(r'/projects/([^?]+)', pg.url).group(1)
        ok('project created with scope and money', await pg.locator('text=Replace 30 T8 fixtures').count()==1 and await pg.locator('text=$9,800').count()>=1 and await pg.locator('text=$5,600').count()==1)
        ok('default timeline milestones created', await pg.locator('[data-testid=milestone]').count()==4)
        # milestones: add, check off, re-date
        await pg.fill('[data-testid=add-milestone] input[name=name]','Materials delivered'); await pg.fill('[data-testid=add-milestone] input[name=due_date]',D(5))
        await pg.click('[data-testid=add-milestone] button'); await settle(pg)
        ok('milestone added', await pg.locator('[data-testid=milestone] input[value="Materials delivered"]').count()==1)
        await pg.locator('[data-testid=milestone]').first.locator('button[aria-label="Mark done"]').click(); await settle(pg)
        ok('milestone checked off', await pg.locator('button[aria-label="Mark not done"]').count()==1)
        row=pg.locator('[data-testid=milestone]:has(input[value="Install"])')
        await row.locator('input[name=due_date]').fill(D(12)); await settle(pg)
        await go(pg,f'/projects/{pid}')
        ok('milestone re-dated (auto-save)', await pg.locator(f'[data-testid=milestone]:has(input[value="Install"]) input[name=due_date]').input_value()==D(12))
        # before photo upload (client-side resize)
        await pg.set_input_files('[data-testid=gallery-before]', IMG)
        await pg.wait_for_selector('img[alt="Photo"]', timeout=20000); await settle(pg)
        ok('before photo uploaded', await pg.locator('img[alt="Photo"]').count()==1)
        # send timeline + approve
        await pg.click('[data-testid=send-timeline] button'); await pg.wait_for_url('**ok=*'); await settle(pg)
        ok('timeline "sent" (log only) + logged', await pg.locator('text=Timeline logged as sent').count()==1 and await pg.locator('text=Proposed timeline: Print shop LED retrofit').count()>=1)
        await pg.click('button:has-text("Mark approved")'); await settle(pg)
        ok('timeline marked approved', await pg.locator('text=Approved by customer').count()==1)
        # log a call on the project
        await pg.select_option('[data-testid=log-message] select[name=channel]','call'); await pg.fill('[data-testid=log-message] textarea[name=body]','Rosa confirmed the press room is free on Mondays.')
        await pg.click('[data-testid=log-message] button:has-text("Add to log")'); await settle(pg)
        ok('call logged on customer log', await pg.locator('text=Rosa confirmed the press room').count()==1)
        await shot(pg,'19-project-detail-desktop.png', True)
        # schedule visit with double-booking warning
        await pg.click('a:has-text("Schedule visit") >> nth=0'); await pg.wait_for_url('**/jobs/new?project=*'); await settle(pg)
        await pg.fill('input[name=title]','Press room retrofit'); await pg.fill('input[name=date]',D(0)); await pg.fill('input[name=start]','09:00'); await pg.fill('input[name=end]','12:00')
        await pg.check('input[name=assignees][value=u-tech1]'); await pg.check('input[name=assignees][value=u-tech4]')
        await pg.click('button:has-text("Schedule visit")'); await pg.wait_for_selector('[data-testid=conflict-warning]')
        ok('double-booking warning (Carlos on exam rooms job)', await pg.locator('[data-testid=conflict-warning] >> text=Carlos Mendez is already on').count()>=1)
        await shot(pg,'20-visit-conflict-desktop.png')
        await pg.click('button:has-text("Save anyway")'); await pg.wait_for_url('**/jobs/*?ok=*'); await settle(pg)
        ok('visit saved anyway with 2 techs', await pg.locator('text=Visit scheduled.').count()==1 and await pg.locator('text=Carlos').count()>=1)
        await go(pg,f'/projects/{pid}')
        ok('project now scheduled + team shows assignees', await pg.locator('text=Scheduled >> nth=0').count()>=1 and await pg.locator('text=Emily Chen').count()>=1)
        # schedule week board + DnD
        await go(pg,'/schedule'); await shot(pg,'21-schedule-week-desktop.png')
        ok('week board renders', await pg.locator('[data-testid=week-board]').is_visible())
        await pg.drag_and_drop('[data-testid=week-board] a[data-job=j8]', f'[data-drop="u-tech3|{D(0)}"]'); await pg.wait_for_selector('text=Visit moved.'); await settle(pg)
        ok('drag: reassign Bay 4 punch list Jake -> Andre', await pg.locator(f'[data-drop="u-tech3|{D(0)}"] a[data-job=j8]').count()==1 and await pg.locator(f'[data-drop="u-tech2|{D(0)}"] a[data-job=j8]').count()==0)
        dialogs=[]
        async def on_dialog(d): dialogs.append(d.message); await d.dismiss()
        pg.on('dialog', on_dialog)
        await pg.drag_and_drop(f'[data-drop="u-tech4|{D(1)}"] a[data-job=j4]', f'[data-drop="u-tech2|{D(2)}"]'); await pg.wait_for_timeout(1500)
        ok('drag onto busy tech -> double-booking confirm; cancel keeps it', len(dialogs)==1 and 'Double-booking' in dialogs[0] and await pg.locator(f'[data-drop="u-tech4|{D(1)}"] a[data-job=j4]').count()==1)
        pg.remove_listener('dialog', on_dialog)
        await go(pg,f'/schedule?date={D(7)}')  # next week: Emily's Phase A day-2 slot is free
        await pg.drag_and_drop('[data-testid=week-board] a[data-job=j7] >> nth=0', f'[data-drop="u-tech1|{D(9)}"]'); await pg.wait_for_selector('text=Visit moved.'); await settle(pg)
        ok('drag: reschedule to another day', await pg.locator(f'[data-drop="u-tech1|{D(9)}"] a[data-job=j7]').count()==1)
        await go(pg,f'/schedule?view=day&date={D(0)}'); await shot(pg,'22-schedule-day-desktop.png')
        ok('day dispatch board renders', await pg.locator('[data-testid=day-board]').is_visible())
        await go(pg,f'/schedule?view=month&date={D(0)}'); await shot(pg,'23-schedule-month-desktop.png')
        ok('month view renders', await pg.locator('[data-testid=month-board]').is_visible())
        await pg.select_option('select[aria-label="Filter by tech"]','u-tech3'); await pg.wait_for_url('**tech=u-tech3'); await settle(pg)
        ok('tech filter applies', 'tech=u-tech3' in pg.url and await pg.locator('[data-testid=month-board] a[data-job=j2]').count()==0)
        # manager review: send back
        await go(pg,'/jobs/j5'); await shot(pg,'24-visit-review-desktop.png', True)
        await pg.fill('textarea[name=review_note]','Please add a photo of the RTU #2 belt.'); await pg.click('button:has-text("Send back to tech")'); await pg.wait_for_url('**ok=*'); await settle(pg)
        ok('send back -> in progress with note', await pg.locator('text=Sent back by your manager').count()==1)
        await ctx.close()

        # ---- tech (Andre) on mobile
        ctx=await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True); pg=await ctx.new_page(); hook(pg,'mobile')
        await as_user(ctx,'u-tech3'); await go(pg,'/')
        ok('tech My Jobs shows sent-back note', await pg.locator('text=Please add a photo of the RTU #2 belt.').count()==1)
        ok('tech My Jobs lists reassigned job today', await pg.locator('[data-testid=my-jobs-today] >> text=Bay 4 punch list').count()==1)
        await shot(pg,'25-tech-my-jobs-mobile.png')
        await go(pg,'/jobs/j8'); await shot(pg,'26-tech-job-detail-mobile.png', True)
        ok('tech sees scope + before photos + directions', await pg.locator('text=Swap 16 400W').count()==1 and 'maps/dir' in (await pg.locator('a:has-text("Directions")').get_attribute('href') or ''))
        await pg.click('button:has-text("Start job")'); await pg.wait_for_url('**ok=*'); await settle(pg)
        ok('tech started job', await pg.locator('text=Job started').count()==1)
        await pg.click('button:has-text("Mark complete")'); await pg.wait_for_url('**error=*'); await settle(pg)
        ok('submit blocked without photo + note', await pg.locator('text=Add at least one completion photo and a note').count()>=1)
        await pg.set_input_files('[data-testid=gallery-completion]', IMG); await pg.wait_for_selector('[data-testid=completion] img', timeout=20000); await settle(pg)
        await pg.fill('[data-testid=completion] textarea[name=body]','Punch list done: re-aimed 2 fixtures, replaced 1 driver.'); await pg.click('[data-testid=completion] button:has-text("Add note")'); await pg.wait_for_url('**ok=*'); await settle(pg)
        ok('completion photo + note added', await pg.locator('[data-testid=completion] img').count()==1 and await pg.locator('text=re-aimed 2 fixtures').count()>=1)
        await shot(pg,'27-tech-completion-mobile.png', True)
        await pg.click('button:has-text("Mark complete")'); await pg.wait_for_url('**ok=*'); await settle(pg)
        ok('tech submitted for review', await pg.locator('text=Submitted for review').count()>=1)
        await go(pg,'/jobs/j5'); await pg.click('button:has-text("Mark complete")'); await pg.wait_for_url('**ok=*')
        ok('tech re-submits sent-back job', await pg.locator('text=Submitted for review').count()>=1)
        await go(pg,'/schedule'); await shot(pg,'28-tech-schedule-mobile.png')
        ok('tech schedule = own agenda only', await pg.locator('[data-testid=agenda] >> text=Exam rooms').count()==0 and await pg.locator('[data-testid=agenda] >> text=Bay 4 punch list').count()==1)
        await go(pg,'/projects'); ok('tech blocked from projects', 'denied=1' in pg.url)
        await go(pg,'/jobs/j2'); ok('tech cannot open unassigned job', await pg.locator('text=This page could not be found').count()>=1 or await pg.locator('text=404').count()>=1)
        # ---- manager on mobile: approve
        await as_user(ctx,'u-manager'); await go(pg,'/')
        ok('both submissions awaiting review', await pg.locator('[data-testid=awaiting-review] >> text=Bay 4 punch list').count()==1 and await pg.locator('[data-testid=awaiting-review] >> text=RTU tune-up').count()==1)
        await shot(pg,'29-manager-home-mobile.png', True)
        await go(pg,'/jobs/j8'); await pg.click('button:has-text("Approve")'); await pg.wait_for_url('**ok=*'); await settle(pg)
        ok('manager approved visit', await pg.locator('text=Visit approved.').count()==1)
        await go(pg,'/schedule'); await shot(pg,'30-schedule-agenda-mobile.png')
        await go(pg,'/projects/p3'); await shot(pg,'31-project-detail-mobile.png')
        await go(pg,'/customers/c1'); ok('customer page lists projects + log', await pg.locator('text=LED retrofit – full office').count()>=1 and await pg.locator('text=Customer log').count()==1)
        await ctx.close(); await b.close()
asyncio.run(main())
print('FAILED:', [r for r in results if r[0]=='FAIL'])
print('PASSED:', sum(1 for r in results if r[0]=='PASS'), '/', len(results))
print('CONSOLE ERRORS:', errors)
