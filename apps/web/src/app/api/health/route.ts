import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Container liveness. Deliberately does not touch the database. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
