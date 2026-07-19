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

## Verification

Reported by the previous Codex session:

- 47 tests passed.
- TypeScript passed.
- Lint passed.
- Production build passed.

These results have not been rerun in the current session.

The item-popover change still needs lint, typecheck, tests, and a production build run. They could not run in the current desktop environment because Node/npm and `node_modules` were unavailable; an attempted dependency install did not complete.

The standalone PoB engine test suite passes: 12 tests. Frontend lint, typecheck, tests, and build remain unavailable for the same missing-dependency reason.

## Deployment

- Vercel needs redeployment for the web and streaming API changes.
- The Hugging Face Path of Building service needs redeployment for the queue changes.

## Next steps

1. Redeploy the Hugging Face engine, then redeploy the application to Vercel when authorized.
2. After every code change, update this file with the date, summary, affected files or behavior, verification results, and remaining work.

## Maintenance convention

This file is the durable context bridge between Codex tasks and machines. Keep it concise and describe only the repository's current state. Replace stale status instead of accumulating a long session transcript.
