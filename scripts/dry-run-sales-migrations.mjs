// Prod-like dry run: apply every migration through speed_round_1, then the
// three unapplied sales migrations, on in-memory Postgres 17 (PGlite).
// Does not touch any remote database.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const db = new PGlite();
const run = async (file) => {
  await db.exec(readFileSync(file, "utf8"), {
    onNotice: (n) => console.log("  " + n.message),
  });
};

const sales = [
  "20261113010000_sales_role.sql",
  "20261113011000_sales_crm.sql",
  "20261113012000_sales_see_all_deals.sql",
];

try {
  await run("supabase/tests/supabase_stubs.sql");
  const all = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  const baseline = all.filter((f) => !sales.includes(f));
  const rest = all.filter((f) => sales.includes(f));
  if (rest.length !== 3) throw new Error(`expected 3 sales migrations, found ${rest.join(", ")}`);

  console.log("=== baseline (already on prod, including speed_round_1) ===");
  for (const f of baseline) {
    console.log(`applying ${f}`);
    await run(`supabase/migrations/${f}`);
  }

  const before = await db.query(`
    select exists(select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
      where typname='user_role' and enumlabel='sales') as has_sales_role,
           to_regclass('public.sales_deals') is not null as has_sales_deals
  `);
  console.log("before sales migrations:", before.rows[0]);

  console.log("=== pending sales migrations (prod-like apply order) ===");
  for (const f of rest) {
    console.log(`applying ${f}`);
    await run(`supabase/migrations/${f}`);
  }

  const after = await db.query(`
    select e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid
     where typname='user_role' order by e.enumsortorder
  `);
  const tables = await db.query(`
    select tablename from pg_tables where schemaname='public' and tablename like 'sales_%' order by 1
  `);
  const fn = await db.query(`
    select pg_get_functiondef(p.oid) as def
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='private' and p.proname='can_see_all_deals'
  `);
  console.log("user_role:", after.rows.map((r) => r.enumlabel).join(", "));
  console.log("sales tables:", tables.rows.map((r) => r.tablename).join(", "));
  const def = fn.rows[0]?.def || "";
  if (!/can_access_sales\(\)/.test(def)) throw new Error("can_see_all_deals does not call can_access_sales()");
  console.log("can_see_all_deals uses can_access_sales: yes");

  // Re-apply should be safe for the enum (IF NOT EXISTS) and seeded pipelines (ON CONFLICT).
  console.log("=== re-apply sales_role and pipeline seed check ===");
  await run("supabase/migrations/20261113010000_sales_role.sql");
  const pipelines = await db.query("select slug from public.sales_pipelines order by sort");
  console.log("pipelines:", pipelines.rows.map((r) => r.slug).join(", "));
  console.log("SALES MIGRATION DRY-RUN PASSED");
} catch (e) {
  console.error("\nSALES MIGRATION DRY-RUN FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
