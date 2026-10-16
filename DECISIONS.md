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
