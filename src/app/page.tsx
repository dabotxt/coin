import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-5xl">
        <section className="border-b border-zinc-800 pb-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Crypto Market Signal Dashboard</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-300 md:text-base">
              BTC / ETH 实时买卖盘压力、结构支撑阻力、OI/Funding、多周期信号与真假突破判断。
            </p>
          </div>

          <Link
            href="/market-signal"
            className="mt-6 inline-flex items-center rounded-lg bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
          >
            进入实时分析看板
          </Link>
        </section>

        <section className="grid gap-4 py-8 md:grid-cols-3">
          {[
            ["盘口压力", "Top 20 深度买卖盘比值与即时墙位。"],
            ["结构判断", "VWAP、ATR、支撑阻力与突破阈值。"],
            ["风险提示", "Funding、趋势共振和数据质量状态。"],
          ].map(([title, body]) => (
            <div key={title} className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
