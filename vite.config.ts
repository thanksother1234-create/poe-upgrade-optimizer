import { defineConfig } from "vite";
import vinext from "vinext";
import { nitro } from "nitro/vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  plugins: [
    tailwindcss(),
    vinext(),
    ...(command === "build" ? [nitro()] : []),
  ],
}));
