import type {
  BreakoutStatus,
  CoinAnalysis,
  ConfidenceLevel,
  DepthLevel,
  KlineTuple,
  PlanType,
  SymbolMarketData,
  SymbolPair,
  TimeframeSignal,
  TradeBias,
  Trend,
} from "./types";

export function toNum(value: string | number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sumDepth(levels: DepthLevel[]): number {
  return levels.reduce((sum, [, qty]) => sum + toNum(qty), 0);
}

export function calculateEMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i += 1) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function calculateVWAP(rows: KlineTuple[]): number {
  let pv = 0;
  let volume = 0;

  for (const row of rows) {
    const high = toNum(row[2]);
    const low = toNum(row[3]);
    const close = toNum(row[4]);
    const qty = toNum(row[5]);
    const typical = (high + low + close) / 3;
    pv += typical * qty;
    volume += qty;
  }

  return volume > 0 ? pv / volume : 0;
}

export function calculateATR(rows: KlineTuple[], period = 14): number {
  if (rows.length < period + 1) return 0;
  const trs: number[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const high = toNum(rows[i][2]);
    const low = toNum(rows[i][3]);
    const prevClose = toNum(rows[i - 1][4]);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  const sliced = trs.slice(-period);
  return sliced.reduce((sum, v) => sum + v, 0) / Math.max(1, sliced.length);
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

export function clusterBidLevel(levels: DepthLevel[], bandSize: number): number {
  if (levels.length === 0 || bandSize <= 0) return 0;
  const cluster = new Map<number, number>();

  for (const [priceRaw, qtyRaw] of levels) {
    const price = toNum(priceRaw);
    const qty = toNum(qtyRaw);
    const bucket = Math.floor(price / bandSize) * bandSize;
    cluster.set(bucket, (cluster.get(bucket) ?? 0) + qty);
  }

  return findLargestClusterBucket(cluster);
}

export function clusterAskLevel(levels: DepthLevel[], bandSize: number): number {
  if (levels.length === 0 || bandSize <= 0) return 0;
  const cluster = new Map<number, number>();

  for (const [priceRaw, qtyRaw] of levels) {
    const price = toNum(priceRaw);
    const qty = toNum(qtyRaw);
    const bucket = Math.ceil(price / bandSize) * bandSize;
    cluster.set(bucket, (cluster.get(bucket) ?? 0) + qty);
  }

  return findLargestClusterBucket(cluster);
}

function findLargestClusterBucket(cluster: Map<number, number>): number {
  let maxBucket = 0;
  let maxQty = -1;
  for (const [bucket, qty] of cluster.entries()) {
    if (qty > maxQty) {
      maxQty = qty;
      maxBucket = bucket;
    }
  }
  return maxBucket;
}

export function findSwingLevel(values: number[], currentPrice: number, mode: "support" | "resistance"): number {
  if (values.length === 0) return 0;
  const filtered = values.filter((value) => (mode === "support" ? value < currentPrice : value > currentPrice));
  if (filtered.length === 0) return 0;
  return calculateMedian(filtered);
}

export function resolveStructureLevels(rows: KlineTuple[], currentPrice: number, atr: number) {
  const recentRows = rows.slice(-48);
  const lows = recentRows.map((row) => toNum(row[3]));
  const highs = recentRows.map((row) => toNum(row[2]));

  let support = findSwingLevel(lows, currentPrice, "support");
  let resistance = findSwingLevel(highs, currentPrice, "resistance");

  const minimumDistance = Math.max(currentPrice * 0.0035, atr * 1.2);

  if (!support) support = currentPrice - minimumDistance;
  if (!resistance) resistance = currentPrice + minimumDistance;
  if (currentPrice - support < minimumDistance) support = currentPrice - minimumDistance;
  if (resistance - currentPrice < minimumDistance) resistance = currentPrice + minimumDistance;

  return { support, resistance };
}

export function buildTimeframeSignal(interval: "5m" | "15m" | "1h", rows: KlineTuple[]): TimeframeSignal {
  const closes = rows.map((row) => toNum(row[4]));
  const ema20 = calculateEMA(closes.slice(-80), 20);
  const ema50 = calculateEMA(closes.slice(-120), 50);
  const rsi14 = calculateRSI(closes, 14);

  let trend: Trend = "neutral";
  if (ema20 > ema50 && rsi14 >= 52) trend = "bullish";
  if (ema20 < ema50 && rsi14 <= 48) trend = "bearish";

  return { interval, trend, rsi14, ema20, ema50 };
}

export function buildBreakoutStatus(params: {
  price: number;
  resistance: number;
  support: number;
  atr: number;
  volumeScore: number;
  bidAskPressureRatio: number;
  bullishSignalCount: number;
  bearishSignalCount: number;
}): BreakoutStatus {
  const { price, resistance, support, atr, volumeScore, bidAskPressureRatio, bullishSignalCount, bearishSignalCount } =
    params;

  const upThreshold = resistance + atr * 0.2;
  const downThreshold = support - atr * 0.2;
  const volumeStrong = volumeScore >= 1.25;

  if (price > upThreshold) {
    return volumeStrong && bidAskPressureRatio >= 1.05 && bullishSignalCount >= 2
      ? "valid_breakout"
      : "fake_breakout";
  }

  if (price < downThreshold) {
    return volumeStrong && bidAskPressureRatio <= 0.95 && bearishSignalCount >= 2
      ? "valid_breakdown"
      : "fake_breakdown";
  }

  return "watch";
}

export function buildWarningAndSuggestion(args: {
  pressureRatio: number;
  trend: Trend;
  breakoutStatus: BreakoutStatus;
  fundingRate: number;
}): { warning: string; suggestion: string } {
  const { pressureRatio, trend, breakoutStatus, fundingRate } = args;

  if (breakoutStatus === "valid_breakout") {
    return {
      warning: "价格突破阻力且量能、结构共振，短线波动会加大。",
      suggestion: "可分批跟随，止损放在突破位下方一个 ATR 附近。",
    };
  }

  if (breakoutStatus === "fake_breakout") {
    return {
      warning: "出现疑似假突破，追高风险偏大。",
      suggestion: "等待回踩确认再入场，未确认前控制仓位。",
    };
  }

  if (breakoutStatus === "valid_breakdown") {
    return {
      warning: "价格有效跌破支撑，短线下行风险上升。",
      suggestion: "以防守为主，避免逆势抄底。",
    };
  }

  if (pressureRatio <= 0.8 || trend === "bearish") {
    return {
      warning: "卖盘压力占优，盘面偏弱。",
      suggestion: "优先等待止跌信号或更高周期结构修复。",
    };
  }

  if (pressureRatio >= 1.2 && trend === "bullish") {
    return {
      warning: fundingRate > 0.05 ? "多头拥挤度上升，注意冲高回落。" : "买盘偏强，趋势延续概率提高。",
      suggestion: "顺势操作可行，但需要动态上移止损。",
    };
  }

  return {
    warning: "市场处于震荡博弈状态。",
    suggestion: "在支撑与阻力之间做区间策略，突破后再切趋势。",
  };
}

export function buildTradeDecision(args: {
  price: number;
  support: number;
  resistance: number;
  breakout: number;
  breakdown: number;
  atr: number;
  trend: Trend;
  breakoutStatus: BreakoutStatus;
  bidAskPressureRatio: number;
  buyPressureScore: number;
  volumeScore: number;
  fundingRate: number;
  bullishSignalCount: number;
  bearishSignalCount: number;
}): {
  tradeBias: TradeBias;
  planType: PlanType;
  canOpenNow: boolean;
  triggerCondition: string;
  confidence: ConfidenceLevel;
  confidenceScore: number;
  actionLabel: string;
  actionSummary: string;
  invalidationLevel: number;
  takeProfitLevel: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLossLevel: number;
  takeProfitOne: number;
  takeProfitTwo: number;
  riskRewardOne: number;
  riskRewardTwo: number;
  suggestedLeverage: number;
} {
  const {
    price,
    support,
    resistance,
    breakout,
    breakdown,
    atr,
    trend,
    breakoutStatus,
    bidAskPressureRatio,
    buyPressureScore,
    volumeScore,
    fundingRate,
    bullishSignalCount,
    bearishSignalCount,
  } = args;

  let longScore = 0;
  let shortScore = 0;

  if (trend === "bullish") longScore += 28;
  if (trend === "bearish") shortScore += 28;
  if (breakoutStatus === "valid_breakout") longScore += 32;
  if (breakoutStatus === "valid_breakdown") shortScore += 32;
  if (breakoutStatus === "fake_breakout") shortScore += 14;
  if (breakoutStatus === "fake_breakdown") longScore += 14;
  longScore += bullishSignalCount * 10;
  shortScore += bearishSignalCount * 10;
  if (bidAskPressureRatio >= 1.15) longScore += 12;
  if (bidAskPressureRatio <= 0.85) shortScore += 12;
  if (buyPressureScore >= 62) longScore += 8;
  if (buyPressureScore <= 38) shortScore += 8;
  if (price > resistance) longScore += 8;
  if (price < support) shortScore += 8;
  if (volumeScore >= 1.25 && longScore > shortScore) longScore += 8;
  if (volumeScore >= 1.25 && shortScore > longScore) shortScore += 8;
  if (fundingRate > 0.06) longScore -= 8;
  if (fundingRate < -0.06) shortScore -= 8;

  longScore = clamp(0, 100, longScore);
  shortScore = clamp(0, 100, shortScore);

  const edge = Math.abs(longScore - shortScore);
  const bestScore = Math.max(longScore, shortScore);
  let tradeBias: TradeBias = "wait";

  if (bestScore >= 58 && edge >= 18) {
    tradeBias = longScore > shortScore ? "long" : "short";
  }

  const distanceToSupportAtr = atr > 0 ? (price - support) / atr : 99;
  const distanceToResistanceAtr = atr > 0 ? (resistance - price) / atr : 99;
  const nearSupport = distanceToSupportAtr <= 0.55;
  const nearResistance = distanceToResistanceAtr <= 0.55;
  const strongVolume = volumeScore >= 1.25;
  const shortSetup = trend === "bearish" && bearishSignalCount >= 2;
  const longSetup = trend === "bullish" && bullishSignalCount >= 2;
  const confirmedBreakdown = breakoutStatus === "valid_breakdown";
  const confirmedBreakout = breakoutStatus === "valid_breakout";

  let planType: PlanType = "wait";

  if (confirmedBreakout) planType = "enter_long_now";
  else if (confirmedBreakdown) planType = "enter_short_now";
  else if (shortSetup && nearSupport) planType = "wait_breakdown_short";
  else if (longSetup && nearResistance) planType = "wait_breakout_long";
  else if (shortSetup && price < resistance && !nearSupport) planType = "wait_rebound_short";
  else if (longSetup && price > support && !nearResistance) planType = "wait_pullback_long";
  else if (tradeBias === "short" && !nearSupport) planType = "wait_rebound_short";
  else if (tradeBias === "long" && !nearResistance) planType = "wait_pullback_long";

  if (planType === "enter_long_now" || planType === "wait_pullback_long" || planType === "wait_breakout_long") {
    tradeBias = "long";
  } else if (planType === "enter_short_now" || planType === "wait_rebound_short" || planType === "wait_breakdown_short") {
    tradeBias = "short";
  } else {
    tradeBias = "wait";
  }

  const canOpenNow = planType === "enter_long_now" || planType === "enter_short_now";
  const confidenceScore = tradeBias === "wait" ? clamp(0, 100, Math.round(100 - bestScore + edge / 2)) : Math.round(bestScore);
  const confidence: ConfidenceLevel =
    canOpenNow && confidenceScore >= 78 && strongVolume ? "high" : tradeBias === "wait" ? (confidenceScore >= 55 ? "medium" : "low") : "medium";
  const buffer = Math.max(atr * 0.8, price * 0.002);
  const leverage =
    canOpenNow && confidence === "high" && atr / price <= 0.006 ? 3 : tradeBias !== "wait" && atr / price <= 0.008 ? 2 : tradeBias !== "wait" ? 1 : 0;

  if (tradeBias === "long") {
    const invalidationLevel = Math.min(support, price - buffer);
    const entryZoneLow = canOpenNow ? Math.max(breakout, price - atr * 0.12) : planType === "wait_breakout_long" ? breakout : Math.max(support, price - atr * 0.45);
    const entryZoneHigh = canOpenNow ? price + atr * 0.18 : planType === "wait_breakout_long" ? breakout + atr * 0.2 : Math.max(entryZoneLow, price - atr * 0.1);
    const stopLossLevel = invalidationLevel;
    const entryMid = (entryZoneLow + entryZoneHigh) / 2;
    const risk = Math.max(entryMid - stopLossLevel, price * 0.001);
    const takeProfitOne = entryMid + risk * 1.2;
    const takeProfitTwo = entryMid + risk * 2;
    const takeProfitLevel = breakoutStatus === "valid_breakout" ? takeProfitTwo : Math.max(resistance, takeProfitOne);
    return {
      tradeBias,
      planType,
      canOpenNow,
      triggerCondition:
        planType === "enter_long_now"
          ? `已触发: 站上 ${formatLevel(breakout)} 且量能确认`
          : planType === "wait_breakout_long"
            ? `等待站上 ${formatLevel(breakout)}，且 5m/15m 继续偏多`
            : `等待回踩 ${formatLevel(entryZoneLow)} - ${formatLevel(entryZoneHigh)} 企稳`,
      confidence,
      confidenceScore,
      actionLabel:
        planType === "enter_long_now"
          ? "可开多: 突破已确认"
          : planType === "wait_breakout_long"
            ? "等待突破后开多"
            : "等待回踩开多",
      actionSummary:
        planType === "enter_long_now"
          ? "多头突破条件成立，可按计划小仓顺势，跌回失效位下方立即退出。"
          : "多头方向需要更好的入场位置，未触发前不追价。",
      invalidationLevel,
      takeProfitLevel,
      entryZoneLow,
      entryZoneHigh,
      stopLossLevel,
      takeProfitOne,
      takeProfitTwo,
      riskRewardOne: 1.2,
      riskRewardTwo: 2,
      suggestedLeverage: leverage,
    };
  }

  if (tradeBias === "short") {
    const invalidationLevel = Math.max(resistance, price + buffer);
    const entryZoneHigh = canOpenNow ? Math.min(breakdown, price + atr * 0.12) : planType === "wait_breakdown_short" ? breakdown : Math.min(resistance, price + atr * 0.45);
    const entryZoneLow = canOpenNow ? price - atr * 0.18 : planType === "wait_breakdown_short" ? breakdown - atr * 0.2 : Math.min(entryZoneHigh, price + atr * 0.1);
    const stopLossLevel = invalidationLevel;
    const entryMid = (entryZoneLow + entryZoneHigh) / 2;
    const risk = Math.max(stopLossLevel - entryMid, price * 0.001);
    const takeProfitOne = entryMid - risk * 1.2;
    const takeProfitTwo = entryMid - risk * 2;
    const takeProfitLevel = breakoutStatus === "valid_breakdown" ? takeProfitTwo : Math.min(support, takeProfitOne);
    return {
      tradeBias,
      planType,
      canOpenNow,
      triggerCondition:
        planType === "enter_short_now"
          ? `已触发: 跌破 ${formatLevel(breakdown)} 且量能确认`
          : planType === "wait_breakdown_short"
            ? `等待跌破 ${formatLevel(breakdown)}，且反抽不收回`
            : `等待反弹 ${formatLevel(entryZoneLow)} - ${formatLevel(entryZoneHigh)} 承压`,
      confidence,
      confidenceScore,
      actionLabel:
        planType === "enter_short_now"
          ? "可开空: 跌破已确认"
          : planType === "wait_breakdown_short"
            ? "等待跌破后开空"
            : "等待反弹开空",
      actionSummary:
        planType === "enter_short_now"
          ? "空头跌破条件成立，可按计划小仓顺势，站回失效位上方立即退出。"
          : "趋势偏空但不追低，等反弹压力或跌破确认后再执行。",
      invalidationLevel,
      takeProfitLevel,
      entryZoneLow,
      entryZoneHigh,
      stopLossLevel,
      takeProfitOne,
      takeProfitTwo,
      riskRewardOne: 1.2,
      riskRewardTwo: 2,
      suggestedLeverage: leverage,
    };
  }

  return {
    tradeBias,
    planType,
    canOpenNow,
    triggerCondition: `等待突破 ${formatLevel(breakout)} 或跌破 ${formatLevel(breakdown)} 后再评估`,
    confidence,
    confidenceScore,
    actionLabel: "观望: 暂不开仓",
    actionSummary: "多空优势不够明确，当前不适合强行开多或开空。",
    invalidationLevel: 0,
    takeProfitLevel: 0,
    entryZoneLow: support,
    entryZoneHigh: resistance,
    stopLossLevel: 0,
    takeProfitOne: 0,
    takeProfitTwo: 0,
    riskRewardOne: 0,
    riskRewardTwo: 0,
    suggestedLeverage: 0,
  };
}

function formatLevel(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function buildGlobalRiskHint(market: CoinAnalysis[], degraded = false): string {
  if (market.length === 0) return "当前行情数据不可用，建议暂停依赖本看板做短线判断。";

  const riskScore = market.reduce((score, item) => {
    let next = score;
    if (item.trend === "bearish") next += 1;
    if (item.breakoutStatus === "valid_breakdown" || item.breakoutStatus === "fake_breakout") next += 1;
    if (item.fundingRate > 0.08) next += 0.5;
    return next;
  }, 0);

  const prefix = degraded ? "部分数据源异常，以下判断需降低权重。" : "";
  const hint =
    riskScore >= 2.5
      ? "当前整体风险偏高，建议防守优先，降低杠杆与仓位。"
      : "当前整体风险中性，可轻仓参与并严格执行止损。";

  return `${prefix}${hint}`;
}

export function analyzeMarketData(symbol: SymbolPair, data: SymbolMarketData): CoinAnalysis {
  const { ticker, depth, openInterest, premiumIndex, klines1m, klines5m, klines15m, klines1h } = data;
  const price = toNum(ticker.lastPrice);
  const high24h = toNum(ticker.highPrice);
  const low24h = toNum(ticker.lowPrice);
  const change24hPct = toNum(ticker.priceChangePercent);

  const bidsTop20 = depth.bids.slice(0, 20);
  const asksTop20 = depth.asks.slice(0, 20);
  const bidDepthTop20 = sumDepth(bidsTop20);
  const askDepthTop20 = sumDepth(asksTop20);
  const bidAskPressureRatio = askDepthTop20 > 0 ? bidDepthTop20 / askDepthTop20 : 1;
  const buyPressureScore = clamp(0, 100, Math.round((bidAskPressureRatio / 2) * 100));

  const range = high24h - low24h;
  const rangePositionPct = range > 0 ? ((price - low24h) / range) * 100 : 50;

  const atr15m = calculateATR(klines15m, 14);
  const bandSize = Math.max(price * 0.0012, atr15m * 0.35, price * 0.0005);
  const clusteredSupport = clusterBidLevel(depth.bids.slice(0, 80), bandSize);
  const clusteredResistance = clusterAskLevel(depth.asks.slice(0, 80), bandSize);
  const bestBid = toNum(depth.bids[0]?.[0] ?? 0);
  const bestAsk = toNum(depth.asks[0]?.[0] ?? 0);
  const orderbookSupport = clusteredSupport > 0 ? Math.min(clusteredSupport, bestBid) : bestBid;
  const orderbookResistance = clusteredResistance > 0 ? Math.max(clusteredResistance, bestAsk) : bestAsk;
  const { support, resistance } = resolveStructureLevels(klines15m, price, atr15m);

  const vwap120 = calculateVWAP(klines1m);
  const latestVolume = toNum(klines1m[klines1m.length - 1]?.[5] ?? 0);
  const recentVolumes = klines1m.slice(-30);
  const avgVolume = recentVolumes.reduce((sum, row) => sum + toNum(row[5]), 0) / Math.max(1, recentVolumes.length);
  const volumeScore = avgVolume > 0 ? latestVolume / avgVolume : 1;

  const timeframeSignals = [
    buildTimeframeSignal("5m", klines5m),
    buildTimeframeSignal("15m", klines15m),
    buildTimeframeSignal("1h", klines1h),
  ];

  const bullishSignalCount = timeframeSignals.filter((s) => s.trend === "bullish").length;
  const bearishSignalCount = timeframeSignals.filter((s) => s.trend === "bearish").length;

  let trend: Trend = "neutral";
  if (bullishSignalCount >= 2 && price >= vwap120) trend = "bullish";
  if (bearishSignalCount >= 2 && price <= vwap120) trend = "bearish";

  const breakout = resistance + atr15m * 0.2;
  const breakdown = support - atr15m * 0.2;
  const breakoutStatus = buildBreakoutStatus({
    price,
    resistance,
    support,
    atr: atr15m,
    volumeScore,
    bidAskPressureRatio,
    bullishSignalCount,
    bearishSignalCount,
  });

  const fundingRate = toNum(premiumIndex.lastFundingRate) * 100;
  const markPrice = toNum(premiumIndex.markPrice);
  const oi = toNum(openInterest.openInterest);
  const { warning, suggestion } = buildWarningAndSuggestion({
    pressureRatio: bidAskPressureRatio,
    trend,
    breakoutStatus,
    fundingRate,
  });
  const tradeDecision = buildTradeDecision({
    price,
    support,
    resistance,
    breakout,
    breakdown,
    atr: atr15m,
    trend,
    breakoutStatus,
    bidAskPressureRatio,
    buyPressureScore,
    volumeScore,
    fundingRate,
    bullishSignalCount,
    bearishSignalCount,
  });

  return {
    symbol,
    baseAsset: symbol === "BTCUSDT" ? "BTC" : "ETH",
    price,
    change24hPct,
    high24h,
    low24h,
    rangePositionPct,
    bidAskPressureRatio,
    buyPressureScore,
    bidDepthTop20,
    askDepthTop20,
    support,
    resistance,
    orderbookSupport,
    orderbookResistance,
    breakout,
    breakdown,
    trend,
    warning,
    suggestion,
    openInterest: oi,
    fundingRate,
    markPrice,
    vwap120,
    atr15m,
    volumeScore,
    breakoutStatus,
    timeframeSignals,
    ...tradeDecision,
  };
}
