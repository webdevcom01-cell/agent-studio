/**
 * POST /api/collector/places
 * -------------------------------------------------------------
 * Server-side proxy za Google Places (klasični web servis).
 *
 * Zašto proxy a ne direktan poziv iz browsera:
 *  1. Google Places Web Service NE podržava CORS — poziv iz pretraživača pada.
 *  2. API ključ ostaje na serveru (ne curi u JS bundle).
 *  3. Rate limiting i osnovni keš se sprovode centralno.
 *
 * Ključ se čita iz process.env.GOOGLE_PLACES_API_KEY. Opciono, klijent
 * može poslati `apiKey` u telu (koristi se samo za taj zahtev), čime se
 * podržava scenario gde korisnik ručno unese ključ u dashboard-u.
 *
 * Telo zahteva (JSON), jedno od:
 *   { op: "searchText",   query: string, region?: string, apiKey?: string }
 *   { op: "searchNearby", lat: number, lng: number, radius: number,
 *                          keyword?: string, type?: string, apiKey?: string }
 *   { op: "getDetails",   placeId: string, apiKey?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { guardCollectorRoute } from "@/lib/api/collector-guard";

const GOOGLE_BASE = "https://maps.googleapis.com/maps/api/place";

/** Maksimalan broj Google upita u sekundi (deli se na celu instancu). */
const MAX_QPS = 5;
const recentCallTimestamps: number[] = [];

/**
 * Jednostavan in-memory rate limiter (klizni prozor 1s).
 * Vraća true ako je upit dozvoljen, false ako je premašen QPS.
 */
function allowCall(): boolean {
  const now = Date.now();
  // izbaci timestampove starije od 1s
  while (recentCallTimestamps.length > 0 && now - recentCallTimestamps[0] > 1000) {
    recentCallTimestamps.shift();
  }
  if (recentCallTimestamps.length >= MAX_QPS) return false;
  recentCallTimestamps.push(now);
  return true;
}

interface GoogleResponse {
  status: string;
  error_message?: string;
  results?: unknown[];
  result?: unknown;
}

/** Polja koja tražimo u Place Details pozivu. */
const DETAILS_FIELDS = [
  "place_id",
  "name",
  "formatted_address",
  "geometry",
  "types",
  "rating",
  "user_ratings_total",
  "formatted_phone_number",
  "international_phone_number",
  "website",
  "photos",
].join(",");

export async function POST(req: NextRequest): Promise<NextResponse> {
  // F2-3: authenticate + rate-limit before proxying to billed Google Places
  const guard = await guardCollectorRoute(req, "places");
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

  const op = typeof body.op === "string" ? body.op : "";
  const apiKey =
    (typeof body.apiKey === "string" && body.apiKey.trim()) ||
    process.env.GOOGLE_PLACES_API_KEY ||
    "";

  if (!apiKey) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Nedostaje Google Places API ključ (GOOGLE_PLACES_API_KEY env ili apiKey u telu).",
      },
      { status: 400 },
    );
  }

  if (!allowCall()) {
    return NextResponse.json(
      { success: false, error: "Rate limit (5 upita/s) premašen, pokušaj ponovo." },
      { status: 429 },
    );
  }

  // Sastavi ciljni URL prema operaciji.
  let url: string;
  try {
    url = buildUrl(op, body, apiKey);
  } catch (e) {
    return NextResponse.json(
      { success: false, error: (e as Error).message },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      // Server-to-server poziv; bez keširanja na nivou fetch-a.
      cache: "no-store",
    });

    const data = (await res.json()) as GoogleResponse;

    // Google vraća HTTP 200 i u slučaju logičke greške — gledamo `status`.
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return NextResponse.json(
        {
          success: false,
          status: data.status,
          error: data.error_message || `Google status: ${data.status}`,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      success: true,
      status: data.status ?? "OK",
      results: data.results ?? [],
      result: data.result ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: `Mrežna greška ka Google Places: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

/**
 * Pravi ciljni Google URL na osnovu operacije i parametara.
 * @throws Error ako su parametri nevalidni
 */
function buildUrl(
  op: string,
  body: Record<string, unknown>,
  apiKey: string,
): string {
  if (op === "searchText") {
    const query = String(body.query ?? "").trim();
    if (!query) throw new Error("searchText: `query` je obavezan.");
    const region = typeof body.region === "string" ? body.region : "rs";
    const p = new URLSearchParams({ query, region, key: apiKey });
    return `${GOOGLE_BASE}/textsearch/json?${p.toString()}`;
  }

  if (op === "searchNearby") {
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const radius = Number(body.radius);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error("searchNearby: `lat`/`lng` moraju biti brojevi.");
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new Error("searchNearby: `radius` mora biti pozitivan broj.");
    }
    const p = new URLSearchParams({
      location: `${lat},${lng}`,
      radius: String(radius),
      key: apiKey,
    });
    if (typeof body.keyword === "string" && body.keyword) p.set("keyword", body.keyword);
    if (typeof body.type === "string" && body.type) p.set("type", body.type);
    return `${GOOGLE_BASE}/nearbysearch/json?${p.toString()}`;
  }

  if (op === "getDetails") {
    const placeId = String(body.placeId ?? "").trim();
    if (!placeId) throw new Error("getDetails: `placeId` je obavezan.");
    const p = new URLSearchParams({
      place_id: placeId,
      fields: DETAILS_FIELDS,
      key: apiKey,
    });
    return `${GOOGLE_BASE}/details/json?${p.toString()}`;
  }

  throw new Error(`Nepoznata operacija: "${op}".`);
}
