# Address autocomplete on New service request (mock mode).
# Start `npm run dev -- -p $PORT` with NEXT_PUBLIC_RR_MOCK_MODE=1 and a fresh .mock-db.json, then:
# RR_BASE=http://localhost:3451 RR_SHOTS=/workspace/sr-address-shots/ python3 e2e/service_request_address_test.py
import asyncio, json, os
from playwright.async_api import async_playwright

B = os.environ.get("RR_BASE", "http://localhost:3451")
OUT = os.environ.get("RR_SHOTS", "screenshots/")
errors, results = [], []

SUGGESTIONS = {
    "items": [
        {
            "id": "sug-oakton",
            "label": "219 Oakton St, Des Plaines, IL 60016",
            "street": "219 Oakton St",
            "unit": None,
            "city": "Des Plaines",
            "state": "IL",
            "zip": "60016",
            "lat": 42.0334,
            "lng": -87.8841,
            "source": "photon",
        },
        {
            "id": "sug-golf",
            "label": "905 E Golf Rd, Schaumburg, IL 60173",
            "street": "905 E Golf Rd",
            "unit": None,
            "city": "Schaumburg",
            "state": "IL",
            "zip": "60173",
            "lat": 42.0502,
            "lng": -88.0731,
            "source": "photon",
        },
    ]
}

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
    path = os.path.join(OUT, name)
    await pg.screenshot(path=path, full_page=full, caret="initial")
    print("wrote", path, flush=True)

async def mock_suggest(route):
    if route.request.method == "POST":
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"item": None}))
        return
    await route.fulfill(status=200, content_type="application/json", body=json.dumps(SUGGESTIONS))

async def open_new_request(pg):
    # Leave the modal first so a same-URL revisit remounts a blank form.
    await go(pg, "/service-requests")
    await pg.wait_for_selector("[data-testid=ticket-list]")
    await go(pg, "/service-requests?new=1")
    await pg.wait_for_selector("[data-testid=log-call-form]")
    await settle(pg)

async def pick_customer(pg, query, name):
    field = pg.locator("[data-testid=customer-search]")
    await field.fill(query)
    await pg.wait_for_selector(f'[data-testid=customer-search-list] [role=option]:has-text("{name}")')
    await pg.click(f'[data-testid=customer-search-list] [role=option]:has-text("{name}")')
    await pg.wait_for_selector("[data-testid=suggested-projects]")
    await settle(pg)

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        pg = await ctx.new_page()
        hook(pg, "desktop")
        await pg.route("**/api/address-suggest**", mock_suggest)
        await as_user(ctx, "u-manager")

        # --- customer prefill still fills site address ---
        await open_new_request(pg)
        ok("new request form uses the shared address autocomplete", await pg.locator("[data-testid=address-suggest-input]").count() == 1)
        ok("site fields keep service-request names", await pg.locator('input[name=site_address]').count() == 1 and await pg.locator('input[name=site_city]').count() == 1)
        await pick_customer(pg, "Golf", "Golf Road Auto Body")
        ok(
            "selecting a customer prefills site address, city, state, zip, and contact",
            await pg.input_value("input[name=site_address]") == "905 E Golf Rd"
            and await pg.input_value("input[name=site_city]") == "Schaumburg"
            and await pg.input_value("input[name=site_state]") == "IL"
            and await pg.input_value("input[name=site_zip]") == "60173"
            and await pg.input_value("input[name=contact_name]") == "Tony Russo",
        )

        # --- typed address is not overwritten by a later customer pick ---
        await open_new_request(pg)
        street = pg.locator("[data-testid=address-suggest-input]")
        await street.fill("219 Oakton St")
        await pg.wait_for_selector("[data-testid=address-suggest-list]")
        await pg.keyboard.press("Escape")
        await pick_customer(pg, "Golf", "Golf Road Auto Body")
        ok(
            "customer prefill does not overwrite a street the user already typed",
            await pg.input_value("input[name=site_address]") == "219 Oakton St",
        )
        ok(
            "customer prefill still fills empty city / zip after a typed street",
            await pg.input_value("input[name=site_city]") == "Schaumburg"
            and await pg.input_value("input[name=site_zip]") == "60173",
        )

        # --- suggestions dropdown + select (desktop screenshots) ---
        await open_new_request(pg)
        await street.fill("")
        await street.fill("219 Oak")
        await pg.wait_for_selector("[data-testid=address-suggest-option-0]")
        await settle(pg, 200)
        ok("typing a street opens address suggestions", await pg.locator("[data-testid=address-suggest-list] [role=option]").count() >= 1)
        # Keep the dropdown in view for the shot
        await pg.locator("[data-testid=log-call-form]").evaluate("el => el.scrollIntoView({block:'start'})")
        await shot(pg, "01-desktop-suggestions-open.png")

        await pg.click("[data-testid=address-suggest-option-0]")
        await settle(pg, 300)
        ok(
            "selecting a suggestion fills street, city, state, zip",
            await pg.input_value("input[name=site_address]") == "219 Oakton St"
            and await pg.input_value("input[name=site_city]") == "Des Plaines"
            and await pg.input_value("input[name=site_state]") == "IL"
            and await pg.input_value("input[name=site_zip]") == "60016",
        )
        ok("suggestion list closes after a pick", await pg.locator("[data-testid=address-suggest-list]").count() == 0)
        ok("picked coordinates are posted with the form", await pg.locator('input[name=geo_lat]').input_value() == "42.0334" and await pg.locator('input[name=geo_lng]').input_value() == "-87.8841")
        await shot(pg, "02-desktop-after-select.png")

        # Selecting a customer after a suggestion must not clobber the chosen street
        await pick_customer(pg, "Golf", "Golf Road Auto Body")
        ok(
            "customer pick after a suggestion leaves the chosen street in place",
            await pg.input_value("input[name=site_address]") == "219 Oakton St"
            and await pg.input_value("input[name=site_city]") == "Des Plaines",
        )

        # --- mobile (Galaxy S26 Ultra-ish CSS viewport) ---
        mctx = await b.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent="Mozilla/5.0 (Linux; Android 16; SM-S938U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36")
        mpg = await mctx.new_page()
        hook(mpg, "mobile")
        await mpg.route("**/api/address-suggest**", mock_suggest)
        await as_user(mctx, "u-manager")
        await open_new_request(mpg)
        mstreet = mpg.locator("[data-testid=address-suggest-input]")
        await mstreet.fill("219 Oak")
        await mpg.wait_for_selector("[data-testid=address-suggest-option-0]")
        await settle(mpg, 200)
        ok("mobile typing opens address suggestions", await mpg.locator("[data-testid=address-suggest-list] [role=option]").count() >= 1)
        await shot(mpg, "03-mobile-suggestions-open.png")
        await mpg.click("[data-testid=address-suggest-option-0]")
        await settle(mpg, 300)
        ok(
            "mobile select fills site fields",
            await mpg.input_value("input[name=site_address]") == "219 Oakton St"
            and await mpg.input_value("input[name=site_city]") == "Des Plaines"
            and await mpg.input_value("input[name=site_zip]") == "60016",
        )
        await shot(mpg, "04-mobile-after-select.png")
        await mctx.close()
        await b.close()

    print("---")
    failed = [l for s, l in results if s == "FAIL"]
    for s, l in results:
        print(f"{s}  {l}")
    if errors:
        print("CONSOLE/PAGE ERRORS:")
        for e in errors[:20]:
            print(" ", e)
    if failed:
        raise SystemExit(f"{len(failed)} failed")
    print(f"{len(results)} passed")

if __name__ == "__main__":
    asyncio.run(main())
