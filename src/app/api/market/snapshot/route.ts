import { NextResponse } from "next/server";
import { analyzeMarketData, buildGlobalRiskHint } from "@/lib/market/analysis";
import type {
  BinanceDepth,
  BinanceOpenInterest,
  BinancePremiumIndex,
  BinanceTicker,
  DataQuality,
  KlineTuple,
  SnapshotPayload,
  SymbolMarketData,
  SymbolPair,
} from "@/lib/market/types";

const BINANCE_SPOT_BASE = "https://api.binance.com/api/v3";
const BINANCE_FUTURES_BASE = "https://fapi.binance.com/fapi/v1";
const SYMBOLS: SymbolPair[] = ["BTCUSDT", "ETHUSDT"];
const CACHE_TTL_MS = 8_000;
const STALE_TTL_MS = 90_000;
const FETCH_TIMEOUT_MS = 5_000;

let cachedSnapshot: SnapshotPayload | null = null;
let inFlightSnapshot: Promise<SnapshotPayload> | null = null;

function isFresh(snapshot: SnapshotPayload, ttlMs: number): boolean {
  return Date.now() - Date.parse(snapshot.generatedAt) < ttlMs;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`fetch failed ${res.status}: ${url}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function fetchTicker(symbol: SymbolPair): Promise<BinanceTicker> {
  return fetchJson<BinanceTicker>(`${BINANCE_SPOT_BASE}/ticker/24hr?symbol=${symbol}`);
}

function fetchDepth(symbol: SymbolPair): Promise<BinanceDepth> {
  return fetchJson<BinanceDepth>(`${BINANCE_SPOT_BASE}/depth?symbol=${symbol}&limit=100`);
}

function fetchOpenInterest(symbol: SymbolPair): Promise<BinanceOpenInterest> {
  return fetchJson<BinanceOpenInterest>(`${BINANCE_FUTURES_BASE}/openInterest?symbol=${symbol}`);
}

function fetchPremiumIndex(symbol: SymbolPair): Promise<BinancePremiumIndex> {
  return fetchJson<BinancePremiumIndex>(`${BINANCE_FUTURES_BASE}/premiumIndex?symbol=${symbol}`);
}

function fetchKlines(symbol: SymbolPair, interval: "1m" | "5m" | "15m" | "1h", limit: number): Promise<KlineTuple[]> {
  return fetchJson<KlineTuple[]>(`${BINANCE_SPOT_BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
}

async function fetchSymbolData(symbol: SymbolPair): Promise<SymbolMarketData> {
  const [ticker, depth, openInterest, premiumIndex, klines1m, klines5m, klines15m, klines1h] = await Promise.all([
    fetchTicker(symbol),
    fetchDepth(symbol),
    fetchOpenInterest(symbol),
    fetchPremiumIndex(symbol),
    fetchKlines(symbol, "1m", 120),
    fetchKlines(symbol, "5m", 120),
    fetchKlines(symbol, "15m", 120),
    fetchKlines(symbol, "1h", 120),
  ]);

  return {
    ticker,
    depth,
    openInterest,
    premiumIndex,
    klines1m,
    klines5m,
    klines15m,
    klines1h,
  };
}

async function analyzeSymbolSettled(symbol: SymbolPair) {
  try {
    return {
      ok: true as const,
      market: analyzeMarketData(symbol, await fetchSymbolData(symbol)),
    };
  } catch (error) {
    return {
      ok: false as const,
      error: `${symbol}: ${errorMessage(error)}`,
    };
  }
}

async function buildLiveSnapshot(): Promise<SnapshotPayload> {
  const settled = await Promise.all(SYMBOLS.map((symbol) => analyzeSymbolSettled(symbol)));
  const market = settled.flatMap((result) => (result.ok ? [result.market] : []));
  const errors = settled.flatMap((result) => (result.ok ? [] : [result.error]));
  const quality: DataQuality = errors.length === 0 ? "live" : market.length > 0 ? "partial" : "stale";
  const now = new Date().toISOString();

  if (market.length === 0) {
    if (cachedSnapshot && isFresh(cachedSnapshot, STALE_TTL_MS)) {
      return {
        ...cachedSnapshot,
        generatedAt: now,
        quality: "stale",
        stale: true,
        errors,
        globalRiskHint: buildGlobalRiskHint(cachedSnapshot.market, true),
      };
    }

    throw new Error(errors.join("; ") || "all symbols failed");
  }

  const payload: SnapshotPayload = {
    updatedAt: now,
    generatedAt: now,
    source: "Binance Spot/Futures Public API",
    market,
    globalRiskHint: buildGlobalRiskHint(market, errors.length > 0),
    quality,
    stale: false,
    errors,
  };

  cachedSnapshot = payload;
  return payload;
}

async function getSnapshot(): Promise<SnapshotPayload> {
  if (cachedSnapshot && isFresh(cachedSnapshot, CACHE_TTL_MS)) {
    return cachedSnapshot;
  }

  if (!inFlightSnapshot) {
    inFlightSnapshot = buildLiveSnapshot().finally(() => {
      inFlightSnapshot = null;
    });
  }

  return inFlightSnapshot;
}

export async function GET() {
  try {
    const payload = await getSnapshot();

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch market snapshot",
        message: errorMessage(error),
      },
      { status: 503 },
    );
  }
}
