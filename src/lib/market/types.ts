export type SymbolPair = "BTCUSDT" | "ETHUSDT";
export type BaseAsset = "BTC" | "ETH";
export type Trend = "bullish" | "neutral" | "bearish";
export type BreakoutStatus = "watch" | "valid_breakout" | "fake_breakout" | "valid_breakdown" | "fake_breakdown";
export type DataQuality = "live" | "partial" | "stale";
export type TradeBias = "long" | "short" | "wait";
export type ConfidenceLevel = "high" | "medium" | "low";
export type PlanType =
  | "enter_long_now"
  | "enter_short_now"
  | "wait_pullback_long"
  | "wait_rebound_short"
  | "wait_breakout_long"
  | "wait_breakdown_short"
  | "wait";

export type DepthLevel = [string, string];

export type BinanceDepth = {
  bids: DepthLevel[];
  asks: DepthLevel[];
};

export type BinanceTicker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
};

export type BinanceOpenInterest = {
  openInterest: string;
};

export type BinancePremiumIndex = {
  lastFundingRate: string;
  markPrice: string;
};

export type TimeframeSignal = {
  interval: "5m" | "15m" | "1h";
  trend: Trend;
  rsi14: number;
  ema20: number;
  ema50: number;
};

export type CoinAnalysis = {
  symbol: SymbolPair;
  baseAsset: BaseAsset;
  price: number;
  change24hPct: number;
  high24h: number;
  low24h: number;
  rangePositionPct: number;
  bidAskPressureRatio: number;
  buyPressureScore: number;
  bidDepthTop20: number;
  askDepthTop20: number;
  support: number;
  resistance: number;
  orderbookSupport: number;
  orderbookResistance: number;
  breakout: number;
  breakdown: number;
  trend: Trend;
  warning: string;
  suggestion: string;
  openInterest: number;
  fundingRate: number;
  markPrice: number;
  vwap120: number;
  atr15m: number;
  volumeScore: number;
  breakoutStatus: BreakoutStatus;
  timeframeSignals: TimeframeSignal[];
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
};

export type SnapshotPayload = {
  updatedAt: string;
  generatedAt: string;
  source: string;
  market: CoinAnalysis[];
  globalRiskHint: string;
  quality: DataQuality;
  stale: boolean;
  errors: string[];
};

export type KlineTuple = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

export type SymbolMarketData = {
  ticker: BinanceTicker;
  depth: BinanceDepth;
  openInterest: BinanceOpenInterest;
  premiumIndex: BinancePremiumIndex;
  klines1m: KlineTuple[];
  klines5m: KlineTuple[];
  klines15m: KlineTuple[];
  klines1h: KlineTuple[];
};
