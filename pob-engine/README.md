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

Every baseline and candidate is evaluated in a fresh LuaJIT/PoB process. This prevents Path of Building from retaining the previously loaded item set between comparisons. In production, whole comparisons are claimed from a durable Redis FIFO queue. A job lease and heartbeat return abandoned in-flight work to the queue after a container restart. One comparison is active by default, while a shared process limiter allows two fresh PoB processes at a time inside it.

The authenticated `POST /evaluate` streaming endpoint remains available for local development and weight calculations. Its smaller in-memory queue is independent from the durable production comparison queue.

The Docker build also expands PoB's bundled timeless-jewel tables and gives the headless worker read access to them. This is required for exact Lethal Pride, Brutal Restraint, Militant Faith, Elegant Hubris, and Glorious Vanity calculations; PoB's stock headless wrapper otherwise silently evaluates the original passive tree without those jewel transformations.

The root URL and `GET /health` are public status endpoints. `POST /evaluate` requires the `ENGINE_TOKEN` bearer token. The service refuses evaluation requests if `ENGINE_TOKEN` is missing. This service does not contact the PoE trade endpoint; it only runs Path of Building calculations for candidates supplied by the user.

## Deploy with Hugging Face Pro

1. Subscribe to Hugging Face Pro, then create a new Space at <https://huggingface.co/new-space>.
2. Set the owner and Space name, choose **Docker → Blank** as the SDK, and make the Space **Public**. The API itself remains protected by `ENGINE_TOKEN`.
3. Keep the Space on **CPU Basic**. CPU Basic has no hourly compute charge; do not select CPU Upgrade or GPU hardware unless you intend to pay its hourly rate.
4. Generate a long engine token and save its output:

   ```powershell
   py -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

5. Open the Space's **Settings**, find **Variables and secrets**, and add a secret named `ENGINE_TOKEN` with the generated value.
6. Create an Upstash Redis database and copy its REST URL and REST token. Add the following to the Space, putting both tokens under **Secrets**:

   ```dotenv
   UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token
   POB_ASYNC_QUEUE_PREFIX=poe-upgrade-optimizer:v1
   POB_ASYNC_JOB_TTL_SECONDS=86400
   POB_ASYNC_WORKER_CONCURRENCY=1
   ```

   Use the exact same URL, token, prefix, and TTL in Vercel. The prefix is the namespace that connects the producer and worker; a mismatch creates two unrelated queues.
7. Install and authenticate the Hugging Face CLI on your computer:

   ```powershell
   py -m pip install --upgrade huggingface_hub
   hf auth login
   ```

8. From the web app repository root, upload only this engine directory to the Space root:

   ```powershell
   npm.cmd run deploy:engine:hf -- YOUR_HF_USERNAME/YOUR_SPACE_NAME
   ```

9. Watch the build under the Space's **Logs** tab. When it is running, open:

   ```text
   https://YOUR_HF_USERNAME-YOUR_SPACE_NAME.hf.space/health
   ```

   A ready engine returns JSON containing `"ok":true`. Copy the direct app URL shown by the Space if its generated hostname differs.

10. In Vercel, add these Production environment variables and redeploy the web app:

   ```dotenv
   POB_ENGINE_URL=https://YOUR_HF_USERNAME-YOUR_SPACE_NAME.hf.space
   POB_ENGINE_TOKEN=the-exact-same-value-as-ENGINE_TOKEN
   UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token
   POB_ASYNC_QUEUE_PREFIX=poe-upgrade-optimizer:v1
   POB_ASYNC_MAX_QUEUED_JOBS=100
   POB_ASYNC_JOB_TTL_SECONDS=86400
   ```

Do not add a trailing `/evaluate` to `POB_ENGINE_URL`; the web app appends that route. CPU Basic can sleep after extended inactivity, so the first optimization after a long idle period can take longer while the container wakes.

For the durable queue, `POB_ASYNC_MAX_QUEUED_JOBS=100` is enforced by Vercel and `POB_ASYNC_WORKER_CONCURRENCY=1` is enforced by the Space. Keep worker concurrency at `1` on CPU Basic. Increasing the waiting limit does not increase throughput; it only allows a larger burst to wait safely. Jobs and results expire after `POB_ASYNC_JOB_TTL_SECONDS`, which defaults to 24 hours.

The direct endpoint's controls are separate. Keep `POB_JOB_CONCURRENCY=1`, `POB_MAX_QUEUED_JOBS=12`, and `POB_WORKER_CONCURRENCY=2` on CPU Basic. The process limiter applies to fresh PoB processes inside either kind of active comparison.

Run the same `npm.cmd run deploy:engine:hf -- ...` command whenever files in this directory change. The uploader sends the contents of `pob-engine` to the root of the Space repository, which is required for Hugging Face to find `Dockerfile` and this README metadata.

## Automatic deployment from GitHub

The repository's `deploy-pob-engine.yml` GitHub Actions workflow uploads this directory to the production Hugging Face Space whenever an engine change reaches `main`. Pull requests are validated separately and never replace the production engine before merge.

Create a fine-grained Hugging Face token with write access to only `rigriffin/poe-upgrade-optimizer-engine`, then save it in the GitHub repository as an Actions secret named `HF_TOKEN`. The workflow can also be started manually from the repository's **Actions** tab.

## Run locally

Install Docker Desktop, then run from this directory:

```powershell
docker compose up --build
```

Docker Compose keeps the local endpoint at port `4317` even though the container listens on Hugging Face's port `7860`. Set these values in the web app's `.env.local`:

```dotenv
POB_ENGINE_URL=http://127.0.0.1:4317
POB_ENGINE_TOKEN=local-development-token
```

Leave the Upstash variables empty to exercise the direct streaming fallback locally, or add the same REST credentials to `.env.local` and the Docker Compose environment to exercise durable submission and resume behavior.

The image pins Path of Building `v2.65.0`. Change the `POB_VERSION` Docker build argument when a newer compatible release is available, then redeploy the service and rerun the regression tests.
