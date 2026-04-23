"use client";

import { useEffect, useState } from "react";
import type { BreakoutStatus, DataQuality, SnapshotPayload, TradeBias, Trend } from "@/lib/market/types";

const REFRESH_MS = 15_000;

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(value: number): string {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatShortNumber(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function trendLabel(trend: Trend): string {
  if (trend === "bullish") return "偏多";
  if (trend === "bearish") return "偏空";
  return "震荡";
}

function breakoutLabel(status: BreakoutStatus): string {
  if (status === "valid_breakout") return "有效突破";
  if (status === "fake_breakout") return "假突破风险";
  if (status === "valid_breakdown") return "有效跌破";
  if (status === "fake_breakdown") return "假跌破风险";
  return "等待触发";
}

function breakoutClass(status: BreakoutStatus): string {
  if (status === "valid_breakout") return "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";
  if (status === "fake_breakout") return "bg-amber-500/20 text-amber-200 border-amber-500/40";
  if (status === "valid_breakdown") return "bg-red-500/20 text-red-200 border-red-500/40";
  if (status === "fake_breakdown") return "bg-orange-500/20 text-orange-200 border-orange-500/40";
  return "bg-zinc-700/50 text-zinc-200 border-zinc-600";
}

function biasClass(bias: TradeBias): string {
  if (bias === "long") return "border-emerald-400/50 bg-emerald-500/15 text-emerald-100";
  if (bias === "short") return "border-red-400/50 bg-red-500/15 text-red-100";
  return "border-zinc-600 bg-zinc-800 text-zinc-100";
}

function biasDotClass(bias: TradeBias): string {
  if (bias === "long") return "bg-emerald-300";
  if (bias === "short") return "bg-red-300";
  return "bg-zinc-300";
}

function biasText(bias: TradeBias): string {
  if (bias === "long") return "开多倾向";
  if (bias === "short") return "开空倾向";
  return "观望";
}

function qualityLabel(quality?: DataQuality): string {
  if (quality === "partial") return "部分数据";
  if (quality === "stale") return "缓存数据";
  return "实时";
}

function qualityClass(quality?: DataQuality): string {
  if (quality === "partial") return "border-amber-400/40 bg-amber-500/15 text-amber-100";
  if (quality === "stale") return "border-red-400/40 bg-red-500/15 text-red-100";
  return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
}

export default function MarketSignalPage() {
  const [data, setData] = useState<SnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [lastSuccessAt, setLastSuccessAt] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/market/snapshot", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) {
          const message =
            typeof json?.message === "string" ? json.message : typeof json?.error === "string" ? json.error : `request failed: ${res.status}`;
          throw new Error(message);
        }
        const payload = json as SnapshotPayload;
        if (!cancelled) {
          setData(payload);
          setError("");
          setLastSuccessAt(new Date().toISOString());
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "未知错误";
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const updatedAtLocal = data?.updatedAt ? new Date(data.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "-";
  const lastSuccessAtLocal = lastSuccessAt ? new Date(lastSuccessAt).toLocaleString("zh-CN", { hour12: false }) : "-";
  const topMarket = data?.market ?? [];

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 md:px-10 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="border-b border-zinc-800 pb-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">BTC / ETH 实时买卖盘分析看板</h1>
              <p className="mt-2 text-sm text-zinc-300">
                顶部直接给出方向倾向；下方指标用于复核失效位和风险。
              </p>
            </div>
            <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-300 sm:grid-cols-2 md:min-w-96">
              <div>数据源: {data?.source ?? "Binance"}</div>
              <div>更新时间: {updatedAtLocal}</div>
              <div>最后成功: {lastSuccessAtLocal}</div>
              <div>刷新频率: {REFRESH_MS / 1000} 秒</div>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-8 text-center text-zinc-300">加载中...</div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">
            拉取市场数据失败: {error}
            {data ? "，当前继续显示最后一次成功数据。" : null}
          </div>
        ) : null}

        {data ? (
          <div className="grid gap-3 md:grid-cols-[180px_1fr]">
            <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${qualityClass(data.quality)}`}>
              数据状态: {qualityLabel(data.quality)}
            </div>
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              全局风险提示: {data.globalRiskHint}
              {data.errors.length > 0 ? <div className="mt-2 text-xs text-amber-200">异常: {data.errors.join(" | ")}</div> : null}
            </div>
          </div>
        ) : null}

        {topMarket.length > 0 ? (
          <section className="grid gap-3 md:grid-cols-2">
            {topMarket.map((item) => (
              <div key={`${item.symbol}-decision`} className={`rounded-lg border p-5 ${biasClass(item.tradeBias)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <span className={`h-2.5 w-2.5 rounded-full ${biasDotClass(item.tradeBias)}`} />
                      {item.baseAsset} {biasText(item.tradeBias)}
                    </div>
                    <div className="mt-2 text-2xl font-bold">{item.actionLabel}</div>
                  </div>
                  <div className="shrink-0 rounded-md bg-black/20 px-3 py-2 text-right">
                    <div className="text-xs opacity-75">置信度</div>
                    <div className="text-lg font-bold">{item.confidenceScore}%</div>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 opacity-90">{item.actionSummary}</p>
                <div className="mt-3 rounded-md bg-black/20 p-3 text-xs">
                  <div className="opacity-70">触发条件</div>
                  <div className="mt-1 font-semibold">{item.triggerCondition}</div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-black/20 p-2">
                    <div className="opacity-70">现价</div>
                    <div className="mt-1 font-semibold">{formatPrice(item.price)}</div>
                  </div>
                  <div className="rounded-md bg-black/20 p-2">
                    <div className="opacity-70">{item.tradeBias === "short" ? "计划止损" : item.tradeBias === "long" ? "计划止损" : "关键支撑"}</div>
                    <div className="mt-1 font-semibold">
                      {item.tradeBias === "wait" ? formatPrice(item.support) : formatPrice(item.invalidationLevel)}
                    </div>
                  </div>
                  <div className="rounded-md bg-black/20 p-2">
                    <div className="opacity-70">{item.tradeBias === "wait" ? "关键阻力" : "第二目标"}</div>
                    <div className="mt-1 font-semibold">
                      {item.tradeBias === "wait" ? formatPrice(item.resistance) : formatPrice(item.takeProfitLevel)}
                    </div>
                  </div>
                </div>
                {item.tradeBias !== "wait" ? (
                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-5">
                    <div className="rounded-md bg-black/20 p-2 sm:col-span-2">
                      <div className="opacity-70">{item.canOpenNow ? "可执行区间" : "等待区间"}</div>
                      <div className="mt-1 font-semibold">
                        {formatPrice(item.entryZoneLow)} - {formatPrice(item.entryZoneHigh)}
                      </div>
                    </div>
                    <div className="rounded-md bg-black/20 p-2">
                      <div className="opacity-70">止损</div>
                      <div className="mt-1 font-semibold">{formatPrice(item.stopLossLevel)}</div>
                    </div>
                    <div className="rounded-md bg-black/20 p-2">
                      <div className="opacity-70">止盈1</div>
                      <div className="mt-1 font-semibold">
                        {formatPrice(item.takeProfitOne)} / {item.riskRewardOne.toFixed(1)}R
                      </div>
                    </div>
                    <div className="rounded-md bg-black/20 p-2">
                      <div className="opacity-70">止盈2 / 杠杆</div>
                      <div className="mt-1 font-semibold">
                        {formatPrice(item.takeProfitTwo)} / {item.suggestedLeverage}x
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          {data?.market.map((item) => {
            const isUp = item.change24hPct >= 0;
            const pressurePct = Math.max(0, Math.min(100, item.buyPressureScore));
            return (
              <article key={item.symbol} className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 md:p-5">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">{item.baseAsset}</h2>
                    <p className="text-xs text-zinc-400">{item.symbol}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      item.trend === "bullish"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : item.trend === "bearish"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-zinc-700 text-zinc-200"
                    }`}
                  >
                    趋势: {trendLabel(item.trend)}
                  </span>
                </div>

                <div className={`mb-5 rounded-lg border p-4 ${biasClass(item.tradeBias)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs opacity-75">当前方向</div>
                      <div className="mt-1 text-xl font-bold">{item.actionLabel}</div>
                    </div>
                    <div className="rounded-md bg-black/20 px-3 py-2 text-right">
                      <div className="text-xs opacity-75">信号</div>
                      <div className="text-sm font-semibold">{item.confidenceScore}%</div>
                    </div>
                  </div>
                  <div className="mt-3 text-sm leading-6 opacity-90">{item.actionSummary}</div>
                  <div className="mt-3 rounded-md bg-black/20 p-2 text-xs">
                    <div className="opacity-70">触发条件</div>
                    <div className="mt-1 font-semibold">{item.triggerCondition}</div>
                  </div>
                  {item.tradeBias !== "wait" ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-md bg-black/20 p-2">
                        <div className="opacity-70">开仓区间</div>
                        <div className="mt-1 font-semibold">
                          {formatPrice(item.entryZoneLow)} - {formatPrice(item.entryZoneHigh)}
                        </div>
                      </div>
                      <div className="rounded-md bg-black/20 p-2">
                        <div className="opacity-70">建议杠杆</div>
                        <div className="mt-1 font-semibold">{item.suggestedLeverage}x 以内</div>
                      </div>
                      <div className="rounded-md bg-black/20 p-2">
                        <div className="opacity-70">失效位</div>
                        <div className="mt-1 font-semibold">{formatPrice(item.invalidationLevel)}</div>
                      </div>
                      <div className="rounded-md bg-black/20 p-2">
                        <div className="opacity-70">止损</div>
                        <div className="mt-1 font-semibold">{formatPrice(item.stopLossLevel)}</div>
                      </div>
                      <div className="rounded-md bg-black/20 p-2">
                        <div className="opacity-70">止盈1</div>
                        <div className="mt-1 font-semibold">
                          {formatPrice(item.takeProfitOne)} ({item.riskRewardOne.toFixed(1)}R)
                        </div>
                      </div>
                      <div className="rounded-md bg-black/20 p-2">
                        <div className="opacity-70">止盈2</div>
                        <div className="mt-1 font-semibold">
                          {formatPrice(item.takeProfitTwo)} ({item.riskRewardTwo.toFixed(1)}R)
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-zinc-950 p-3">
                    <div className="text-zinc-400">现价</div>
                    <div className="mt-1 text-lg font-bold">{formatPrice(item.price)}</div>
                  </div>
                  <div className="rounded-lg bg-zinc-950 p-3">
                    <div className="text-zinc-400">24h 涨跌</div>
                    <div className={`mt-1 text-lg font-bold ${isUp ? "text-emerald-300" : "text-red-300"}`}>
                      {formatPct(item.change24hPct)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-zinc-950 p-3">
                    <div className="text-zinc-400">OI (Futures)</div>
                    <div className="mt-1 text-sm font-semibold">{formatShortNumber(item.openInterest)}</div>
                  </div>
                  <div className="rounded-lg bg-zinc-950 p-3">
                    <div className="text-zinc-400">Funding</div>
                    <div className="mt-1 text-sm font-semibold">{formatPct(item.fundingRate)}</div>
                  </div>
                </div>

                <div className="mb-5 rounded-lg border border-zinc-700 bg-zinc-950 p-4">
                  <div className="mb-2 flex items-center justify-between text-xs text-zinc-300">
                    <span>买卖盘压力 (Top 20 深度)</span>
                    <span>买盘强度 {pressurePct}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-700">
                    <div className="h-full bg-emerald-400" style={{ width: `${pressurePct}%` }} />
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-zinc-400">
                    <span>买盘: {item.bidDepthTop20.toFixed(2)}</span>
                    <span>卖盘: {item.askDepthTop20.toFixed(2)}</span>
                    <span>比值: {item.bidAskPressureRatio.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
                    <div className="text-emerald-200">主支撑位</div>
                    <div className="mt-1 text-sm font-semibold text-emerald-100">{formatPrice(item.support)}</div>
                  </div>
                  <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3">
                    <div className="text-red-200">主阻力位</div>
                    <div className="mt-1 text-sm font-semibold text-red-100">{formatPrice(item.resistance)}</div>
                  </div>
                  <div className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3">
                    <div className="text-cyan-200">突破关注位</div>
                    <div className="mt-1 text-sm font-semibold text-cyan-100">{formatPrice(item.breakout)}</div>
                  </div>
                  <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3">
                    <div className="text-orange-200">跌破预警位</div>
                    <div className="mt-1 text-sm font-semibold text-orange-100">{formatPrice(item.breakdown)}</div>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                    <div className="text-zinc-400">即时买盘墙</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{formatPrice(item.orderbookSupport)}</div>
                  </div>
                  <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-3">
                    <div className="text-zinc-400">即时卖盘墙</div>
                    <div className="mt-1 text-sm font-semibold text-zinc-100">{formatPrice(item.orderbookResistance)}</div>
                  </div>
                </div>

                <div className="mb-5 rounded-lg border border-zinc-700 bg-zinc-950 p-4 text-xs">
                  <div className="mb-2 font-semibold text-zinc-200">结构指标</div>
                  <div className="grid grid-cols-2 gap-2 text-zinc-300">
                    <span>VWAP(120): {formatPrice(item.vwap120)}</span>
                    <span>ATR(15m): {formatPrice(item.atr15m)}</span>
                    <span>Mark Price: {formatPrice(item.markPrice)}</span>
                    <span>量能系数: {item.volumeScore.toFixed(2)}x</span>
                  </div>
                </div>

                <div className="mb-5 rounded-lg border border-zinc-700 bg-zinc-950 p-4 text-xs">
                  <div className="mb-2 font-semibold text-zinc-200">多周期信号</div>
                  <div className="grid grid-cols-3 gap-2">
                    {item.timeframeSignals.map((tf) => (
                      <div key={tf.interval} className="rounded-md border border-zinc-700 bg-zinc-900 p-2">
                        <div className="text-zinc-300">{tf.interval}</div>
                        <div className="font-semibold">{trendLabel(tf.trend)}</div>
                        <div className="text-zinc-400">RSI {tf.rsi14.toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`mb-5 rounded-lg border px-3 py-2 text-sm font-semibold ${breakoutClass(item.breakoutStatus)}`}>
                  突破状态: {breakoutLabel(item.breakoutStatus)}
                </div>

                <div className="space-y-2 rounded-lg bg-zinc-950 p-4 text-sm">
                  <p>
                    <span className="font-semibold text-zinc-200">预警:</span> {item.warning}
                  </p>
                  <p>
                    <span className="font-semibold text-zinc-200">建议:</span> {item.suggestion}
                  </p>
                </div>
              </article>
            );
          })}
        </section>

        <footer className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-400">
          免责声明: 页面内容仅基于公开行情与深度数据进行量化推断，不构成任何投资建议。请结合自身风险承受能力独立决策。
        </footer>
      </div>
    </main>
  );
}
