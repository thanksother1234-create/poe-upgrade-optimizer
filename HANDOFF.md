# Project Handoff

Last updated: 2026-07-19

## Current state

- The "What you're wearing" section spans the full page width above section 3.
- The inventory no longer has a fixed minimum width or an internal horizontal scrollbar; it scales to fit its container.
- Blocked PoE Wiki images were replaced with direct Path of Exile CDN artwork.
- The local item-art index covers 955 base items and 871 unique items.
- Item artwork can be refreshed with `npm.cmd run sync:item-art`.
- The PoE Wiki image failure was caused by its server returning an anti-bot HTML page instead of the requested PNG.
- Equipped-item detail popovers hide internal `Unique ID` and `ArmourBasePercentile` fields, remove `{crafted}` markup, and group imported stats into cleaner bordered sections.
- PoB comparisons now use a bounded FIFO queue in `pob-engine`: one whole comparison runs at a time by default, up to 12 may wait, disconnected queued requests are removed, and excess work is rejected. The web UI streams and displays each user's current queue position and running state.
- The equipment view is left-aligned in a two-column layout with a new `Skills & supports` panel. The PoB parser imports active socket groups, linked gems, support status, levels, quality, slot labels, and the main skill directly from the active skill set.
- Equipment slots use a compact 8-by-6 character layout with smaller artwork bounds. Ring 1 sits immediately left of the body armour and Ring 2 immediately right; weapon/offhand and gloves/boots remain balanced on opposite sides.
- The equipment panel now uses a taller 10-by-9 layout and imports all five active flask slots beneath the worn gear. Flasks use the same CDN artwork lookup, rarity styling, full raw-stat tooltip, keyboard focus, and hover interaction as armour while remaining display-only (they are not offered as armour/weapon replacement targets).
- Active and support gems use direct PoE CDN artwork when available, with the generic gem glyph as an image-failure fallback. The local index currently covers 601 gems, and `npm.cmd run sync:item-art` refreshes both equipment and skill-gem art indexes.
- The hosted PoB worker loads the XML, safely rebinds every existing active tree/item/skill/config set, rebuilds configuration modifiers, then forces a clean calculation and waits for three stable metric frames (up to 30). The tree setter is guarded by a real active spec so legacy exports cannot repeat the old `curSpec` crash. Exported `<PlayerStat>` values are cached desktop-UI snapshots, so mismatches against the fresh worker calculation are returned only as `baselineDiagnostics`; the fresh engine baseline remains authoritative for every candidate and becomes the build-summary value.
- The skill panel no longer controls the equipment grid's height: a resize observer locks the scrollable gem panel to the equipment panel's natural 7-by-6 aspect ratio. CDN gem sprites are cropped to their right-side inventory gem artwork (the same style shown by PoE Wiki), with the generic glyph retained as a failure fallback.
- Support artwork lookup handles PoB's shortened names by retrying with the inventory-name `Support` suffix (for example, `Faster Attacks` resolves as `Faster Attacks Support`). Inventory gem sprite crops are horizontally centered in their frames.
- The weighted-search stat picker is a searchable autocomplete instead of a long select menu. It filters compatible stat labels and explanations while typing and supports mouse, Arrow Up/Down, Enter, and Escape interaction.
- Manual weighted-search stats combine the curated PoB-measurable definitions with a generated item-type-aware affix index. `npm.cmd run sync:trade-affixes` joins RePoE spawn tags to official PoE trade-stat IDs; the current index contains 537 affixes, including elemental and individual resistance penetration mods. PoE Wiki's API is not used because it returns an anti-bot page.

## Verification

Reported by the previous Codex session:

- 47 tests passed.
- TypeScript passed.
- Lint passed.
- Production build passed.

These results have not been rerun in the current session.

The item-popover change still needs lint, typecheck, tests, and a production build run. They could not run in the current desktop environment because Node/npm and `node_modules` were unavailable; an attempted dependency install did not complete.

The standalone PoB engine test suite passes: 14 tests. Frontend lint, typecheck, tests, and build remain unavailable for the same missing-dependency reason.

## Deployment

- Vercel needs redeployment for the web and streaming API changes.
- The Hugging Face Path of Building service needs redeployment for the queue changes.

## Next steps

1. Redeploy the Hugging Face engine, then redeploy the application to Vercel when authorized.
2. After every code change, update this file with the date, summary, affected files or behavior, verification results, and remaining work.

## Maintenance convention

This file is the durable context bridge between Codex tasks and machines. Keep it concise and describe only the repository's current state. Replace stale status instead of accumulating a long session transcript.
