# Extraction

`POST /v1/extract` reads a page and returns JSON shaped the way you asked. Pluck scrapes the page, hands the markdown to a language model with your schema, and validates the answer before replying.

```bash
curl -X POST https://pluck-api.procd.cc/v1/extract \
  -H "Authorization: Bearer $PLUCK_API_KEY" \
  -d '{
    "url": "https://news.ycombinator.com",
    "prompt": "The five highest scoring stories",
    "schema": {
      "type": "object",
      "properties": {
        "stories": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "points": { "type": "number" },
              "url":    { "type": "string" }
            },
            "required": ["title", "points"]
          }
        }
      }
    }
  }'
```

Send `schema`, `prompt`, or both. With no schema you get whatever object the prompt implies.

## Products

`POST /v1/extract/product` and `/v1/extract/products` return normalised product data: name, price, currency, availability, images, rating, review count, attributes. They read the site's own structured data first and only fall back to a model when a page has none, which means most shops cost 3 credits rather than 11.

## Styleguides

`POST /v1/styleguide` opens the page in a browser and reports what it actually renders: background and text colors, the real palette weighted by area, fonts and where they are used, heading scale, button and input styles, radii, shadows, spacing steps and CSS custom properties. No model involved.

## Choosing the model

By default AI steps run on the instance's model and cost 8 credits. Add your own provider key and they cost 1:

- Save a key in [Model provider](/dashboard/ai), or
- send it per request:

```bash
-H "x-llm-provider: anthropic" \
-H "x-llm-key: sk-ant-…" \
-H "x-llm-model: claude-haiku-4-5"
```

Supported providers: OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, and any OpenAI-compatible endpoint including Ollama, vLLM and LM Studio. Saved keys are encrypted with AES-256-GCM and never returned by the API.

## Prompt injection

Page content is untrusted. Pluck wraps it in tags and instructs the model to treat it as data, but a determined page can still try to steer a model. Validate anything you act on, and do not hand extracted text straight to a tool with side effects.
