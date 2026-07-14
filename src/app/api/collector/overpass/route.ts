/**
 * POST /api/collector/overpass
 * -------------------------------------------------------------
 * Server-side proxy za OpenStreetMap Overpass API (besplatno).
 *
 * Overpass tehnički dozvoljava CORS, ali poziv vodimo kroz server da bismo:
 *  - centralno poštovali rate limit (Overpass moli max ~1 upit/s),
 *  - slali korektan User-Agent (Overpass ga zahteva po pravilima korišćenja),
 *  - imali jedinstven oblik odgovora kao i Google proxy.
 *
 * Telo zahteva (JSON):
 *   { query: string }   // gotov Overpass QL upit (gradi ga OverpassTool)
 *
 * Odgovor:
 *   { success: true, elements: OverpassElement[] }
 *   { success: false, error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { guardCollectorRoute } from "@/lib/api/collector-guard";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/** Overpass preporučuje najviše ~1 upit u sekundi. */
const MIN_INTERVAL_MS = 1000;
let lastCallAt = 0;

/** Bezbednosni limit dužine upita da se spreči zloupotreba. */
const MAX_QUERY_LEN = 8000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // F2-3: authenticate + rate-limit before proxying to OSM Overpass
  const guard = await guardCollectorRoute(req, "overpass");
  if (!("userId" in guard)) return guard; // 401/429 short-circuit

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Neispravan JSON u telu zahteva." },
      { status: 400 },
    );
  }

  const query = typeof body.query === "string" ? body.query : "";
  if (!query.trim()) {
    return NextResponse.json(
      { success: false, error: "Nedostaje `query` (Overpass QL)." },
      { status: 400 },
    );
  }
  if (query.length > MAX_QUERY_LEN) {
    return NextResponse.json(
      { success: false, error: "Upit je predugačak." },
      { status: 400 },
    );
  }

  // Sprovedi minimalni interval između poziva (1s).
  const now = Date.now();
  const sinceLast = now - lastCallAt;
  if (sinceLast < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - sinceLast);
  }
  lastCallAt = Date.now();

  try {
    const res = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "serbia-rural-tourism/1.0 (Agent Studio Collector)",
      },
      body: `data=${encodeURIComponent(query)}`,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        {
          success: false,
          error: `Overpass HTTP ${res.status}. ${text.slice(0, 200)}`,
        },
        { status: 200 },
      );
    }

    const data = (await res.json()) as { elements?: unknown[] };
    return NextResponse.json({
      success: true,
      elements: Array.isArray(data.elements) ? data.elements : [],
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `Mrežna greška ka Overpass: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

/** Pauza u milisekundama. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
