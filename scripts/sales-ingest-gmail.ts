/**
 * Pull inbound lead email through the existing Gmail integration and POST
 * parsed messages to the local ingest endpoint. Dry-run by default.
 *
 *   npx tsx scripts/sales-ingest-gmail.ts --dry-run
 *
 * Does not create new API keys. If Gmail read is not configured, the script exits
 * with a clear message. A future wiring can pass the same parsed payload to
 * POST /api/sales/inbound-email with x-rr-webhook-secret.
 */
async function main() {
  const dry = !process.argv.includes("--apply");
  console.log("Inbound Gmail ingest looks at the existing Gmail client used for outgoing mail.");
  console.log("Reading the mailbox is not wired yet (the current module is send-only).");
  console.log("Until then: forward a message body to POST /api/sales/inbound-email.");
  console.log(dry ? "Dry-run only; nothing was ingested." : "Apply was requested, but there is no mailbox reader to run.");
}

main();
