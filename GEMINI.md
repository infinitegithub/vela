# Project Rules: Vela & LuxAlgo Library Integration

## Indicator Creation & Modification Guidelines
When tasked with creating, modifying, porting, or debugging an indicator in Vela:
1. **Always Consult LuxAlgo MCP First**: Do not create custom mathematical indicators from scratch before checking the official LuxAlgo Indicator Library MCP server at `https://mcp.luxalgo.com/mcp`.
2. **Tools**:
   - `library_search`: Search 800+ indicators and concepts.
   - `library_get_concept`: Get mathematical definition and formulas.
   - `library_get_indicator`: Get metadata and inputs.
   - `library_get_source_code`: Get full Pine Script source code.
3. **CLI**: Use `python3 scripts/luxalgo_mcp.py search <query>` or `code <slug>`.
4. **Vela Implementation**: Either execute the Pine Script via `@luxalgo/vela-pinets` (`PineWorkerEngine`) or adapt the formulas into native TypeScript indicators (`registerNativeIndicator` / `registerRendererLayer`).
