# PoE Upgrade Optimizer

PoE Upgrade Optimizer imports a Path of Building build, fetches real listings from the selected Path of Exile league, replaces each candidate in the build, and ranks only improvements recalculated by the official Path of Building Community engine.

## Architecture

- The Vinext/Vite/Next application runs on Vercel and owns the UI, league discovery, validation, and ranking.
- [`pob-engine`](./pob-engine) is a small authenticated Docker service containing LuaJIT and Path of Building `v2.65.0`. It performs the live trade requests from Hugging Face and evaluates the baseline and every candidate because Path of Exile blocks Vercel's shared outbound network.
- The hosted trade gateway spaces PoE searches at least 2.1 seconds apart, spaces listing fetches at least 400 milliseconds apart, and shares identical results for 30 seconds to reduce upstream traffic.
- A live listing's `extended.text` field is decoded and inserted into the imported build XML. The worker then reads PoB's real `mainOutput` metrics; the TypeScript estimator is not used by the live endpoint.

Exact combinations are intentionally not displayed yet. Adding individual verified deltas together can be wrong when modifiers interact, so the live result only claims what PoB actually recalculated.

## Local development

1. Install Docker Desktop.
2. Start the calculation engine:

   ```powershell
   cd pob-engine
   docker compose up --build
   ```

3. Copy `.env.example` to `.env.local` and replace the contact email in `POE_USER_AGENT`.
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
POE_USER_AGENT=OAuth PoEUpgradeOptimizer/0.2 (contact: your-email@example.com)
```

Redeploy both the Hugging Face engine and Vercel after setting the variables. `POE_USER_AGENT` remains server-only: Vercel forwards it only inside the bearer-token-protected engine request, and neither service logs its value. The optimizer returns an explicit configuration error instead of silently falling back to estimated item stats if the engine is missing or unavailable.

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
