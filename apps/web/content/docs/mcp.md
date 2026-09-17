# MCP server

Pluck speaks the Model Context Protocol, so agents can fetch the web themselves instead of you plumbing it through.

## Hosted

```json
{
  "mcpServers": {
    "pluck": {
      "url": "https://pluck-mcp.procd.cc/mcp",
      "headers": { "Authorization": "Bearer pk_live_…" }
    }
  }
}
```

In Claude Code: `claude mcp add --transport http pluck https://pluck-mcp.procd.cc/mcp --header "Authorization: Bearer pk_live_…"`.

## Local (stdio)

```json
{
  "mcpServers": {
    "pluck": {
      "command": "npx",
      "args": ["-y", "@pluck/mcp"],
      "env": { "PLUCK_API_KEY": "pk_live_…" }
    }
  }
}
```

Point it at your own instance with `PLUCK_API_URL`.

## Tools

`pluck_search`, `pluck_scrape`, `pluck_map`, `pluck_crawl`, `pluck_crawl_status`, `pluck_parse`, `pluck_extract`, `pluck_brand`, `pluck_styleguide`.

All are read-only and return markdown for the model plus the full object as structured content. Tool descriptions carry the credit cost so an agent can weigh a large crawl against a cheap map.

Requests are stateless: no sessions to keep alive, and the server scales horizontally behind a single URL.
