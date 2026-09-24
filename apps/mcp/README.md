# @pluckai/mcp

The [Pluck](https://pluck.procd.cc) MCP server: give any MCP client (Claude Code, Claude Desktop, Cursor, or your own agent) the ability to read the live web as clean markdown, crawl a site, search, extract structured JSON, and watch pages for changes.

## Add it to a client

Hosted, no install:

```json
{
  "mcpServers": {
    "pluck": {
      "url": "https://pluck-mcp.procd.cc/mcp",
      "headers": { "Authorization": "Bearer $PLUCK_API_KEY" }
    }
  }
}
```

Or over stdio:

```json
{
  "mcpServers": {
    "pluck": {
      "command": "npx",
      "args": ["-y", "@pluckai/mcp"],
      "env": { "PLUCK_API_KEY": "pk_live_…" }
    }
  }
}
```

Get a key at [pluck.procd.cc](https://pluck.procd.cc). New accounts start with 1,000 free credits.

## Tools

| Tool | What the model gets |
| --- | --- |
| `pluck_scrape` | One page as markdown, HTML, links or images |
| `pluck_crawl` | A whole site, with depth and path rules |
| `pluck_search` | Web, news or image results, optionally already read |
| `pluck_map` | Every URL on a site |
| `pluck_extract` | JSON matching a schema you describe |
| `pluck_parse` | PDFs and documents as markdown |
| `pluck_brand` | Logos, colours, fonts and socials for a domain |
| `pluck_styleguide` | Colours, type and spacing from a rendered page |
| `pluck_monitor` | Watch a page and report what changed |

## Point it somewhere else

`PLUCK_API_URL` (or `PLUCK_API_INTERNAL_URL`) sends the server at your own Pluck instance, so a self-hosted deployment works exactly the same:

```json
{
  "env": { "PLUCK_API_KEY": "pk_live_…", "PLUCK_API_URL": "http://localhost:8080" }
}
```

Pluck is open source; the [self-hosting guide](https://pluck.procd.cc/docs/self-hosting) has the compose file.

## License

AGPL-3.0-only.
