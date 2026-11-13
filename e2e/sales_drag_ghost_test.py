# Sales table single-row drag ghost (mock mode).
# Start `npm run dev -- -p $PORT` with NEXT_PUBLIC_RR_MOCK_MODE=1 and a fresh .mock-db.json, then:
# RR_BASE=http://localhost:3460 RR_SHOTS=/workspace/sales-drag-ghost-shots/ python3 e2e/sales_drag_ghost_test.py
import os
from playwright.async_api import async_playwright

B = os.environ.get("RR_BASE", "http://localhost:3460")
OUT = os.environ.get("RR_SHOTS", "screenshots/")
DEAL = "sd-priya"
HEADLINE = "219 Oakton St"
TARGET = "ready_for_assessment"
TARGET_NAME = "Ready For Assessment"
errors, results = [], []


def ok(label, cond, extra=""):
    results.append(("PASS" if cond else "FAIL", label))
    print(("PASS " if cond else "FAIL ") + label + (("  " + extra) if extra and not cond else ""), flush=True)


def hook(pg, tag):
    pg.on("console", lambda m: errors.append((tag, m.text[:300])) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append((tag, "pageerror " + str(e)[:300])))


async def as_user(ctx, uid):
    await ctx.clear_cookies()
    await ctx.add_cookies([{"name": "rr_mock_uid", "value": uid, "url": B}])


async def go(pg, path):
    await pg.goto(B + path)
    await pg.wait_for_load_state("networkidle")


async def settle(pg, ms=400):
    await pg.wait_for_load_state("networkidle")
    await pg.wait_for_timeout(ms)


async def shot(pg, name, full=False):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    await pg.screenshot(path=path, full_page=full, caret="initial")
    print("wrote", path, flush=True)


async def center_of(locator):
    box = await locator.bounding_box()
    assert box, "expected a visible bounding box"
    return box["x"] + box["width"] / 2, box["y"] + min(24, box["height"] / 2), box


async def assert_ghost_follows(pg, x, y, label):
    ghost = pg.locator("[data-testid=sales-deal-drag-ghost]")
    await ghost.wait_for()
    text = (await ghost.inner_text()).replace("\n", " ")
    ok(label + " ghost shows deal name", HEADLINE in text, text)
    dx = await ghost.get_attribute("data-x")
    dy = await ghost.get_attribute("data-y")
    if dx is None or dy is None:
        # first paint may still be on left/top style only; read the box
        box = await ghost.bounding_box()
        ok(label + " ghost has pointer coordinates", box is not None, "missing data-x/y")
        if box:
            ok(label + " ghost follows pointer", abs(box["x"] - x) < 80 and abs(box["y"] - y) < 80, f"box={box} pointer={x,y}")
        return
    ok(label + " ghost follows pointer", abs(int(dx) - round(x)) <= 8 and abs(int(dy) - round(y)) <= 8, f"data=({dx},{dy}) pointer=({x:.1f},{y:.1f})")
    marked = await pg.locator("[data-dragging=true]").evaluate_all("els => els.map(e => e.getAttribute('data-testid'))")
    ids = {t.replace("sales-deal-row-", "").replace("sales-deal-card-", "") for t in marked if t}
    ok(label + " only the grabbed deal is marked dragging", ids == {DEAL}, str(marked))


async def wait_dropping(pg, over_sel, label):
    try:
        await pg.wait_for_function(
            """(sel) => document.querySelector(sel)?.getAttribute('data-dropping') === 'true'""",
            arg=over_sel,
            timeout=2000,
        )
        ok(label, True)
    except Exception as e:
        dropping = await pg.locator(over_sel).get_attribute("data-dropping")
        ok(label, False, f"data-dropping={dropping} {e}")


async def mouse_drag_steps(pg, start, end, steps=16, shot_name=None, over_sel=None):
    sx, sy = start
    ex, ey = end
    await pg.mouse.move(sx, sy)
    await pg.mouse.down()
    last = (sx, sy)
    mid = max(3, steps // 3)
    for i in range(1, steps + 1):
        x = sx + (ex - sx) * i / steps
        y = sy + (ey - sy) * i / steps
        await pg.mouse.move(x, y)
        await pg.wait_for_timeout(30)
        last = (x, y)
        if i == mid:
            await assert_ghost_follows(pg, x, y, "early")
    # Settle on the heading so the highlight and screenshot are on the target stage.
    await pg.mouse.move(ex, ey)
    last = (ex, ey)
    await pg.wait_for_timeout(80)
    if over_sel:
        await wait_dropping(pg, over_sel, "target stage is highlighted mid-drag")
    await assert_ghost_follows(pg, ex, ey, "mid-drag")
    if shot_name:
        await shot(pg, shot_name)
    return last


async def dispatch_pointer(pg, selector, typ, x, y, pointer_type="touch", buttons=1):
    await pg.evaluate(
        """({selector, typ, x, y, pointer_type, buttons}) => {
            const ev = new PointerEvent(typ, {
                bubbles: true, cancelable: true, composed: true,
                pointerId: 1, pointerType: pointer_type, isPrimary: true,
                clientX: x, clientY: y, buttons, button: buttons ? 0 : 0, view: window,
            });
            if (selector) {
                const el = document.querySelector(selector);
                if (!el) throw new Error("missing " + selector);
                el.dispatchEvent(ev);
            } else {
                window.dispatchEvent(ev);
            }
        }""",
        {"selector": selector, "typ": typ, "x": x, "y": y, "pointer_type": pointer_type, "buttons": buttons},
    )


async def touch_drag_steps(pg, down_sel, start, end, steps=14, shot_name=None, over_sel=None):
    sx, sy = start
    ex, ey = end
    await dispatch_pointer(pg, down_sel, "pointerdown", sx, sy)
    await pg.wait_for_timeout(450)  # long-press
    last = (sx, sy)
    mid = max(2, steps // 3)
    for i in range(1, steps + 1):
        x = sx + (ex - sx) * i / steps
        y = sy + (ey - sy) * i / steps
        await dispatch_pointer(pg, None, "pointermove", x, y)
        await pg.wait_for_timeout(30)
        last = (x, y)
        if i == mid:
            await assert_ghost_follows(pg, x, y, "mobile long-press")
    await dispatch_pointer(pg, None, "pointermove", ex, ey)
    last = (ex, ey)
    await pg.wait_for_timeout(80)
    if over_sel:
        await wait_dropping(pg, over_sel, "mobile target stage is highlighted mid-drag")
    await assert_ghost_follows(pg, ex, ey, "mobile mid-drag")
    if shot_name:
        await shot(pg, shot_name)
    await dispatch_pointer(pg, None, "pointerup", last[0], last[1], buttons=0)
    return last


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=1)
        pg = await ctx.new_page()
        hook(pg, "desktop")
        await as_user(ctx, "u-admin")
        await go(pg, "/sales")
        await pg.wait_for_selector("[data-testid=sales-pipeline-table]")
        await pg.wait_for_selector(f"[data-testid=sales-deal-handle-{DEAL}]")
        await settle(pg)

        handle = pg.locator(f"[data-testid=sales-pipeline-table] [data-testid=sales-deal-handle-{DEAL}]")
        target = pg.locator("[data-testid=sales-pipeline-table] [data-testid=sales-stage-drop-ready_for_assessment]")
        await handle.scroll_into_view_if_needed()
        await target.scroll_into_view_if_needed()
        sx, sy, _ = await center_of(handle)
        # Aim at the stage heading so collapsed or short groups still receive the drop.
        heading = pg.locator("[data-testid=sales-pipeline-table] [data-testid=sales-stage-toggle-ready_for_assessment]")
        ex, ey, _ = await center_of(heading)

        await mouse_drag_steps(
            pg,
            (sx, sy),
            (ex, ey),
            shot_name="sales-drag-ghost-desktop-1280.png",
            over_sel="[data-testid=sales-pipeline-table] [data-testid=sales-stage-drop-ready_for_assessment]",
        )
        await pg.mouse.up()
        confirm = pg.locator("[data-testid=sales-stage-move-confirm]")
        await confirm.wait_for()
        body = await confirm.inner_text()
        ok("confirm dialog names the target stage", TARGET_NAME in body and HEADLINE in body, body)
        await shot(pg, "sales-drag-ghost-confirm.png")
        await pg.locator("[data-testid=sales-stage-move-cancel]").click()
        await confirm.wait_for(state="hidden")
        await ctx.close()

        phone = await browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        mp = await phone.new_page()
        hook(mp, "mobile")
        await as_user(phone, "u-admin")
        await go(mp, "/sales")
        await mp.wait_for_selector("[data-testid=sales-pipeline-cards]")
        card = mp.locator(f"[data-testid=sales-deal-card-{DEAL}]")
        await card.wait_for()
        await card.scroll_into_view_if_needed()
        dest = mp.locator("[data-testid=sales-stage-drop-mobile-ready_for_assessment]")
        await dest.scroll_into_view_if_needed()
        await settle(mp)
        sx, sy, _ = await center_of(card)
        ex, ey, tbox = await center_of(mp.locator("[data-testid=sales-stage-drop-mobile-ready_for_assessment] [data-testid=sales-stage-toggle-ready_for_assessment]"))
        await touch_drag_steps(
            mp,
            f"[data-testid=sales-deal-card-{DEAL}]",
            (sx, sy),
            (ex, ey),
            shot_name="sales-drag-ghost-mobile-390.png",
            over_sel="[data-testid=sales-stage-drop-mobile-ready_for_assessment]",
        )
        # Confirm may appear after the drop; cancel so the fixture stays put.
        mob_confirm = mp.locator("[data-testid=sales-stage-move-confirm]")
        if await mob_confirm.count():
            ok("mobile drop opens confirm for the target stage", TARGET_NAME in (await mob_confirm.inner_text()), await mob_confirm.inner_text())
            if await mp.locator("[data-testid=sales-stage-move-cancel]").count():
                await mp.locator("[data-testid=sales-stage-move-cancel]").click()
        await phone.close()
        await browser.close()

    print("\n--- console/page errors ---")
    for tag, msg in errors:
        print(f"{tag}: {msg}")
    fails = [l for s, l in results if s == "FAIL"]
    print(f"\n{len(results) - len(fails)} passed, {len(fails)} failed")
    if fails:
        raise SystemExit(1)


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
