# Engineering Decisions Log (Footprint Rebuild)

## Initial Architecture Decisions (Unattended Mode)

### Decision 1: Branch Isolation
- **Choice**: Checked out isolated branch `footprint-rebuild` from `main`.
- **Rationale**: Strict safety requirement: never touch `main`, commit at every phase boundary, zero force-pushes.

### Decision 2: Storage Engine for 1-minute Slices & Deduping
- **Choice**: SQLite via `better-sqlite3` in `./footprint-data/footprint.db` with WAL mode enabled.
- **Rationale**: SQLite provides ACID compliance, fast B-tree queries for time-range slices, robust `INSERT OR IGNORE` deduplication by aggregate trade ID `a`, compact single-file footprint, and low CPU overhead compared to custom file formats.

### Decision 3: Service Port Allocation
- **Choice**: The footprint collector & read API service will bind to `127.0.0.1:3101`.
- **Rationale**: The production Vela service is on port 3000. Port 3101 is well above the required >= 3100 boundary, bound strictly to loopback (`127.0.0.1`), ensuring zero interference with existing services.

### Decision 4: Safe Fallback for Saved Chart Styles
- **Choice**: If a chart style resolves to "footprint" but the data engine or renderer has no data, or if fallback is triggered, default to "candles".
- **Rationale**: Prevents crashes or blank canvas states when loading workspaces that previously had footprint enabled.

### Decision 5: Public Market Data Only
- **Choice**: Binance USD-M Futures public endpoints only (`wss://fstream.binance.com/stream` and `https://fapi.binance.com/fapi/v1/aggTrades`).
- **Rationale**: Public endpoints require zero API keys, zero authentication, avoiding any private keys or account exposure.

### Decision 6: Price Bucketing Formula & Numerical Precision
- **Choice**: Price buckets use `round(price / bucketSize) * bucketSize` formatted to symbol price precision.
- **Rationale**: Eliminates IEEE 754 floating-point drift (e.g. `67500.10000000002`) while guaranteeing consistent bucket grouping between live WebSocket ticks, REST backfill trades, and bulk data zips.

### Decision 7: Slice Boundary Alignment
- **Choice**: Discrete 1-minute slices align strictly to UTC epoch minutes (`Math.floor(T / 60000) * 60000`).
- **Rationale**: Standardized integer boundaries allow deterministic slicing, caching, and linear merging into higher timeframes (5m, 15m, 1h, 4h, 1d).

### Decision 8: REST Rate-Limiter & Backoff
- **Choice**: Enforce a token-bucket rate limiter of 5 requests/sec (100 weight/sec, ~6000 weight/min max theoretical, throttled to 1200 weight/min) with exponential backoff on HTTP 429/418.
- **Rationale**: Guarantees we never exceed Binance IP rate limits or trigger bans during backfill or gap repair.

### Decision 9: Canvas2D Footprint Ladder Rendering & Viewport Clipping
- **Choice**: Footprint ladder is rendered via a high-performance Canvas2D layer registered with `registerRendererLayer({ id: 'footprint', placement: 'above-data' })`. The ladder canvas area is strictly clipped above the docked stats table (`tableTop = bounds.top + bounds.height - statsTableHeight`) using `ctx.clip()`, ensuring numbers and ladder cells never overlap the summary statistics.

### Decision 10: Point of Control (POC) Golden Outline
- **Choice**: The level with the maximum total traded volume in each bar is designated as the Point of Control (POC) and outlined with a 1.5px border in brand `HIGHLIGHT` gold (`#e0b400`).

### Decision 11: Diagonal Imbalance Detection via Integer Bucket Keys
- **Choice**: Diagonal imbalances compare ask at price level $ against bid at level -1$ (buy imbalance $\ge 3.0\times$), and bid at level $ against ask at level +1$ (sell imbalance $\ge 3.0\times$). Levels are indexed by integer bucket index `Math.round(price / bucketSize)`, eliminating floating point drift.

### Decision 12: Docked Orderflow Statistics Table
- **Choice**: Docked at the bottom of the price pane with a 72px dedicated height and pinned 75px left-header plate displaying: Delta, Min Delta, Max Delta, Cum Delta, and Volume. Bar columns align 1:1 with chart bars via `coords.timeToX(time)`.

### Decision 13: Mint Proxy Routing for Binance USD-M Futures WebSocket & Market Route Update
- **Choice**: Configured `mint` (local homelab VM 106, Moroccan residential IP `196.117.67.189`) as a dedicated HTTP CONNECT forward proxy for outbound Binance Futures WebSocket traffic, and updated the stream endpoint from legacy `/stream?streams=...` to Binance's official `/market/stream?streams=...`.
- **Rationale**:
  1. Binance recently migrated its market data routing architecture to require the `/market/` prefix; legacy URLs silently ACK but push zero data frames.
  2. To guarantee 100% resilient ingestion immune to UK cloud IP restrictions, LXC 115 routes WebSocket handshakes via a persistent SSH reverse tunnel to `mint-proxy` running on Mint (port 10808).
  3. If the proxy tunnel is ever unavailable, the collector automatically falls back to direct connection and continuous REST gap repair, ensuring orderflow data never drops.
