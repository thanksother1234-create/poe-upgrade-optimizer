---
title: PoE Upgrade Optimizer Engine
emoji: ⚙️
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# Exact Path of Building engine

This HTTP service runs the official Path of Building Community Lua calculation engine. It is separate from Vercel because the engine needs LuaJIT plus the full PoB data directory.

The root URL and `GET /health` are public status endpoints. `POST /evaluate` and `POST /trade/listings` require the `ENGINE_TOKEN` bearer token. The trade route is deliberately narrow: it only searches the selected league and fetches up to ten returned listings. It spaces PoE searches at least 2.1 seconds apart, spaces listing fetches at least 400 milliseconds apart, and caches identical searches for 30 seconds. The service refuses protected requests if `ENGINE_TOKEN` is missing.

## Deploy with Hugging Face Pro

1. Subscribe to Hugging Face Pro, then create a new Space at <https://huggingface.co/new-space>.
2. Set the owner and Space name, choose **Docker → Blank** as the SDK, and make the Space **Public**. The API itself remains protected by `ENGINE_TOKEN`.
3. Keep the Space on **CPU Basic**. CPU Basic has no hourly compute charge; do not select CPU Upgrade or GPU hardware unless you intend to pay its hourly rate.
4. Generate a long engine token and save its output:

   ```powershell
   py -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

5. Open the Space's **Settings**, find **Variables and secrets**, and add a secret named `ENGINE_TOKEN` with the generated value.
6. Install and authenticate the Hugging Face CLI on your computer:

   ```powershell
   py -m pip install --upgrade huggingface_hub
   hf auth login
   ```

7. From the web app repository root, upload only this engine directory to the Space root:

   ```powershell
   npm.cmd run deploy:engine:hf -- YOUR_HF_USERNAME/YOUR_SPACE_NAME
   ```

8. Watch the build under the Space's **Logs** tab. When it is running, open:

   ```text
   https://YOUR_HF_USERNAME-YOUR_SPACE_NAME.hf.space/health
   ```

   A ready engine returns JSON containing `"ok":true`. Copy the direct app URL shown by the Space if its generated hostname differs.

9. In Vercel, add these Production environment variables and redeploy the web app:

   ```dotenv
   POB_ENGINE_URL=https://YOUR_HF_USERNAME-YOUR_SPACE_NAME.hf.space
   POB_ENGINE_TOKEN=the-exact-same-value-as-ENGINE_TOKEN
   POE_USER_AGENT=OAuth PoEUpgradeOptimizer/0.2 (contact: your-email@example.com)
   ```

Do not add a trailing `/evaluate` to `POB_ENGINE_URL`; the web app appends that route. CPU Basic can sleep after extended inactivity, so the first optimization after a long idle period can take longer while the container wakes.

The web app sends `POE_USER_AGENT` to the engine only over the `ENGINE_TOKEN`-protected request. The engine uses it for the outbound PoE request without logging its value, so you do not need to duplicate the contact identity in the Space settings.

Run the same `npm.cmd run deploy:engine:hf -- ...` command whenever files in this directory change. The uploader sends the contents of `pob-engine` to the root of the Space repository, which is required for Hugging Face to find `Dockerfile` and this README metadata.

## Run locally

Install Docker Desktop, then run from this directory:

```powershell
docker compose up --build
```

Docker Compose keeps the local endpoint at port `4317` even though the container listens on Hugging Face's port `7860`. Set these values in the web app's `.env.local`:

```dotenv
POB_ENGINE_URL=http://127.0.0.1:4317
POB_ENGINE_TOKEN=local-development-token
POE_USER_AGENT=OAuth PoEUpgradeOptimizer/0.2 (contact: your-email@example.com)
```

The image pins Path of Building `v2.65.0`. Change the `POB_VERSION` Docker build argument when a newer compatible release is available, then redeploy the service and rerun the regression tests.
