/**
 * One-shot MyGeotab connectivity check.
 *
 * Authenticates with GEOTAB_DATABASE, GEOTAB_USERNAME, and GEOTAB_PASSWORD,
 * then prints only the device count and names. Never prints credentials,
 * session IDs, or request bodies.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/geotab-check.mts
 *
 * Self-contained so it can run under Node without a bundler (the app client
 * lives in src/lib/geotab and uses extensionless imports).
 */

type Creds = { database: string; userName: string; sessionId?: string; password?: string };

function missingKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.GEOTAB_DATABASE?.trim()) missing.push("GEOTAB_DATABASE");
  if (!process.env.GEOTAB_USERNAME?.trim()) missing.push("GEOTAB_USERNAME");
  if (!process.env.GEOTAB_PASSWORD) missing.push("GEOTAB_PASSWORD");
  return missing;
}

function serverHost(): string {
  return (process.env.GEOTAB_SERVER?.trim() || "my.geotab.com").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function resolveServer(current: string, path: unknown): string {
  if (typeof path !== "string" || !path || path === "ThisServer") return current;
  return path.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function deviceName(d: unknown): string {
  if (d && typeof d === "object") {
    const o = d as { name?: unknown; Name?: unknown; id?: unknown };
    if (typeof o.name === "string" && o.name) return o.name;
    if (typeof o.Name === "string" && o.Name) return o.Name;
    if (typeof o.id === "string" && o.id) return o.id;
  }
  return "(unnamed)";
}

async function main() {
  const missing = missingKeys();
  if (missing.length) {
    console.error(`Missing ${missing.join(", ")}. Set them and try again.`);
    process.exit(1);
  }
  const password = process.env.GEOTAB_PASSWORD as string;
  const database = process.env.GEOTAB_DATABASE!.trim();
  const userName = process.env.GEOTAB_USERNAME!.trim();
  let server = serverHost();

  const call = async (method: string, params: Record<string, unknown>) => {
    const res = await fetch(`https://${server}/apiv1`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ method, params }),
    });
    const json = (await res.json()) as { result?: unknown; error?: { message?: string; name?: string } };
    if (json.error) throw new Error(json.error.message || json.error.name || "Geotab request failed");
    return json.result;
  };

  const login = await call("Authenticate", { database, userName, password }) as {
    path?: string;
    credentials?: { database: string; userName: string; sessionId: string };
  };
  if (!login?.credentials?.sessionId) throw new Error("Geotab authentication failed");
  server = resolveServer(server, login.path);
  const credentials: Creds = {
    database: login.credentials.database,
    userName: login.credentials.userName,
    sessionId: login.credentials.sessionId,
  };
  const devices = await call("Get", { typeName: "Device", credentials }) as unknown[];
  const list = Array.isArray(devices) ? devices : [];
  console.log(`Devices: ${list.length}`);
  for (const d of list) console.log(`- ${deviceName(d)}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : "Geotab check failed";
  console.error(msg);
  process.exit(1);
});
