#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const spaceId = process.argv[2] ?? process.env.HF_SPACE_ID;
if (!spaceId) {
  console.error("Usage: npm.cmd run deploy:engine:hf -- <hugging-face-user>/<space-name>");
  process.exit(1);
}

if (!/^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*$/.test(spaceId)) {
  console.error("The Space id must look like: hugging-face-user/space-name");
  process.exit(1);
}

const engineDirectory = fileURLToPath(new URL("../pob-engine/", import.meta.url));
const command = process.platform === "win32" ? "hf.exe" : "hf";
const result = spawnSync(command, [
  "upload",
  spaceId,
  engineDirectory,
  ".",
  "--repo-type",
  "space",
  "--commit-message",
  "Deploy PoE Upgrade Optimizer engine",
], { stdio: "inherit", shell: false });

if (result.error?.code === "ENOENT") {
  console.error("The Hugging Face CLI was not found. Install it with: py -m pip install --upgrade huggingface_hub");
  console.error("Then authenticate once with: hf auth login");
  process.exit(1);
}

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
