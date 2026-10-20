"""Isolated ScrapeGraphAI MCP server. No public listener without a secure proxy."""
import os
from urllib.parse import urlparse
from fastmcp import FastMCP
from scrapegraphai.graphs import SmartScraperGraph

mcp = FastMCP("ScrapeGraphAI")
ALLOWED = {d.strip().lower() for d in os.getenv("SCRAPER_ALLOWED_DOMAINS","").split(",") if d.strip()}

@mcp.tool()
def scrape_page(url: str, instruction: str) -> dict:
    """Extract structured data from an allowlisted HTTPS webpage using an AI prompt."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not ALLOWED or not any(host == d or host.endswith("." + d) for d in ALLOWED):
        return {"error":"Domain is not allowlisted or URL is not HTTPS"}
    if not instruction.strip() or len(instruction) > 2000:
        return {"error":"Instruction must contain 1-2000 characters"}
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {"error":"OPENAI_API_KEY not configured"}
    graph = SmartScraperGraph(
        prompt=instruction,
        source=url,
        config={"llm":{"api_key":key,"model":os.getenv("SCRAPER_MODEL","openai/gpt-4o-mini")},
                "verbose":False,"headless":True,
                "loader_kwargs":{"timeout":20,"retry_limit":1}},
    )
    return {"source":url,"result":graph.run()}

if __name__ == "__main__":
    mcp.run(transport="http",host="127.0.0.1",port=8767)
