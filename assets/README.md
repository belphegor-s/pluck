# Brand assets

Everything needed to register Pluck with a provider (GitHub, npm, Polar, OpenRouter, an app store listing) without regenerating anything.

| File | Use |
| --- | --- |
| `icon.svg` | App icon: the mark on an ink tile. The web favicon. |
| `icon-512.png`, `icon-192.png` | Square app icons for manifests and provider uploads. |
| `apple-touch-icon.png` | 180×180, iOS home screen. |
| `favicon-32.png` | Small favicon for anything that refuses SVG. |
| `mark.svg`, `mark-512.png` | The bare mark for light backgrounds. |
| `mark-dark.svg`, `mark-dark-512.png` | The bare mark for dark backgrounds. |
| `wordmark.svg`, `wordmark.png` | Mark plus name, for headers and README banners. |
| `og-image.svg`, `og-image.png` | 1200×630 social card. |

## Colors

| Token | Light | Dark |
| --- | --- | --- |
| Ink (text, stroke) | `#0d211b` | `#e8efe9` |
| Paper (background) | `#eaeee9` | `#0a1210` |
| Sheet (panels) | `#f4f6f2` | `#101a17` |
| Berry (accent) | `#b7185c` | `#ff5c95` |
| Leaf (positive) | `#1f6f52` | `#57c79a` |

## Type

Bricolage Grotesque for display, IBM Plex Sans for text, IBM Plex Mono for code and data. All three are open source and available from Google Fonts.

The wordmark files reference Bricolage Grotesque by name rather than embedding outlines, so a renderer without the font falls back to a neutral sans. Convert the text to paths before sending the wordmark somewhere you cannot control.

## Using the mark

Keep clear space of at least the berry's diameter on every side. The berry is the only element that may be recolored, and only to the dark-mode accent. Do not rotate the mark, add effects, or place the light version on a dark background; `mark-dark.svg` exists for that.

Regenerate the PNGs after editing any SVG; they are rasterized from these sources at 600 DPI.
