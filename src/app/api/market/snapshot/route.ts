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

const COINBASE_EXCHANGE_BASE = "https://api.exchange.coinbase.com";
const SYMBOLS: SymbolPair[] = ["BTCUSDT", "ETHUSDT"];
const CACHE_TTL_MS = 8_000;
const STALE_TTL_MS = 180_000;
const FETCH_TIMEOUT_MS = 8_000;

type CoinbaseProduct = "BTC-USD" | "ETH-USD";

type CoinbaseStats = {
  open: string;
  high: string;
  low: string;
  last: string;
  volume: string;
};

type CoinbaseBook = {
  bids: [string, string, number][];
  asks: [string, string, number][];
};

type CoinbaseCandle = [number, number, number, number, number, number];

let cachedSnapshot: SnapshotPayload | null = null;
let inFlightSnapshot: Promise<SnapshotPayload> | null = null;

function isFresh(snapshot: SnapshotPayload, ttlMs: number): boolean {
  return Date.now() - Date.parse(snapshot.generatedAt) < ttlMs;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function fallbackDepth(price: number): BinanceDepth {
  const priceText = String(price);
  return {
    bids: [[priceText, "0"]],
    asks: [[priceText, "0"]],
  };
}

function fallbackOpenInterest(): BinanceOpenInterest {
  return { openInterest: "0" };
}

function fallbackPremiumIndex(price: number): BinancePremiumIndex {
  return {
    lastFundingRate: "0",
    markPrice: String(price),
  };
}

function coinbaseProduct(symbol: SymbolPair): CoinbaseProduct {
  return symbol === "BTCUSDT" ? "BTC-USD" : "ETH-USD";
}

async function settle<T>(label: string, task: Promise<T>, errors: string[]): Promise<T | null> {
  try {
    return await task;
  } catch (error) {
    errors.push(`${label}: ${errorMessage(error)}`);
    return null;
  }
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

async function fetchTicker(symbol: SymbolPair): Promise<BinanceTicker> {
  const product = coinbaseProduct(symbol);
  const stats = await fetchJson<CoinbaseStats>(`${COINBASE_EXCHANGE_BASE}/products/${product}/stats`);
  const open = Number(stats.open);
  const last = Number(stats.last);
  const priceChangePercent = open > 0 ? ((last - open) / open) * 100 : 0;

  return {
    symbol,
    lastPrice: stats.last,
    priceChangePercent: String(priceChangePercent),
    highPrice: stats.high,
    lowPrice: stats.low,
    volume: stats.volume,
    quoteVolume: "0",
  };
}

async function fetchDepth(symbol: SymbolPair): Promise<BinanceDepth> {
  const product = coinbaseProduct(symbol);
  const book = await fetchJson<CoinbaseBook>(`${COINBASE_EXCHANGE_BASE}/products/${product}/book?level=2`);

  return {
    bids: book.bids.slice(0, 100).map(([price, size]) => [price, size]),
    asks: book.asks.slice(0, 100).map(([price, size]) => [price, size]),
  };
}

function fetchOpenInterest(): Promise<BinanceOpenInterest> {
  return Promise.resolve(fallbackOpenInterest());
}

function fetchPremiumIndex(price: number): Promise<BinancePremiumIndex> {
  return Promise.resolve(fallbackPremiumIndex(price));
}

async function fetchKlines(
  symbol: SymbolPair,
  interval: "1m" | "5m" | "15m" | "1h",
  limit: number,
): Promise<KlineTuple[]> {
  const product = coinbaseProduct(symbol);
  const granularityByInterval = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3_600,
  } satisfies Record<typeof interval, number>;
  const granularity = granularityByInterval[interval];
  const candles = await fetchJson<CoinbaseCandle[]>(
    `${COINBASE_EXCHANGE_BASE}/products/${product}/candles?granularity=${granularity}`,
  );

  return candles
    .slice(0, limit)
    .reverse()
    .map(([time, low, high, open, close, volume]) => [
      time * 1000,
      String(open),
      String(high),
      String(low),
      String(close),
      String(volume),
      time * 1000 + granularity * 1000 - 1,
      "0",
      0,
      "0",
      "0",
      "0",
    ]);
}

async function fetchSymbolData(symbol: SymbolPair, errors: string[]): Promise<SymbolMarketData | null> {
  const [ticker, klines1m, klines5m, klines15m, klines1h] = await Promise.all([
    settle(`${symbol} ticker`, fetchTicker(symbol), errors),
    settle(`${symbol} 1m klines`, fetchKlines(symbol, "1m", 120), errors),
    settle(`${symbol} 5m klines`, fetchKlines(symbol, "5m", 120), errors),
    settle(`${symbol} 15m klines`, fetchKlines(symbol, "15m", 120), errors),
    settle(`${symbol} 1h klines`, fetchKlines(symbol, "1h", 120), errors),
  ]);

  if (!ticker || !klines1m || !klines5m || !klines15m || !klines1h) {
    return null;
  }

  const price = Number(ticker.lastPrice);
  const [depth, openInterest, premiumIndex] = await Promise.all([
    settle(`${symbol} depth`, fetchDepth(symbol), errors),
    settle(`${symbol} open interest`, fetchOpenInterest(), errors),
    settle(`${symbol} premium index`, fetchPremiumIndex(price), errors),
  ]);

  return {
    ticker,
    depth: depth ?? fallbackDepth(price),
    openInterest: openInterest ?? fallbackOpenInterest(),
    premiumIndex: premiumIndex ?? fallbackPremiumIndex(price),
    klines1m,
    klines5m,
    klines15m,
    klines1h,
  };
}

async function analyzeSymbolSettled(symbol: SymbolPair) {
  const errors: string[] = [];
  try {
    const data = await fetchSymbolData(symbol, errors);
    if (!data) {
      return {
        ok: false as const,
        errors: errors.length > 0 ? errors : [`${symbol}: required market data unavailable`],
      };
    }

    return {
      ok: true as const,
      market: analyzeMarketData(symbol, data),
      errors,
    };
  } catch (error) {
    return {
      ok: false as const,
      errors: [`${symbol}: ${errorMessage(error)}`, ...errors],
    };
  }
}

async function buildLiveSnapshot(): Promise<SnapshotPayload> {
  const settled = await Promise.all(SYMBOLS.map((symbol) => analyzeSymbolSettled(symbol)));
  const market = settled.flatMap((result) => (result.ok ? [result.market] : []));
  const errors = settled.flatMap((result) => result.errors);
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
    source: "Coinbase Exchange Public API",
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
