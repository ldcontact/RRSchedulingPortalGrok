#!/usr/bin/env python3
"""Idempotent Monday WHE -> sales_deals importer for production (or a local DB).

Read-only to Monday: reads snapshot files only (default /workspace/sales-import/raw).
Never calls the Monday API. Default is a dry run (no writes).

  python3 scripts/import_monday_sales_prod.py
  python3 scripts/import_monday_sales_prod.py --data-dir /workspace/sales-import --apply --allow-prod

Requires DATABASE_URL or SUPABASE_DB_URL only for --apply. Do not print the URL.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DATA_DIR = Path("/workspace/sales-import")
DATA_DIR = DEFAULT_DATA_DIR

BOARD_PIPELINE = {
    "singlefamily - project tracker  whe": "single_family_whe",
    "singlefamily - project tracker whe": "single_family_whe",
    "multifamily -  project tracker  whe": "multifamily_whe",
    "multifamily - project tracker  whe": "multifamily_whe",
    "multifamily - project tracker whe": "multifamily_whe",
}
GROUP_STAGE = {
    "potential lead": "potential_lead",
    "contacted comed verification": "contacted_comed",
    "declined by projects": "declined",
    "ready for assessment": "ready_for_assessment",
    "assessment scheduled": "assessment_scheduled",
    "assessment completed": "assessment_completed",
    "rise - project assessment data entered": "rise_data_entered",
    "approved - ready to schedule": "approved_ready",
    "job scheduled": "project_scheduled",
    "project scheduled": "project_scheduled",
    "job completed": "project_completed",
    "project completed": "project_completed",
    "city permit final pending": "permit_pending",
    "city permit final completed": "permit_final",
    "project not feasible": "not_feasible",
}
# Maps Monday owner names to emails. Profile UUIDs are resolved at apply time.
OWNER_EMAILS = {
    "luke dlugosz": "luke@retrofitrebates.com",
    "aaron ozrovitz": "aaron@retrofitrebates.com",
    "mariusz bartnik": "mario@squarepropertyservices.com",
    "ronan o'connor": "ronan@squarepropertyservices.com",
    "ronan o’connor": "ronan@squarepropertyservices.com",
    "terry lazar": "terry@retrofitrebates.com",
    "alexander miller": "alexander@retrofitrebates.com",
    "marek maksimowicz": "mark@retrofitrebates.com",
    "mark maksimowicz": "mark@retrofitrebates.com",
    "matthew dlugosz": "matthew@retrofitrebates.com",
}
SKIP_OWNERS = {"deleted outdated pending user", "deleted user", ""}

def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())

def as_text(val) -> str | None:
    if val is None or val == "":
        return None
    if isinstance(val, str):
        return val.strip() or None
    if isinstance(val, dict):
        for k in ("phone", "email", "text", "value", "name"):
            if val.get(k):
                return str(val[k]).strip() or None
    return str(val).strip() or None

def looks_like_email(s: str | None) -> bool:
    return bool(s and re.fullmatch(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", s.strip(), re.I))

def looks_like_phone(s: str | None) -> bool:
    if not s:
        return False
    digits = re.sub(r"\D", "", s)
    if not (10 <= len(digits) <= 11):
        return False
    return bool(re.fullmatch(r"[\d\-+().\s]+", s.strip()))

def format_phone(val) -> str | None:
    s = as_text(val)
    if not s:
        return None
    digits = re.sub(r"\D", "", s)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return f"{digits[0:3]}-{digits[3:6]}-{digits[6:10]}"
    return s if looks_like_phone(s) else None

def parse_owners(val) -> list[str]:
    if not val:
        return []
    raw: list[str] = []
    if isinstance(val, list):
        for x in val:
            if isinstance(x, dict):
                raw.append(str(x.get("name") or x.get("text") or ""))
            else:
                raw.append(str(x))
    else:
        raw = [part.strip() for part in str(val).split(",")]
    out: list[str] = []
    for name in raw:
        if norm(name) in SKIP_OWNERS:
            continue
        if name and name not in out:
            out.append(name)
    return out

def contact_fields(primary: dict | None, rels: list, deal_title: str) -> tuple[str | None, str | None, str | None]:
    """Phone into phone, email into email, human name into name."""
    raw_name = (primary or {}).get("name") or (rels[0].get("name") if rels else None)
    raw_name = as_text(raw_name)
    phone = format_phone((primary or {}).get("phone"))
    email = as_text((primary or {}).get("email"))
    if looks_like_email(email) is False:
        email = None
    if not phone and looks_like_phone(raw_name):
        phone = format_phone(raw_name)
    if not email and looks_like_email(raw_name):
        email = raw_name
    if raw_name and not looks_like_phone(raw_name) and not looks_like_email(raw_name):
        name = raw_name
    elif deal_title and not looks_like_phone(deal_title):
        name = deal_title
    else:
        name = raw_name if raw_name and not looks_like_phone(raw_name) else None
    return name, phone, email

def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

def nid() -> str:
    return str(uuid.uuid4())

def parse_location(text: str | None):
    if not text:
        return dict(address=None, city=None, state=None, zip=None)
    # strip country
    t = re.sub(r",?\s*USA$", "", text.strip(), flags=re.I)
    parts = [p.strip() for p in t.split(",") if p.strip()]
    zipm = re.search(r"\b(\d{5})(?:-\d{4})?\b", t)
    z = zipm.group(1) if zipm else None
    state = None
    city = None
    address = t
    if len(parts) >= 3:
        last = parts[-1]
        st = re.sub(r"\d", "", last).strip()
        state = st if len(st) <= 3 else "IL"
        city = parts[-2]
        address = ", ".join(parts[:-2])
    elif len(parts) == 2:
        address, city = parts[0], parts[1]
        state = "IL"
    return dict(address=address or t, city=city, state=state or "IL", zip=z)

def parse_date(val) -> str | None:
    if not val:
        return None
    if isinstance(val, dict):
        val = val.get("date") or val.get("from") or val.get("start")
    s = str(val)
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else None

def parse_priority(val) -> tuple[str, str | None]:
    if val is None or val == "":
        return "Medium", "missing"
    if isinstance(val, str) and val in ("High", "Medium", "Low"):
        return val, None
    if isinstance(val, dict):
        # index 5 on this board is not a current High/Medium/Low label
        if val.get("index") in (0,) or val.get("label") == "High":
            return "High", "index-mapped"
        if val.get("index") in (2,) or val.get("label") == "Low":
            return "Low", "index-mapped"
        if val.get("index") in (1,) or val.get("label") == "Medium":
            return "Medium", "index-mapped"
        return "Medium", f"unrecognized status9 {val}"
    return "Medium", f"unrecognized status9 {val!r}"

def load_board(name: str):
    return json.loads((DATA_DIR / "raw" / f"{name}.json").read_text())

def contact_index(contacts_board):
    by_id = {}
    for it in contacts_board["items"]:
        cv = it.get("column_values") or {}
        deals = []
        for rel in cv.get("connect_boards") or []:
            deals.append({"id": str(rel.get("id")), "name": rel.get("name"), "board_id": str((rel.get("board") or {}).get("id") or "")})
        by_id[str(it["id"])] = {
            "id": str(it["id"]),
            "name": it.get("name"),
            "type": cv.get("status"),
            "email": cv.get("email"),
            "company": cv.get("text8"),
            "phone": cv.get("phone"),
            "title": cv.get("title5"),
            "comments": cv.get("long_text4"),
            "deals": deals,
        }
    return by_id

def map_deal(board, item, contacts):
    name = board["board"]["name"]
    pipeline = BOARD_PIPELINE.get(norm(name))
    group = (item.get("group") or {}).get("title") or ""
    stage = GROUP_STAGE.get(norm(group))
    cv = item.get("column_values") or {}
    loc = parse_location(cv.get("location") if isinstance(cv.get("location"), str) else None)
    if isinstance(cv.get("location"), dict):
        loc = parse_location(cv["location"].get("address") or cv["location"].get("text"))
    pri, pri_note = parse_priority(cv.get("status9"))
    owners = parse_owners(cv.get("person"))
    primary_owner = owners[0] if owners else None
    owner_email = OWNER_EMAILS.get(norm(primary_owner), None) if primary_owner else None
    owner = ", ".join(owners) if owners else None
    rels = cv.get("link_to_contacts_") or []
    matched = []
    unmatched_rel = []
    for rel in rels:
        cid = str(rel.get("id"))
        if cid in contacts:
            matched.append(contacts[cid])
        else:
            unmatched_rel.append({"id": cid, "name": rel.get("name")})
    primary = matched[0] if matched else None
    contact_name, contact_phone, contact_email = contact_fields(primary, rels, item.get("name") or "")
    opened = parse_date(cv.get("date1")) or (item.get("created_at") or "")[:10]
    deal = {
        "id": f"mon-{item['id']}",
        "pipeline_slug": pipeline,
        "stage_slug": stage,
        "title": item.get("name") or "Untitled deal",
        "customer_id": None,
        "owner_email": owner_email,
        "owner_id": None,
        "contact_name": contact_name,
        "contact_phone": contact_phone,
        "contact_email": contact_email,
        **loc,
        "lat": None,
        "lng": None,
        "priority": pri,
        "source": "monday",
        "assessment_date": parse_date(cv.get("date_mm13rart")),
        "assessment_starts_at": None,
        "assessment_ends_at": None,
        "scheduled_date": parse_date(cv.get("date_mm2fzg8v")),
        "close_date": parse_date(cv.get("date9")),
        "opened_at": f"{opened}T12:00:00.000Z" if opened else now(),
        "value": 0,
        "est_rebate": 0,
        "converted_project_id": None,
        "monday_item_id": str(item["id"]),
        "monday_board_id": str(board["board"]["id"]),
        "notes": " · ".join(filter(None, [
            f"Monday owners: {owner}" if owner else None,
            f"Primary owner: {primary_owner}" if primary_owner else None,
            f"Contacts: {', '.join(c['name'] for c in matched)}" if matched else None,
        ])) or None,
        "created_at": item.get("created_at") or now(),
        "updated_at": item.get("updated_at") or now(),
    }
    meta = {
        "priority_note": pri_note,
        "unmatched_relations": unmatched_rel,
        "matched_contacts": [c["id"] for c in matched],
        "group": group,
        "owner_name": owner,
        "has_timeline": bool(cv.get("timerange2")),
        "deal_length_formula": cv.get("formula"),
    }
    return deal, meta, pipeline, stage, group


PROD_URL_HINTS = (
    "tsvjugacbiqkjqazixlv",
    "suovpxjxqywqtqabkdvp",
    "db.tsvjugacbiqkjqazixlv.supabase.co",
    "suovpxjxqywqtqabkdvp.supabase.co",
)

DEAL_COLUMNS = [
    "pipeline_slug", "stage_slug", "title", "owner_id", "contact_name", "contact_phone",
    "contact_email", "address", "city", "state", "zip", "priority", "source",
    "assessment_date", "scheduled_date", "close_date", "opened_at", "value", "est_rebate",
    "monday_item_id", "monday_board_id", "notes",
]


def looks_like_prod(url: str) -> bool:
    u = (url or "").lower()
    return any(h.lower() in u for h in PROD_URL_HINTS)


def collect(data_dir: Path):
    global DATA_DIR
    DATA_DIR = data_dir
    sf = load_board("single_family_whe")
    mf = load_board("multifamily_whe")
    contacts = contact_index(load_board("my_contacts"))
    deals = []
    skipped = []
    unmapped_owners = Counter()
    stage_counts = Counter()
    for board in (sf, mf):
        for item in board["items"]:
            deal, meta, pipeline, stage, group = map_deal(board, item, contacts)
            if not pipeline or not stage:
                skipped.append({
                    "monday_item_id": str(item.get("id")),
                    "title": item.get("name"),
                    "group": group,
                    "reason": "unmapped pipeline or stage",
                })
                continue
            stage_counts[f"{pipeline}:{stage}"] += 1
            if deal.get("owner_email") is None and meta.get("owner_name"):
                unmapped_owners[str(meta["owner_name"])] += 1
            deals.append(deal)
    return {
        "deals": deals,
        "skipped": skipped,
        "unmapped_owners": dict(unmapped_owners),
        "stage_counts": dict(stage_counts),
        "snapshot_counts": {
            "single_family_whe": len(sf["items"]),
            "multifamily_whe": len(mf["items"]),
        },
    }


def connect(url: str):
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as e:
        raise SystemExit("psycopg is required for --apply. Install with: pip install 'psycopg[binary]'") from e
    return psycopg.connect(url, row_factory=dict_row)


def load_profiles(conn):
    with conn.cursor() as cur:
        cur.execute(
            "select id, lower(email) as email, full_name, role::text as role, active, deleted_at is not null as deleted from public.profiles"
        )
        rows = cur.fetchall()
    return {r["email"]: r for r in rows}


def plan_rows(deals, profiles):
    planned = []
    missing_owner_profiles = Counter()
    for d in deals:
        email = (d.get("owner_email") or "").lower() or None
        prof = profiles.get(email) if email else None
        if email and not prof:
            missing_owner_profiles[email] += 1
        owner_id = None
        if prof and not prof["deleted"] and prof["active"]:
            owner_id = str(prof["id"])
        row = {k: d.get(k) for k in DEAL_COLUMNS}
        row["owner_id"] = owner_id
        row["source"] = "monday"
        planned.append(row)
    return planned, missing_owner_profiles


def existing_keys(conn):
    with conn.cursor() as cur:
        cur.execute("select monday_board_id, monday_item_id, id, converted_project_id from public.sales_deals where monday_item_id is not null")
        return {(r["monday_board_id"], r["monday_item_id"]): r for r in cur.fetchall()}


def apply_rows(conn, rows, existing, update_existing: bool):
    inserted = updated = skipped = 0
    with conn.cursor() as cur:
        cur.execute(
            "insert into public.sales_import_batches (source, board_name, item_count, skipped_count, notes) values (%s,%s,%s,%s,%s) returning id",
            (
                "monday_snapshot",
                "single_family_whe+multifamily_whe",
                len(rows),
                0,
                "idempotent import from local Monday snapshots; Monday was not written",
            ),
        )
        batch_id = cur.fetchone()["id"]
        for row in rows:
            key = (row["monday_board_id"], row["monday_item_id"])
            if key in existing:
                prev = existing[key]
                if not update_existing or prev["converted_project_id"]:
                    skipped += 1
                    continue
                cur.execute(
                    """
                    update public.sales_deals set
                      pipeline_slug=%(pipeline_slug)s, stage_slug=%(stage_slug)s, title=%(title)s,
                      owner_id=coalesce(sales_deals.owner_id, %(owner_id)s),
                      contact_name=%(contact_name)s, contact_phone=%(contact_phone)s, contact_email=%(contact_email)s,
                      address=%(address)s, city=%(city)s, state=%(state)s, zip=%(zip)s,
                      priority=%(priority)s, assessment_date=%(assessment_date)s,
                      scheduled_date=%(scheduled_date)s, close_date=%(close_date)s,
                      notes=%(notes)s, updated_at=now()
                    where monday_board_id=%(monday_board_id)s and monday_item_id=%(monday_item_id)s
                      and converted_project_id is null and source='monday'
                    """,
                    row,
                )
                updated += 1
            else:
                cur.execute(
                    """
                    insert into public.sales_deals (
                      pipeline_slug, stage_slug, title, owner_id, contact_name, contact_phone,
                      contact_email, address, city, state, zip, priority, source,
                      assessment_date, scheduled_date, close_date, opened_at, value, est_rebate,
                      monday_item_id, monday_board_id, notes
                    ) values (
                      %(pipeline_slug)s, %(stage_slug)s, %(title)s, %(owner_id)s, %(contact_name)s, %(contact_phone)s,
                      %(contact_email)s, %(address)s, %(city)s, %(state)s, %(zip)s, %(priority)s, %(source)s,
                      %(assessment_date)s, %(scheduled_date)s, %(close_date)s, %(opened_at)s, %(value)s, %(est_rebate)s,
                      %(monday_item_id)s, %(monday_board_id)s, %(notes)s
                    )
                    """,
                    row,
                )
                inserted += 1
        cur.execute(
            "update public.sales_import_batches set item_count=%s, skipped_count=%s where id=%s",
            (inserted + updated, skipped, batch_id),
        )
    return {"inserted": inserted, "updated": updated, "skipped": skipped}


def main():
    ap = argparse.ArgumentParser(description="Idempotent Monday snapshot import into sales_deals. Never writes to Monday.")
    ap.add_argument("--data-dir", default=str(DEFAULT_DATA_DIR), help="Directory containing raw/*.json snapshots")
    ap.add_argument("--apply", action="store_true", help="Write to the database. Default is dry-run.")
    ap.add_argument("--allow-prod", action="store_true", help="Required if DATABASE_URL looks like a known production project.")
    ap.add_argument("--update-existing", action="store_true", help="Also refresh unconverted Monday-sourced deals already in the table.")
    args = ap.parse_args()

    bundled = collect(Path(args.data_dir))
    deals = bundled["deals"]
    print(json.dumps({
        "mode": "apply" if args.apply else "dry-run",
        "snapshot_counts": bundled["snapshot_counts"],
        "mapped": len(deals),
        "skipped_unmapped_stage": bundled["skipped"],
        "unmapped_owners": bundled["unmapped_owners"],
        "stage_counts": bundled["stage_counts"],
        "monday_writes": 0,
        "note": "Monday is not contacted. Existing snapshots only.",
    }, indent=2, default=str))

    if not args.apply:
        emails = sorted({d.get("owner_email") for d in deals if d.get("owner_email")})
        print("Owner emails that will be resolved against profiles on --apply:")
        for e in emails:
            print(" ", e)
        return

    url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL_UNPOOLED")
    if not url:
        raise SystemExit("DATABASE_URL (or SUPABASE_DB_URL) is required for --apply. The URL is not printed.")
    if looks_like_prod(url) and not args.allow_prod:
        raise SystemExit("This database URL matches a known production project. Re-run with --allow-prod only after Luke says go.")

    conn = connect(url)
    try:
        profiles = load_profiles(conn)
        planned, missing = plan_rows(deals, profiles)
        existing = existing_keys(conn)
        would_insert = would_update = would_skip = 0
        for row in planned:
            key = (row["monday_board_id"], row["monday_item_id"])
            if key in existing:
                prev = existing[key]
                if not args.update_existing or prev["converted_project_id"]:
                    would_skip += 1
                else:
                    would_update += 1
            else:
                would_insert += 1
        print(json.dumps({
            "profiles_resolved": sum(1 for r in planned if r["owner_id"]),
            "owner_emails_missing_profiles": dict(missing),
            "already_in_db": would_skip,
            "to_insert": would_insert,
            "to_update": would_update,
        }, indent=2))
        result = apply_rows(conn, planned, existing, args.update_existing)
        conn.commit()
        print(json.dumps({"applied": result}, indent=2))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
