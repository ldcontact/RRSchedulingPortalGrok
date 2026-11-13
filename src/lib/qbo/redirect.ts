import { NextResponse } from "next/server";

/** Same-origin redirect with a relative Location, so it never depends on the server's idea of its host name. */
export function localRedirect(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("localRedirect needs a same-origin path");
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}
