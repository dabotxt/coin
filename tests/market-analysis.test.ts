import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeMarketData,
  buildBreakoutStatus,
  calculateATR,
  calculateEMA,
  calculateRSI,
  calculateVWAP,
  sumDepth,
} from "../src/lib/market/analysis";
import type { KlineTuple, SymbolMarketData } from "../src/lib/market/types";

function row(open: number, high: number, low: number, close: number, volume = 10): KlineTuple {
  return [0, String(open), String(high), String(low), String(close), String(volume), 0, "0", 0, "0", "0", "0"];
}

function rows(start: number, count: number, step: number): KlineTuple[] {
  return Array.from({ length: count }, (_, index) => {
    const price = start + index * step;
    return row(price - 1, price + 2, price - 2, price, 10 + index);
  });
}

test("calculates core indicators", () => {
  const closeRows = rows(100, 20, 1);

  assert.equal(sumDepth([["100", "2"], ["99", "3.5"]]), 5.5);
  assert.ok(calculateEMA([1, 2, 3, 4, 5], 3) > 3);
  assert.equal(calculateRSI(closeRows.map((item) => Number(item[4]))), 100);
  assert.ok(calculateATR(closeRows, 14) > 0);
  assert.ok(calculateVWAP(closeRows) > 100);
});

test("classifies breakout quality", () => {
  assert.equal(
    buildBreakoutStatus({
      price: 111,
      resistance: 108,
      support: 98,
      atr: 4,
      volumeScore: 1.4,
      bidAskPressureRatio: 1.2,
      bullishSignalCount: 2,
      bearishSignalCount: 0,
    }),
    "valid_breakout",
  );

  assert.equal(
    buildBreakoutStatus({
      price: 111,
      resistance: 108,
      support: 98,
      atr: 4,
      volumeScore: 0.8,
      bidAskPressureRatio: 0.9,
      bullishSignalCount: 1,
      bearishSignalCount: 0,
    }),
    "fake_breakout",
  );
});

test("builds a complete coin analysis payload", () => {
  const marketData: SymbolMarketData = {
    ticker: {
      symbol: "BTCUSDT",
      lastPrice: "220",
      priceChangePercent: "2.5",
      highPrice: "230",
      lowPrice: "190",
      volume: "1000",
      quoteVolume: "220000",
    },
    depth: {
      bids: Array.from({ length: 100 }, (_, index) => [String(219 - index * 0.5), String(4 + index * 0.1)]),
      asks: Array.from({ length: 100 }, (_, index) => [String(221 + index * 0.5), String(3 + index * 0.1)]),
    },
    openInterest: { openInterest: "120000" },
    premiumIndex: { lastFundingRate: "0.0001", markPrice: "220.1" },
    klines1m: rows(100, 120, 1),
    klines5m: rows(100, 120, 1),
    klines15m: rows(100, 120, 1),
    klines1h: rows(100, 120, 1),
  };

  const analysis = analyzeMarketData("BTCUSDT", marketData);

  assert.equal(analysis.baseAsset, "BTC");
  assert.equal(analysis.price, 220);
  assert.equal(analysis.timeframeSignals.length, 3);
  assert.ok(analysis.support < analysis.price);
  assert.ok(analysis.resistance > analysis.price);
  assert.ok(["long", "short", "wait"].includes(analysis.tradeBias));
  assert.ok(analysis.planType.length > 0);
  assert.equal(typeof analysis.canOpenNow, "boolean");
  assert.ok(analysis.triggerCondition.length > 0);
  assert.ok(analysis.confidenceScore >= 0);
  assert.ok(analysis.confidenceScore <= 100);
  if (analysis.tradeBias !== "wait") {
    assert.ok(analysis.entryZoneLow > 0);
    assert.ok(analysis.entryZoneHigh >= analysis.entryZoneLow);
    assert.ok(analysis.stopLossLevel > 0);
    assert.ok(analysis.takeProfitOne > 0);
    assert.ok(analysis.takeProfitTwo > 0);
    assert.ok(analysis.suggestedLeverage >= 1);
  }
});
