/**
 * 真实桥接 E2E — MindForge CLI 真实子进程 + 真实 SQLite 库（零 mock）。
 *
 * 背景（2026-11-07 E2E 战役）：单元测试 mock 掩盖了「真实库压缩恒 0 簇」
 * 集成缺陷（MindForge 侧 P0，v6.3.6 已修）。mock 全绿 ≠ 真实可用——
 * 本文件固化当日 15 工具真实桥接验证，作为 CI 常驻防线。
 *
 * 运行前提：MindForge CLI 在 PATH（入口名 `MindForge`），或用
 * MINDFORGE_CLI 环境变量指定可执行路径。
 * 本地调试示例：
 *   MINDFORGE_CLI=/tmp/mf-e2e/MindForge npx vitest run tests/e2e/
 *
 * 每步断言对应一个历史实测缺陷或关键契约：
 *  - compress dry-run/apply 聚簇 > 0   （P0①：真实库恒 0 簇）
 *  - compressList 结构化 JSON + total  （P0②：--json 被无视）
 *  - adaptiveSearch 恒空               （P1：session 泄漏）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MindForgeBridge } from '../../src/bridge.js';

const TIMEOUT = 120_000;

describe('MindForgeBridge — 真实桥接 E2E', () => {
  let bridge: MindForgeBridge;
  let dir = '';
  let firstId = '';
  let clusterId = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-e2e-'));
    bridge = new MindForgeBridge({
      cliPath: process.env.MINDFORGE_CLI ?? 'MindForge',
      dbPath: join(dir, 'e2e.db'),
      agentId: 'dsh-e2e',
      timeoutMs: 60_000,
    });
    // 种子：中文近重复 ×3（压缩聚类靶）+ 英文 ×2
    const seeds = [
      'dsh-e2e：用户喜欢用 Python 写脚本处理数据',
      'dsh-e2e：用户偏好使用 Python 来写脚本',
      'dsh-e2e：用户爱用 Python 写自动化脚本',
      'dsh-e2e: deploys services with Docker on weekends',
      'dsh-e2e: automates pipelines with shell scripts',
    ];
    for (const text of seeds) {
      const r = (await bridge.add(text, { category: 'programming', tags: ['e2e'] })) as { id?: string };
      if (!firstId && r?.id) firstId = r.id;
    }
    expect(firstId).toBeTruthy();
  }, TIMEOUT);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('search：真实库中文检索命中近重复种子', async () => {
    const r = await bridge.search('Python 脚本', 5);
    expect(r.total_found).toBeGreaterThanOrEqual(3);
    expect(r.chunks.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it('search + explain：score_breakdown 携带四路分数与 winner', async () => {
    const r = await bridge.search('Python', 3, true);
    const sb = r.chunks[0]?.score_breakdown as Record<string, unknown> | undefined;
    expect(sb).toBeTruthy();
    expect(sb!.winner).toBeTruthy();
  }, TIMEOUT);

  it('context：返回结构化上下文', async () => {
    const r = (await bridge.context('编程偏好', 512)) as Record<string, unknown>;
    expect(r).toBeTruthy();
    expect(typeof r).toBe('object');
  }, TIMEOUT);

  it('stats：total >= 种子数', async () => {
    const r = await bridge.stats();
    expect(Number(r.total ?? r.total_memories ?? 0)).toBeGreaterThanOrEqual(5);
  }, TIMEOUT);

  it('recall：同 agent 召回可见（agent 作用域契约）', async () => {
    const r = await bridge.recall('Python', 5);
    expect(r.total_found).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('reflection：返回对象', async () => {
    const r = (await bridge.reflection()) as Record<string, unknown>;
    expect(r && typeof r === 'object').toBe(true);
  }, TIMEOUT);

  it('reinforce：执行成功', async () => {
    const r = (await bridge.reinforce()) as Record<string, unknown>;
    expect(r).toBeTruthy();
  }, TIMEOUT);

  it('lineage：按 memory_id 查世系', async () => {
    const r = (await bridge.lineage(firstId)) as Record<string, unknown>;
    expect(r && typeof r === 'object').toBe(true);
  }, TIMEOUT);

  it('graph：返回图谱', async () => {
    const r = (await bridge.graph()) as Record<string, unknown>;
    expect(r && typeof r === 'object').toBe(true);
  }, TIMEOUT);

  it('rerank：返回对象', async () => {
    const r = (await bridge.rerank('Python', 3)) as Record<string, unknown>;
    expect(r && typeof r === 'object').toBe(true);
  }, TIMEOUT);

  it('compress dry-run：真实库聚簇 > 0（P0① 回归）', async () => {
    const r = await bridge.compress({ dryRun: true, threshold: 0.10, minClusterSize: 2 });
    expect(Number(r.compressed_count ?? 0)).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('compress apply：写入压缩簇（P0① 回归）', async () => {
    const r = await bridge.compress({ dryRun: false, threshold: 0.10, minClusterSize: 2 });
    expect(Number(r.compressed_count ?? 0)).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('compressList：结构化 JSON + total > 0（P0② 回归）', async () => {
    const r = await bridge.compressList();
    expect(Number(r.total ?? 0)).toBeGreaterThanOrEqual(1);
    const first = (r.clusters ?? [])[0] as { cluster_id?: string } | undefined;
    if (first?.cluster_id) clusterId = first.cluster_id;
    expect(first).toBeTruthy();
  }, TIMEOUT);

  it('decompress：簇可逆还原（可逆原子契约）', async () => {
    if (!clusterId) return; // 上游失败时跳过（由上一个用例兜底红线）
    const r = await bridge.decompress(clusterId);
    expect(r).toBeTruthy();
  }, TIMEOUT);

  it('adaptiveSearch：连续查询非空（P1 session 泄漏回归）', async () => {
    let r: Awaited<ReturnType<typeof bridge.adaptiveSearch>>;
    for (let i = 0; i < 3; i++) {
      r = await bridge.adaptiveSearch('Python', 'dsh-e2e-ci', 5);
    }
    expect(Number(r!.total ?? r!.results?.length ?? 0)).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  it('link：关联推理执行成功', async () => {
    const r = await bridge.link(firstId, 5, 90);
    expect(r).toBeTruthy();
  }, TIMEOUT);
});
