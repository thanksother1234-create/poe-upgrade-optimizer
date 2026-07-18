# PoE Upgrade Optimizer

PoE Upgrade Optimizer imports a Path of Building build, guides the user to collect candidates from the official Path of Exile trade site, replaces each pasted candidate in the build, and ranks only improvements recalculated by the official Path of Building Community engine.

## Architecture

- The Vinext/Vite/Next application runs on Vercel and owns the UI, league discovery, copied-item validation, and ranking.
- The app creates build- and goal-aware Weighted Sum recipes for each selected slot, opens the official league trade page, and makes no automated requests to PoE's private trade-search endpoints. Users enter the copied weights, then paste candidate item text and its displayed price for exact evaluation.
- [`pob-engine`](./pob-engine) is a small authenticated Docker service containing LuaJIT and Path of Building `v2.65.0`. It evaluates the baseline and every user-supplied candidate.
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

Deploy [`pob-engine`](./pob-engine) as a Hugging Face Pro Docker Space by following its [step-by-step setup guide](./pob-engine/README.md#deploy-with-hugging-face-pro). Keep the Space on the included CPU Basic hardware and configure a long random `ENGINE_TOKEN` as a Space secret, then add these environment variables to the Vercel project:

```dotenv
POB_ENGINE_URL=https://your-pob-engine.example.com
POB_ENGINE_TOKEN=the-same-long-random-token
```

Redeploy both the Hugging Face engine and Vercel after setting the variables. `POE_USER_AGENT` is not required because the application does not automate PoE trade searches. The optimizer returns an explicit configuration error instead of silently falling back to estimated item stats if the engine is missing or unavailable.

Future worker updates can be uploaded from this repository with:

```powershell
npm.cmd run deploy:engine:hf -- YOUR_HF_USERNAME/YOUR_SPACE_NAME
```

## Verification

```powershell
npm.cmd test
npm.cmd run test:engine
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Path of Exile is a trademark of Grinding Gear Games. This project is not affiliated with Grinding Gear Games.
