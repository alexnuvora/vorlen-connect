# ScrapeGraphAI MCP worker
Isolated from the Vorlen session worker. Provides `scrape_page(url,instruction)` through local-only Streamable HTTP at `127.0.0.1:8767/mcp`. It is **not a public endpoint or installable ChatGPT plugin yet**.

Required host secrets: `/etc/scrapegraph-mcp.env` (root-owned, mode 600), with `OPENAI_API_KEY`, `SCRAPER_ALLOWED_DOMAINS` (comma-separated hostnames), optional `SCRAPER_MODEL`. Do not check these into git. Add an OAuth-enabled HTTPS reverse proxy before exposing to the internet. Do not open 8767 in OCI security lists or firewall. Use only authorized public sites and respect their access policies.

Installation on Ubuntu:
```sh
sudo apt-get update && sudo apt-get install -y python3-venv python3-pip
sudo useradd -r -m -d /var/lib/scrapegraph-mcp -s /usr/sbin/nologin scrapegraph-mcp || true
sudo install -d -m 755 /opt/scrapegraph-mcp
sudo cp server.py requirements.txt /opt/scrapegraph-mcp/
sudo python3 -m venv /opt/scrapegraph-mcp/.venv
sudo /opt/scrapegraph-mcp/.venv/bin/pip install -r /opt/scrapegraph-mcp/requirements.txt
sudo /opt/scrapegraph-mcp/.venv/bin/python -m playwright install chromium
sudo install -m 644 scrapegraph-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now scrapegraph-mcp
```
On small Always Free VMs, browser installation and AI extraction may exhaust RAM; check memory before deploying. A paid LLM API can incur charges. 