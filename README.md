# Crypto Market Signal Dashboard

BTC / ETH 实时市场信号看板，基于 Binance 公开 Spot/Futures API 计算盘口压力、支撑阻力、多周期趋势、OI/Funding 和真假突破状态。

## 功能

- BTCUSDT / ETHUSDT 实时价格与 24h 涨跌。
- Top 20 买卖盘深度、买盘强度和即时盘口墙位。
- 5m / 15m / 1h EMA 与 RSI 趋势共振。
- VWAP、ATR、结构支撑阻力、突破和跌破关注位。
- Funding、Open Interest 和全局风险提示。
- 服务端短缓存、请求合并、超时控制和部分数据降级。

## 运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000/market-signal 查看实时看板。

## 检查

```bash
npm run lint
npm run test
npm run build
```

## 数据说明

- 数据源：Binance Spot/Futures Public API。
- API 路由：`/api/market/snapshot`。
- 刷新策略：前端 15 秒轮询，服务端 8 秒短缓存。
- 降级策略：单个币种失败时仍返回可用币种；全部失败且缓存未过期时返回 stale 数据；无可用缓存时返回 503。

## 主要文件

- `src/app/market-signal/page.tsx`：实时看板界面。
- `src/app/api/market/snapshot/route.ts`：市场快照 API。
- `src/lib/market/analysis.ts`：指标和信号计算。
- `src/lib/market/types.ts`：共享类型定义。
- `tests/market-analysis.test.ts`：核心指标测试。

## 免责声明

页面内容仅基于公开行情与深度数据进行量化推断，不构成任何投资建议。请结合自身风险承受能力独立决策。
