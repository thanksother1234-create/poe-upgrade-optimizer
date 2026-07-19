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
- Equipment slots use a symmetric 9-by-9 square grid with smaller artwork bounds. Ring 1 sits immediately left of the body armour; Ring 2 and the amulet use matching one-cell jewelry proportions immediately to its right. Weapon/offhand and gloves/boots remain balanced on opposite sides.
- The equipment panel now uses a taller 10-by-9 layout and imports all five active flask slots beneath the worn gear. Flasks use the same CDN artwork lookup, rarity styling, full raw-stat tooltip, keyboard focus, and hover interaction as armour while remaining display-only (they are not offered as armour/weapon replacement targets).
- Flask art synchronization includes PoE life, mana, hybrid, and utility flask classes. The five flask cells are centered 1-by-2 portrait rectangles. Because PoB omits a separate base-type line for affixed magic flasks, their artwork lookup extracts the embedded base name (such as Amethyst or Quicksilver Flask); unique flasks continue using their unique artwork.
- Active and support gems use direct PoE CDN artwork when available, with the generic gem glyph as an image-failure fallback. The local index currently covers 601 gems, and `npm.cmd run sync:item-art` refreshes both equipment and skill-gem art indexes.
- The hosted PoB worker loads XML and directly binds the active tree/item/skill/config objects without calling PoB's UI setters. In particular, never call `SetActiveItemSet` on an already-active set: it writes current UI/default slots back into the loaded set and can erase equipment/flask ids before calculation. Configuration modifiers are rebuilt, then calculations run until stable for three frames (up to 30).
- Headless PoB now calculates timeless jewels correctly. The Docker build expands every bundled timeless-jewel table to `.bin`, and the worker supplies the missing file-search/script-path functions used by PoB's lazy jewel loader. The attached Lethal Pride regression export now reproduces 5,979,981.114 Combined DPS instead of 56,778.121; the supplied weapon evaluates at 6,742,657.541 and the amulet at 6,765,414.997.
- A recalculated baseline that differs materially from the imported `<PlayerStat>` snapshot remains fatal: the server returns 409 and does not rank or display candidates against the wrong baseline.
- The skill panel no longer controls the equipment grid's height: a resize observer locks the scrollable gem panel to the equipment panel's natural 7-by-6 aspect ratio. CDN gem sprites are cropped to their right-side inventory gem artwork (the same style shown by PoE Wiki), with the generic glyph retained as a failure fallback.
- Support artwork lookup handles PoB's shortened names by retrying with the inventory-name `Support` suffix (for example, `Faster Attacks` resolves as `Faster Attacks Support`). Inventory gem sprite crops are horizontally centered in their frames.
- The weighted-search stat picker is a searchable autocomplete instead of a long select menu. It filters compatible stat labels and explanations while typing and supports mouse, Arrow Up/Down, Enter, and Escape interaction.
- Manual weighted-search stats combine the curated PoB-measurable definitions with a generated item-type-aware affix index. `npm.cmd run sync:trade-affixes` joins RePoE spawn tags to official PoE trade-stat IDs; the current index contains 537 affixes, including elemental and individual resistance penetration mods. PoE Wiki's API is not used because it returns an anti-bot page.
- Candidate comparison values no longer truncate after recalculation. The DPS metric receives additional width, before/after values remain visible inside the card, and two-column comparison cards begin at the wider `xl` breakpoint.

## Verification

- Exact PoB 2.65 headless regression: attached Lethal Pride baseline and both supplied replacements reproduced successfully.
- Engine tests: 17 passed.
- Application tests: 58 passed, including all four imported magic-flask base-art cases and a unique-flask exclusion case.
- ESLint passed.
- TypeScript passed.
- Production build passed (existing Vinext chunk/dynamic-import warnings only).
- Docker image build was not run because Docker is unavailable in this desktop environment; the image preparation step was exercised directly against PoB 2.65's complete timeless-jewel dataset.

## Deployment

- The Hugging Face timeless-jewel fix is live and was confirmed by the user.
- Vercel needs redeployment for the comparison-card, jewelry-layout, and magic-flask-art UI fixes.

## Next steps

1. Redeploy the application to Vercel when authorized, then verify the comparison cards and equipment grid in production.
2. After every code change, update this file with the date, summary, affected files or behavior, verification results, and remaining work.

## Maintenance convention

This file is the durable context bridge between Codex tasks and machines. Keep it concise and describe only the repository's current state. Replace stale status instead of accumulating a long session transcript.
