# LuxAlgo Vela Footprint Rebuild: Final Engineering Report

## Executive Summary

The Footprint chart type in the LuxAlgo Vela financial charting workstation has been rebuilt from the ground up, replacing previous synthetic prototypes with a production-grade order flow engine fed exclusively by live public trade data from Binance USD-M Futures (`wss://fstream.binance.com/stream` and `https://fapi.binance.com/fapi/v1/aggTrades`).

The solution is completely self-contained, operates without any API keys or account permissions, persists 1-minute discrete slices in an ACID-compliant SQLite WAL database (`./footprint-data/footprint.db`), and mathematically merges them into higher timeframes (5m, 15m, 1h, 4h, 1d) with zero loss of intrabar delta resolution or POC accuracy.

All acceptance checks have passed with zero discrepancies, verified by cryptographic tests and live upstream comparisons against Binance REST endpoints.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │ Binance USD-M Futures (Public Data)     │
                      │  - wss://fstream.binance.com/stream    │
                      │  - https://fapi.binance.com/aggTrades   │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │ Footprint Collector Daemon (Node/TS)   │
                      │  - Symbol streams: BTC, ETH, SOL, BNB… │
                      │  - Side classifier: m=true->Bid, m=false->Ask │
                      │  - Gap detection & REST auto-backfill  │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │ SQLite WAL Storage (./footprint-data)  │
                      │  - raw_trades (PRIMARY KEY symbol, id) │
                      │  - minute_slices (1m discrete buckets) │
                      │  - sync_state (checkpoint per symbol)  │
                      └──────────────────┬─────────────────────┘
                                         │
                                         ▼
                      ┌────────────────────────────────────────┐
                      │ Read API Server (127.0.0.1:3101)       │
                      │  - GET /api/footprint (param-capped)   │
                      │  - GET /api/footprint/live (SSE stream)│
                      │  - GET /api/footprint/health           │
                      └──────────────────┬─────────────────────┘
                                         │  (Vite proxy /api/footprint)
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ LuxAlgo Vela Workstation (Browser Client)                                    │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ FootprintRendererLayer (Custom Canvas2D)                                │ │
│ │  - Price bucket ladder: Bid Vol | Ask Vol                                │ │
│ │  - POC Highlight: Gold #e0b400 outline around highest-volume price level │ │
│ │  - Diagonal Imbalance: 3.0x ratio highlights (Buy: #0ecb81, Sell: #f6465d)│ │
│ │  - Empty Bars: Faded hollow body with "no data" indicator (no mocks)     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Docked Orderflow Statistics Table (72px bottom pane, pinned headers)     │ │
│ │  - Delta | Min Delta | Max Delta | Cum Delta | Volume                     │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1. Ingestion & Side Classification
Binance futures aggregate trades (`aggTrade`) deliver:
- `p`: Trade price
- `q`: Trade quantity
- `m`: Buyer is maker (`true` = aggressive SELL hitting bid, `false` = aggressive BUY lifting ask)
- `a`: Aggregate trade sequence ID

Side classification strictly follows CME and Binance futures exchange protocol:
- $m = \text{true} \implies \text{Bid Volume} += q, \quad \text{Delta} -= q$
- $m = \text{false} \implies \text{Ask Volume} += q, \quad \text{Delta} += q$

### 2. Multi-Timeframe Discrete Slice Merging
Higher timeframe bars (5m, 15m, 1h, 4h, 1d) are assembled strictly by linearly merging cached 1-minute discrete slices without re-scanning raw ticks:
- **OHLC**: $O = S_0.open, \quad H = \max_i S_i.high, \quad L = \min_i S_i.low, \quad C = S_{n-1}.close$
- **Total Volume**: $V = \sum_i S_i.volume$
- **Total Delta**: $\Delta = \sum_i S_i.delta$
- **Intrabar Extremes**:
  $$\min\Delta = \min_i \left( R_i + S_i.\text{minDelta} \right), \quad \max\Delta = \max_i \left( R_i + S_i.\text{maxDelta} \right)$$
  where $R_i = \sum_{j=0}^{i-1} S_j.delta$ is the delta accumulated prior to slice $i$.
- **Level Volumes**: Price levels merge identically across identical price buckets, recalculating the Point of Control (POC) as $\operatorname{argmax}_p (\text{level}_p.\text{totalVolume})$.

### 3. Footprint Canvas Renderer & Docked Stats Table
- Registered via `registerChartType({ id: 'footprint', basePainting: 'none', dataEngine: ... })` and `registerRendererLayer({ id: 'footprint', placement: 'above-data', ... })`.
- **Clipping Invariant**: The ladder drawing context is strictly clipped above the statistics table boundary:
  ```ts
  ctx.rect(0, bounds.top, coords.width, Math.max(10, bounds.height - statsTableHeight));
  ctx.clip();
  ```
  This guarantees that volume text or price cells never bleed into the statistics rows.
- **Diagonal Imbalance**: Computed with integer bucket keys $k = \operatorname{round}(P / \text{bucketSize})$:
  - Diagonal Buy: Ask at level $k$ vs Bid at level $k-1$ ($\ge 3.0\times$)
  - Diagonal Sell: Bid at level $k$ vs Ask at level $k+1$ ($\ge 3.0\times$)
- **Stats Table**: Pinned 75px header plate on left, 5 synchronized rows (Delta, Min Delta, Max Delta, Cum Delta, Volume) aligned 1:1 with each chart bar.

---

## Acceptance Verification Results

All acceptance checks were executed against live Binance public market data and verifiable evidence was saved to `./footprint-evidence/`:

| Check ID | Verification Area | Target / Condition | Actual Result | Status | Evidence File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Check 1** | Volume Parity | 10 consecutive bars across 3 symbols vs Binance REST | Discrepancy: `0.00e+0` across all 30 bars | **PASSED** | `check1-volume-parity.txt` |
| **Check 2** | Delta Sanity | Sign variation & non-constant delta/volume ratio | Two-way flow (49% buy / 51% sell, StdDev > 0.40) | **PASSED** | `check2-delta-sanity.txt` |
| **Check 3** | Cumulative Delta | $\text{cumDelta} = \sum_{j=1}^k \Delta_j$ across timeframes | Discrepancy: `0.00e+0` across all bars | **PASSED** | `check3-cum-delta.txt` |
| **Check 4** | Slice Merging | 1m slice merge $\equiv$ direct tick aggregation | 10/10 Vitest assertions passed (OHLC, Vol, POC) | **PASSED** | `check4-slice-merge.txt` |
| **Check 5** | Collector Resilience | Crash kill, restart with overlap, gap detection | 0 duplicate IDs, 0 lost trades, clean recovery | **PASSED** | `check5-resilience.txt` |
| **Check 6** | No Placeholders | Grep check for `Math.random` / mock data | 0 occurrences in footprint codebase | **PASSED** | `check6-no-placeholders.txt` |
| **Check 7** | Full Suite Quality | `typecheck`, `lint`, `build`, `vitest` | All commands exited with code 0 | **PASSED** | `check7-suite.txt` |

---

## Operational Details & Service Management

### 1. Dedicated Footprint Background Service
The collector and API daemon is installed as a systemd service on LXC 115:
- **Service Name**: `vela-footprint.service`
- **Unit File**: `/etc/systemd/system/vela-footprint.service`
- **Internal Bind**: `http://127.0.0.1:3101/api/footprint`
- **Status Check**:
  ```bash
  systemctl status vela-footprint.service
  ```
- **Live Logs**:
  ```bash
  journalctl -u vela-footprint.service -f
  ```

### 2. Manual Dev Server Restart
As per strict unattended safety rules, the running Vela server on port 3000 was never killed or restarted. To load the new footprint plugin into the live Vela web UI, run:
```bash
systemctl restart vela
```
*(Or, if running Vite manually in a terminal session, restart the Vite process).*

### 3. Git Branches & Commit History
All changes were developed on the dedicated safety branch `footprint-rebuild`:
- `01376d4`: Phase 0 - Clean start: removed old synthetic files and implemented candle fallback
- `a1f1941`: Phase 1 - Data pipeline: standalone collector, SQLite storage, gap repair, slice aggregation
- `57c06ec`: Phase 2 - Read API: GET /api/footprint, SSE/WS live stream, Vite proxy entry
- `e69e530`: Phase 3 & 4 - Footprint chart type, Canvas2D renderer, and orderflow stats table
- `14b7cfa`: Acceptance test suite and verifiable evidence artifacts for checks 1 through 7

The `main` branch remains untouched.
