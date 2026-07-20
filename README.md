# PoE Upgrade Optimizer

PoE Upgrade Optimizer imports a Path of Building build, guides the user to collect candidates from the official Path of Exile trade site, replaces each pasted candidate in the build, and ranks only improvements recalculated by the official Path of Building Community engine.

## Architecture

- The Vinext/Vite/Next application runs on Vercel and owns the UI, league discovery, copied-item validation, and ranking.
- The app creates build- and goal-aware Weighted Sum recipes for each selected slot, opens the official league trade page, and makes no automated requests to PoE's private trade-search endpoints. Users enter the copied weights, then paste candidate item text and its displayed price for exact evaluation.
- [`pob-engine`](./pob-engine) is a small authenticated Docker service containing LuaJIT and Path of Building `v2.65.0`. It evaluates the baseline and every user-supplied candidate.
- Production comparisons use a Redis-backed asynchronous FIFO queue. Vercel returns a job ID immediately, the browser polls its saved position, and the Hugging Face worker claims jobs atomically. While a job is running, the UI displays its elapsed processing seconds. The worker emits searchable one-line JSON logs for job start, completion, failure, cancellation, and expired-lease recovery, including processing duration without logging build contents. Results and failures remain available for 24 hours, and expired worker leases are recovered after a container restart.
- Copied item text is inserted into the imported build XML. The worker then reads PoB's real `mainOutput` metrics; the TypeScript estimator is not used by the verified endpoint.

Exact combinations are intentionally not displayed yet. Adding individual verified deltas together can be wrong when modifiers interact, so the live result only claims what PoB actually recalculated.

## Local development

1. Install Docker Desktop.
2. Start the calculation engine:

   ```powershell
   cd pob-engine
   docker compose up --build
   ```

3. Copy `.env.example` to `.env.local`.
4. Start the web app from the repository root:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Vercel deployment

Deploy [`pob-engine`](./pob-engine) as a Hugging Face Pro Docker Space by following its [step-by-step setup guide](./pob-engine/README.md#deploy-with-hugging-face-pro). Keep the Space on the included CPU Basic hardware, configure a long random `ENGINE_TOKEN`, and create an Upstash Redis database with its REST API enabled.

Add these values to Vercel. Store both tokens as secrets:

```dotenv
POB_ENGINE_URL=https://your-pob-engine.example.com
POB_ENGINE_TOKEN=the-same-long-random-token
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token
POB_ASYNC_QUEUE_PREFIX=poe-upgrade-optimizer:v1
POB_ASYNC_MAX_QUEUED_JOBS=100
POB_ASYNC_JOB_TTL_SECONDS=86400
```

Add the same `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `POB_ASYNC_QUEUE_PREFIX`, and `POB_ASYNC_JOB_TTL_SECONDS` values to the Hugging Face Space. The queue prefix must match exactly on both hosts. The browser stores an anonymous queue identity and one active job ID in local storage, so a comparison resumes after that browser closes or reloads. No account data is stored.

Redeploy both the Hugging Face engine and Vercel after setting the variables. `POE_USER_AGENT` is not required because the application does not automate PoE trade searches. If the Redis variables are absent, the app deliberately falls back to the original direct streaming request for local development; production should configure Redis so long waits are not bound to Vercel's request timeout.

Future worker updates can be uploaded from this repository with:

```powershell
npm.cmd run deploy:engine:hf -- YOUR_HF_USERNAME/YOUR_SPACE_NAME
```

## Work with Codex from GitHub

The `Codex issue assistant` workflow lets the repository owner request work from a phone or any browser:

1. Create an issue using the **Codex task** template.
2. Add a comment beginning with `/codex`, such as `/codex implement this issue` or `/codex investigate this and explain the likely cause`.
3. Wait for the workflow to reply. If Codex changes files, it opens a separate pull request; it never pushes directly to `main`.

The workflow requires a GitHub Actions repository secret named `OPENAI_API_KEY`. This is an OpenAI Platform API key and is billed separately from a ChatGPT subscription. In **Settings → Actions → General → Workflow permissions**, also enable **Allow GitHub Actions to create and approve pull requests** so the publishing job can open its review PR. Only comments from the repository owner can start the workflow. Codex receives read access plus an isolated writable checkout, while the separate publishing job receives GitHub write access without receiving the OpenAI key.

## Verification

```powershell
npm.cmd test
npm.cmd run test:engine
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Path of Exile is a trademark of Grinding Gear Games. This project is not affiliated with Grinding Gear Games.
