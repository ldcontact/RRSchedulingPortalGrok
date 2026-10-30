// Applies supabase/migrations to an in-memory Postgres 17 (PGlite, WASM) with
// minimal Supabase auth/storage stubs, then runs the RLS test suite.
// Usage: npm run test:db
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const db = new PGlite();
const run = async (file) => {
  await db.exec(readFileSync(file, "utf8"), {
    onNotice: (n) => console.log("  " + n.message),
  });
};
try {
  await run("supabase/tests/supabase_stubs.sql");
  for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    console.log(`applying ${f}`);
    await run(`supabase/migrations/${f}`);
  }
  console.log("running RLS tests");
  await run("supabase/tests/rls_test.sql");
  console.log("ALL RLS TESTS PASSED");
} catch (e) {
  console.error("\nDB TEST FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
