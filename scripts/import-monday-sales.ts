/**
 * Read-only Monday → local/staging Sales import.
 * Never writes to Monday. Refuses production Supabase URLs.
 *
 *   npx tsx scripts/import-monday-sales.ts --source=fixture --target=mock
 *   npx tsx scripts/import-monday-sales.ts --source=file --file=path.json --target=stdout
 * Mapping is also covered by src/lib/sales/policy.test.ts and scripts/fixtures/monday-sample.json.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mapMondayBoard, type MondayBoardSnapshot } from "../src/lib/sales/import-monday";

const PROD_HINTS = ["rr-scheduling-portal", "supabase.co"]; // conservative: still require explicit staging flag

function arg(name: string, fallback?: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function looksLikeProd(url: string | undefined) {
  if (!url) return false;
  // Staging/local URLs should be passed as --target=staging with SALES_IMPORT_TARGET=staging.
  // Any default "production" project is refused. This is a hard stop until go-live.
  if (process.env.SALES_IMPORT_ALLOW_PROD === "1") return false;
  const prod = process.env.SALES_PROD_SUPABASE_URL;
  if (prod && url === prod) return true;
  // If the caller points at the live app's known production project, refuse.
  if (/kqvygbqfvqyjyqvjqyjy|prod/i.test(url)) return true;
  void PROD_HINTS;
  return false;
}

async function main() {
  const source = arg("source", "fixture");
  const target = arg("target", "stdout");
  const file = arg("file", resolve(process.cwd(), "scripts/fixtures/monday-sample.json"));

  if (target === "prod") {
    console.error("Refusing to import into production. Import stays on local/staging until go-live.");
    process.exit(2);
  }
  if (looksLikeProd(process.env.NEXT_PUBLIC_SUPABASE_URL) && target !== "mock" && target !== "stdout") {
    console.error("This Supabase URL looks like production. Import aborted.");
    process.exit(2);
  }

  let board: MondayBoardSnapshot;
  if (source === "monday") {
    console.error("Live Monday pull is not wired in this script. Export a board snapshot and use --source=file. (Read-only; this tool never writes to Monday.)");
    process.exit(2);
  }
  board = JSON.parse(readFileSync(file, "utf8")) as MondayBoardSnapshot;
  const { deals, skipped } = mapMondayBoard(board);
  console.log(`Mapped ${deals.length} deals, skipped ${skipped.length}.`);
  for (const s of skipped) console.log(`  skip ${s.id} ${s.name}: ${s.error}`);

  if (target === "stdout") {
    console.log(JSON.stringify(deals, null, 2));
    return;
  }
  if (target === "mock") {
    process.env.NEXT_PUBLIC_RR_MOCK_MODE = "1";
    const { mutateSales, newId, loadSales } = await import("../src/lib/sales/mock-store");
    const { imported, skipped: dupes } = await (async () => {
      // Direct store write so the CLI does not need a login cookie.
      let importedN = 0, skippedN = 0;
      const { now = () => new Date().toISOString() } = {};
      mutateSales((db) => {
        void loadSales;
        for (const row of deals) {
          if (db.deals.some((d) => d.monday_item_id === row.monday_item_id && d.monday_board_id === row.monday_board_id)) {
            skippedN += 1; continue;
          }
          db.deals.push({
            id: newId(), pipeline_slug: row.pipeline_slug, stage_slug: row.stage_slug, title: row.title,
            customer_id: null, owner_id: null, contact_name: row.contact_name, contact_phone: row.contact_phone,
            contact_email: null, address: row.address, city: row.city, state: row.state, zip: row.zip,
            lat: null, lng: null, priority: row.priority, source: "monday",
            assessment_date: row.assessment_date, assessment_starts_at: null, assessment_ends_at: null,
            scheduled_date: row.scheduled_date, close_date: row.close_date,
            opened_at: row.opened_at ? `${row.opened_at}T12:00:00.000Z` : now(),
            value: 0, est_rebate: 0, converted_project_id: null,
            monday_item_id: row.monday_item_id, monday_board_id: row.monday_board_id,
            notes: row.owner_name ? `Monday owner: ${row.owner_name}` : null,
            created_at: now(), updated_at: now(),
          });
          importedN += 1;
        }
      });
      return { imported: importedN, skipped: skippedN };
    })();
    console.log(`Wrote ${imported} deals to .mock-sales.json (${dupes} already present).`);
    return;
  }
  console.error(`Unknown target ${target}. Use stdout or mock.`);
  process.exit(2);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
