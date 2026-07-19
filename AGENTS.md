<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project architecture

- The Vinext/Vite/Next web application lives under `src` and deploys to Vercel.
- The authenticated Path of Building service lives under `pob-engine` and deploys separately to the Hugging Face Docker Space.
- Do not replace exact Path of Building calculations with TypeScript estimates or automate Path of Exile trade-search requests.
- Never deploy, merge, push, or change repository/hosting secrets unless the user explicitly requests that external action.

## Verification

Run the checks relevant to the files changed. For broad or cross-cutting changes, run all of:

```text
npm run lint
npm run typecheck
npm test
npm run test:engine
npm run build
```

When reporting results, distinguish passing checks from commands that could not run in the current environment.
