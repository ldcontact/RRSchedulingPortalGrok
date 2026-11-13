#!/usr/bin/env python3
"""Idempotent Monday item-updates importer for team_updates.

Reads the saved board update snapshots (default /workspace/sales-import/raw/updates).
Never calls the Monday API and never writes unless you pass --apply --allow-prod.
Default is a dry run that prints per-board and per-deal counts, including a
Karla Gonzalez spot-check.

  python3 scripts/import_monday_updates.py
  python3 scripts/import_monday_updates.py --deals-json /path/to/deals.json
  python3 scripts/import_monday_updates.py --apply --allow-prod

--deals-json is a list of {id, monday_item_id, converted_project_id?} used to
match updates to existing sales deals. If DATABASE_URL or SUPABASE_DB_URL is
set, the dry run will also count matches against that database (read-only
SELECT). The URL is never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

DEFAULT_DATA_DIR = Path("/workspace/sales-import/raw/updates")
BOARD_FILES = {
    "3747287195": ("Single Family WHE", ["sf_all.json", "sf1.json", "sf_board_p1.json"]),
    "18406327744": ("Multifamily WHE", ["mf_all.json", "mf1.json"]),
}

MONDAY_AUTHOR_EMAILS = {
    "38133299": "aaron@retrofitrebates.com",
    "100118246": "mario@squarepropertyservices.com",
    "100546905": "ronan@squarepropertyservices.com",
    "99348728": "alexander@retrofitrebates.com",
    "37780942": "luke@retrofitrebates.com",
    "38133270": "terryl@retrofitrebates.com",
}


def load_updates(data_dir: Path, board_id: str) -> list[dict]:
    names = BOARD_FILES[board_id][1]
    for name in names:
        p = data_dir / name
        if p.exists():
            raw = json.loads(p.read_text())
            rows = raw if isinstance(raw, list) else raw.get("updates") or []
            return rows
    return []


def flatten(updates: list[dict], board_id: str) -> list[dict]:
    rows = []
    for u in updates:
        item_id = str(u.get("item_id") or u.get("itemId") or "")
        if not item_id:
            continue
        def one(post, parent=None):
            creator = post.get("creator") or {}
            cid = str(creator.get("id") or "")
            body = (post.get("text_body") or "").strip()
            assets = []
            for a in post.get("assets") or []:
                assets.append({
                    "name": a.get("name") or "attachment",
                    "url": a.get("public_url") or a.get("url"),
                    "monday_asset_id": str(a["id"]) if a.get("id") is not None else None,
                    "size_bytes": a.get("file_size"),
                })
            rows.append({
                "monday_update_id": str(post["id"]),
                "monday_item_id": item_id,
                "monday_board_id": board_id,
                "parent_monday_id": parent,
                "author_name": creator.get("name") or "Monday user",
                "author_email": (creator.get("email") or MONDAY_AUTHOR_EMAILS.get(cid) or "").lower() or None,
                "body": body,
                "created_at": post.get("created_at"),
                "assets": assets,
            })
        one(u, None)
        for r in u.get("replies") or []:
            one(r, str(u["id"]))
    # unique by monday_update_id
    seen = {}
    for r in rows:
        seen[r["monday_update_id"]] = r
    return list(seen.values())


def load_deals_json(path: Path | None) -> dict[str, dict]:
    if not path or not path.exists():
        return {}
    raw = json.loads(path.read_text())
    deals = raw.get("deals") if isinstance(raw, dict) else raw
    out = {}
    for d in deals or []:
        mid = d.get("monday_item_id")
        if mid:
            out[str(mid)] = d
    return out


def load_deals_db() -> dict[str, dict]:
    url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not url:
        return {}
    try:
        import psycopg
    except ImportError:
        print("psycopg not installed; skipping live database match", file=sys.stderr)
        return {}
    with psycopg.connect(url, autocommit=True) as conn:
        conn.execute("set default_transaction_read_only = on")
        with conn.cursor() as cur:
            cur.execute(
                "select id, monday_item_id, converted_project_id, title from public.sales_deals where monday_item_id is not null"
            )
            rows = cur.fetchall()
    return {str(r[1]): {"id": str(r[0]), "monday_item_id": str(r[1]), "converted_project_id": str(r[2]) if r[2] else None, "title": r[3]} for r in rows}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--deals-json", type=Path, default=None)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--allow-prod", action="store_true")
    args = ap.parse_args()
    if args.apply and not args.allow_prod:
        print("Refusing to apply without --allow-prod. Default is dry-run.", file=sys.stderr)
        return 2
    if args.apply:
        print("Apply is implemented only after Luke approves go-live. This run will not write.", file=sys.stderr)
        # Still do not write, even with both flags, until go-live is approved in this branch task.
        # The upsert SQL is documented below for the later card.
        args.apply = False

    deals = load_deals_json(args.deals_json)
    db_deals = load_deals_db()
    if db_deals:
        deals = {**deals, **db_deals}
        print(f"Matched against {len(db_deals)} sales_deals with monday_item_id (read-only).")
    elif args.deals_json:
        print(f"Loaded {len(deals)} deals from JSON.")
    else:
        print("No deals list provided (pass --deals-json or set DATABASE_URL). Counts below are from the Monday snapshots only.")

    grand_u = grand_r = 0
    unmatched_items = []
    print()
    for board_id, (label, _) in BOARD_FILES.items():
        updates = load_updates(args.data_dir, board_id)
        rows = flatten(updates, board_id)
        tops = [r for r in rows if not r["parent_monday_id"]]
        replies = [r for r in rows if r["parent_monday_id"]]
        by_item = defaultdict(lambda: {"updates": 0, "replies": 0})
        for r in rows:
            if r["parent_monday_id"]:
                by_item[r["monday_item_id"]]["replies"] += 1
            else:
                by_item[r["monday_item_id"]]["updates"] += 1
        matched = {i: c for i, c in by_item.items() if i in deals} if deals else dict(by_item)
        unmatched = [i for i in by_item if deals and i not in deals]
        unmatched_items.extend((board_id, i) for i in unmatched)
        asset_n = sum(len(r["assets"]) for r in rows)
        print(f"== {label} ({board_id}) ==")
        print(f"  top-level updates: {len(tops)}")
        print(f"  replies: {len(replies)}")
        print(f"  total posts: {len(rows)}")
        print(f"  items with updates: {len(by_item)}")
        if deals:
            print(f"  matched to imported deals: {len(matched)}")
            print(f"  unmatched item ids: {len(unmatched)}" + (f" {unmatched}" if unmatched else ""))
        print(f"  file assets on posts: {asset_n}")
        grand_u += len(tops)
        grand_r += len(replies)

    print()
    print(f"GRAND TOTAL  top-level={grand_u}  replies={grand_r}  posts={grand_u+grand_r}")

    karla_id = "11633298670"
    karla_rows = []
    for board_id, _ in BOARD_FILES.items():
        karla_rows.extend([r for r in flatten(load_updates(args.data_dir, board_id), board_id) if r["monday_item_id"] == karla_id])
    print()
    print("== Karla Gonzalez spot-check (item 11633298670) ==")
    if deals and karla_id not in deals:
        print("  Not found in the deals list.")
    else:
        if deals:
            d = deals[karla_id]
            print(f"  deal id: {d.get('id')}  title: {d.get('title')}  converted_project_id: {d.get('converted_project_id')}")
        tops = [r for r in karla_rows if not r["parent_monday_id"]]
        replies = [r for r in karla_rows if r["parent_monday_id"]]
        print(f"  {len(tops)} questions, {len(replies)} replies (threaded under their question)")
        for r in sorted(tops, key=lambda x: x["created_at"] or "", reverse=True):
            kids = [x for x in replies if x["parent_monday_id"] == r["monday_update_id"]]
            print(f"  - {r['created_at']}  {r['author_name']}  replies={len(kids)}")
            print(f"    {((r['body'] or '')[:120]).replace(chr(10), ' / ')}")
            for k in kids:
                print(f"      ↳ {k['created_at']}  {k['author_name']}: {((k['body'] or '')[:100]).replace(chr(10), ' / ')}")

    if unmatched_items:
        print()
        print("Unmatched Monday items (not in the 129-deal import, likely deleted or new):")
        for b, i in unmatched_items:
            print(f"  board {b} item {i}")

    print()
    print("No writes performed." if not args.apply else "Writes were requested but are blocked until go-live.")
    print("Apply later (do not run now): upsert public.team_updates on monday_update_id, then assets, no notifications for historical import.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
