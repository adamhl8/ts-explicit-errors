import { vitestConfig } from "@adamhl8/configs"
import { defineConfig } from "vitest/config"

const config = vitestConfig({
  test: { coverage: { exclude: ["src/__tests__/**"] } },
})

export default defineConfig(config)
