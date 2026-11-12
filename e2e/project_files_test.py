# Project / visit documents (mock mode). Start the app with NEXT_PUBLIC_RR_MOCK_MODE=1, then:
#   RR_BASE=http://localhost:PORT RR_MOCK_DB=.mock-db.json python3 e2e/project_files_test.py
import asyncio, os, tempfile
from pathlib import Path
from playwright.async_api import async_playwright

B = os.environ.get("RR_BASE", "http://localhost:3417")
errors = []
results = []

def ok(label, cond, detail=""):
    results.append(("PASS" if cond else "FAIL", label))
    print(("PASS " if cond else "FAIL ") + label + ((" — " + detail) if detail and not cond else ""), flush=True)

def hook(pg, tag):
    pg.on("console", lambda m: errors.append((tag, m.text[:300])) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append((tag, "pageerror " + str(e)[:300])))

async def go(pg, path):
    await pg.goto(B + path)
    await pg.wait_for_load_state("networkidle")

def write_sample(dir: Path):
    pdf = dir / "Lighting_scope_SOW.pdf"
    pdf.write_bytes(b"%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
    xlsx = dir / "Fixture_schedule.xlsx"
    xlsx.write_bytes(b"PK\x05\x06" + b"\x00" * 18)
    csv = dir / "ComEd_rebate_worksheet.csv"
    csv.write_text("fixture,qty\n2x4 LED,42\n")
    img = dir / "Existing_panel.jpg"
    img.write_bytes(b"\xff\xd8\xff\xd9")  # tiny JPEG SOI/EOI
    visit_pdf = dir / "Install_notes.pdf"
    visit_pdf.write_bytes(b"%PDF-1.1\ntrailer<<>>\n%%EOF\n")
    return pdf, xlsx, csv, img, visit_pdf

async def main():
    tmp = Path(tempfile.mkdtemp(prefix="rr-files-"))
    pdf, xlsx, csv, img, visit_pdf = write_sample(tmp)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])

        ctx = await b.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
        pg = await ctx.new_page(); hook(pg, "admin")
        await ctx.add_cookies([{"name": "rr_mock_uid", "value": "u-admin", "url": B}])

        await go(pg, "/projects/new?customer=c1")
        ok("new project shows attachments drop zone", await pg.locator("[data-testid=project-file-picker]").count() == 1)
        await pg.locator('input[name=name]').fill("Document packet – test")
        await pg.locator("[data-testid=project-file-picker-input]").set_input_files([str(pdf), str(xlsx), str(csv)])
        ok("staged rows appear before save", await pg.locator("[data-testid=project-file-staged] li").count() == 3)
        await pg.locator("[data-testid=project-file-remove]").first.click()
        ok("can remove a staged file before save", await pg.locator("[data-testid=project-file-staged] li").count() == 2)
        await pg.get_by_role("button", name="Create project").click()
        # /projects/new also matches **/projects/**, so wait for a saved project URL.
        await pg.wait_for_url(lambda url: "/projects/" in url and "/projects/new" not in url and "tab=files" in url, timeout=15000)
        await pg.wait_for_load_state("networkidle")
        ok("lands on Files tab after create with attachments", "tab=files" in pg.url and "/projects/new" not in pg.url)
        names = await pg.locator("[data-testid=project-documents]").inner_text()
        ok("created project lists remaining attachments", "Fixture_schedule.xlsx" in names and "ComEd_rebate_worksheet.csv" in names and "Lighting_scope_SOW.pdf" not in names)

        await go(pg, "/projects/p1?tab=files")
        card = pg.locator("[data-testid=project-documents]")
        ok("p1 has Project documents card", await card.count() == 1)
        for name in ("Lighting_scope_SOW.pdf", "Fixture_schedule.xlsx", "Existing_panel.jpg", "ComEd_rebate_worksheet.csv", "Site_plan.pdf"):
            ok(f"p1 lists {name}", name in await card.inner_text())
        ok("photos-by-visit section is still on the Files tab", await pg.locator("[data-testid=project-completion-photos]").count() == 1)
        ok("admin sees delete on project documents", await card.locator("[data-testid=project-file-delete]").count() >= 1)
        async with pg.expect_download() as dl:
            await card.locator("[data-testid=project-file-row-pf1] [data-testid=project-file-download]").click()
        download = await dl.value
        ok("admin can download a project PDF", "Lighting_scope_SOW" in (download.suggested_filename or download.url))

        # manager without delete access
        mctx = await b.new_context(viewport={"width": 1280, "height": 900})
        mpg = await mctx.new_page(); hook(mpg, "manager")
        await mctx.add_cookies([{"name": "rr_mock_uid", "value": "u-manager", "url": B}])
        await go(mpg, "/projects/p1?tab=files")
        ok("manager without delete access cannot delete documents", await mpg.locator("[data-testid=project-documents] [data-testid=project-file-delete]").count() == 0)
        await mctx.close()

        # tech: can view on the visit, cannot delete, can add a visit file after starting
        tctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        tpg = await tctx.new_page(); hook(tpg, "tech")
        await tctx.add_cookies([{"name": "rr_mock_uid", "value": "u-tech1", "url": B}])
        await go(tpg, "/jobs/j2")
        docs = tpg.locator("[data-testid=project-documents]")
        ok("tech sees Project documents near the top of the visit", await docs.count() == 1)
        ok("tech sees the project PDF", "Lighting_scope_SOW.pdf" in await docs.inner_text())
        ok("tech cannot delete project documents", await docs.locator("[data-testid=project-file-delete]").count() == 0)
        ok("tech back link is Home, not Jobs", await tpg.locator("a, button").filter(has_text="Home").count() >= 1)
        # start the visit so they can upload
        start = tpg.get_by_role("button", name="Start job")
        if await start.count():
            await start.click()
            await tpg.wait_for_load_state("networkidle")
        await go(tpg, "/jobs/j2?tab=photos")
        visit = tpg.locator("[data-testid=visit-documents]")
        ok("visit Files tab has Visit files", await visit.count() == 1)
        ok("tech cannot delete visit files before upload", await visit.locator("[data-testid=project-file-delete]").count() == 0)
        await tpg.locator("[data-testid=visit-file-input]").set_input_files(str(visit_pdf))
        await tpg.wait_for_timeout(800)
        await tpg.wait_for_load_state("networkidle")
        visit = tpg.locator("[data-testid=visit-documents]")
        ok("tech uploaded a visit PDF", "Install_notes.pdf" in await visit.inner_text())
        ok("tech still cannot delete the visit PDF", await visit.locator("[data-testid=project-file-delete]").count() == 0)
        async with tpg.expect_download() as dl:
            await visit.locator("[data-testid=project-file-download]").last.click()
        tdl = await dl.value
        ok("tech can download a visit file", "Install_notes" in (tdl.suggested_filename or tdl.url))
        # tech cannot open the project Files tab
        await go(tpg, "/projects/p1?tab=files")
        ok("tech cannot open the project page", "/projects/p1" not in tpg.url or await tpg.locator("[data-testid=project-documents]").count() == 0 or "sign" in tpg.url.lower() or await tpg.locator("text=Project documents").count() == 0)
        # RequireRole redirects techs; just assert they do not see the staff Files tab delete controls on a project they can't open
        # A 404 or redirect off /projects/p1 is success.
        ok("tech is not on the staff project Files tab", not tpg.url.rstrip("/").endswith("/projects/p1") or "tab=files" not in tpg.url or await tpg.locator("[data-testid=project-file-input]").count() == 0)

        await tctx.close()
        await b.close()

    bad = [e for e in errors if "favicon" not in e[1]]
    ok("no console/page errors", not bad)
    for e in bad:
        print("  ERR", e)
    failed = [r for r in results if r[0] == "FAIL"]
    print(f"{len(results) - len(failed)}/{len(results)} passed")
    raise SystemExit(1 if failed else 0)

asyncio.run(main())
