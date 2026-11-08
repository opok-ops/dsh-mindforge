import { defineConfig } from 'vitest/config'

// 真实桥接 E2E 独立入口：仅收集 tests/e2e/（.e2e.ts 后缀不进默认
// include，`npm test` 的 mock 单测不受影响，CI 中由 e2e job 专属调用）。
// 前置条件：MindForge CLI 可用（PATH 上的 `MindForge` 或 MINDFORGE_CLI）。
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.ts'],
    // 顺序敏感：种子 → 检索 → 压缩链（apply → list → decompress）→ adaptive
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
})
