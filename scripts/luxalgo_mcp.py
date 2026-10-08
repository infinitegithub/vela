#!/usr/bin/env python3
"""
LuxAlgo MCP Library Client
Direct CLI interface to query the official LuxAlgo Library MCP server (https://mcp.luxalgo.com/mcp).
Provides instant access to 800+ indicators, mathematical formulas, and Pine Script source code.
"""

import sys
import json
import argparse
import urllib.request
import urllib.error

MCP_ENDPOINT = "https://mcp.luxalgo.com/mcp"

def call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    req_payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments
        }
    }
    data_bytes = json.dumps(req_payload).encode("utf-8")
    req = urllib.request.Request(
        MCP_ENDPOINT,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "User-Agent": "LuxAlgo-Vela-Client/1.0"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            for line in raw.splitlines():
                if line.startswith("data: "):
                    parsed = json.loads(line[6:])
                    if "error" in parsed:
                        raise RuntimeError(f"MCP error: {parsed['error']}")
                    res = parsed.get("result", {})
                    content_list = res.get("content", [])
                    if content_list and "text" in content_list[0]:
                        text = content_list[0]["text"]
                        try:
                            return json.loads(text)
                        except json.JSONDecodeError:
                            return {"text": text}
                    return res
    except urllib.error.URLError as e:
        sys.stderr.write(f"Network error querying LuxAlgo MCP ({MCP_ENDPOINT}): {e}\n")
        sys.exit(1)
    return {}

def cmd_search(args):
    context = f"Searching indicator library for {args.query} to check reference implementations"
    params = {"query": args.query, "context": context}
    if args.type:
        params["type"] = args.type
    if args.family:
        params["family"] = args.family
    if args.limit:
        params["limit"] = args.limit
    res = call_mcp_tool("library_search", params)
    results = res.get("results", [])
    if not results:
        print(f"No results found for query: '{args.query}'")
        return
    print(f"Found {len(results)} matches for '{args.query}':\n")
    for item in results:
        kind = item.get("kind", "").upper()
        name = item.get("name", "")
        slug = item.get("slug", "")
        family = item.get("family", "")
        desc = item.get("description", "")
        print(f"[{kind}] {name} (slug: {slug}) | Family: {family}")
        if desc:
            print(f"  {desc.strip()}")
        print(f"  URL: {item.get('url', '')}\n")

def cmd_concept(args):
    context = f"Retrieving trading concept description and formula for {args.slug}"
    res = call_mcp_tool("library_get_concept", {"slug": args.slug, "context": context})
    md = res.get("content_markdown", "") or res.get("text", "")
    if md:
        print(md)
    else:
        print(json.dumps(res, indent=2))

def cmd_indicator(args):
    context = f"Retrieving indicator metadata and settings for {args.slug}"
    res = call_mcp_tool("library_get_indicator", {"slug": args.slug, "context": context})
    print(json.dumps(res, indent=2))

def cmd_code(args):
    context = f"Retrieving working indicator source code for {args.slug}"
    res = call_mcp_tool("library_get_source_code", {"slug": args.slug, "context": context})
    source = res.get("source_code", "") or res.get("source", "") or res.get("text", "")
    if source:
        print(source)
    else:
        print(json.dumps(res, indent=2))

def cmd_list_concepts(args):
    context = "Listing concepts from LuxAlgo indicator library"
    params = {"context": context}
    if args.family:
        params["family"] = args.family
    res = call_mcp_tool("library_list_concepts", params)
    print(json.dumps(res, indent=2))

def cmd_list_indicators(args):
    context = "Listing indicators from LuxAlgo indicator library"
    params = {"context": context}
    if args.family:
        params["family"] = args.family
    res = call_mcp_tool("library_list_indicators", params)
    print(json.dumps(res, indent=2))

def main():
    parser = argparse.ArgumentParser(description="LuxAlgo Library MCP Client")
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # Search
    p_search = subparsers.add_parser("search", help="Search concepts and indicators")
    p_search.add_argument("query", help="Search term (e.g. 'supertrend', 'rsi')")
    p_search.add_argument("--type", choices=["all", "concepts", "indicators"], default="all")
    p_search.add_argument("--family", help="Filter by concept family")
    p_search.add_argument("--limit", type=int, default=10, help="Max results")
    p_search.set_defaults(func=cmd_search)

    # Concept
    p_concept = subparsers.add_parser("concept", help="Get concept definition and formula")
    p_concept.add_argument("slug", help="Concept slug (e.g. 'supertrend', 'order-blocks')")
    p_concept.set_defaults(func=cmd_concept)

    # Indicator
    p_ind = subparsers.add_parser("indicator", help="Get indicator details")
    p_ind.add_argument("slug", help="Indicator slug")
    p_ind.set_defaults(func=cmd_indicator)

    # Code
    p_code = subparsers.add_parser("code", help="Get full source code for indicator")
    p_code.add_argument("slug", help="Indicator slug")
    p_code.set_defaults(func=cmd_code)

    # List Concepts
    p_lc = subparsers.add_parser("list-concepts", help="List concepts")
    p_lc.add_argument("--family", help="Optional family filter")
    p_lc.set_defaults(func=cmd_list_concepts)

    # List Indicators
    p_li = subparsers.add_parser("list-indicators", help="List indicators")
    p_li.add_argument("--family", help="Optional family filter")
    p_li.set_defaults(func=cmd_list_indicators)

    args = parser.parse_args()
    args.func(args)

if __name__ == "__main__":
    main()
