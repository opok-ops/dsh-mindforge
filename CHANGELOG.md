# Changelog

All notable changes to dsh-mindforge are documented here. Versions follow
[semver](https://semver.org/). The engine underneath — [MindForge](https://github.com/opok-ops/MindForge) — is versioned separately; each dsh-mindforge release states the MindForge version its bridge layer targets.

## [3.0.0] — 2026-11-07

Aligned with **MindForge 6.3.5**. Tools 10 → 15, bridge signature audit
against CLI 6.3.5, and a hard safety default for the new compression tool.
vitest 36 → 48.

### Added

- **`memory_compress`** — compress similar memory clusters into single
  summary memories (MindForge 6.3.5 `MemoryCompressor`: TF-IDF cosine
  greedy clustering, sources archived not deleted). Supports
  `threshold` / `category` / `min_cluster_size`. **Dry-run is the default:
  the handler treats an absent `dry_run` as `true`** — an automated agent
  that omits arguments can never trigger a real write. Real compression
  requires an explicit `dry_run: false`.
- **`memory_compress_list`** — list all compressed clusters
  (`compress-list`, JSON output).
- **`memory_decompress`** — restore a cluster's source memories to
  independent recall (`decompress <cluster_id>`).
- **`memory_adaptive_search`** — session-aware adaptive retrieval
  (MindForge 6.3.5 `AdaptiveContextEngine`: usage frequency × recency ×
  relevance weight tuning per session; bridged as `adaptive-search` with
  `--session` / `--limit`).
- **`memory_link`** — association reasoning over related memories
  (`memory-link <agent> <memory_id> --top-k --days`, MindForge v5.3.6+).
  CLI note: this subcommand has no `--json` support; the bridge's
  banner-tolerant output parser falls back to raw text.
- **`memory_search` explain parameter** — passes `--explain` through to
  MindForge 6.3.0+; per-result `score_breakdown` (4 recall-path scores,
  winning path, fusion detail) is now typed as
  `SearchResult.score_breakdown`.
- New `/mindforge` subcommands: `compress` (dry-run report; `apply` to
  write), `clusters`, `adaptive <query>`.
- `CompressResponse` / `CompressListResponse` / `AdaptiveSearchResponse` /
  `LinkResponse` / `ScoreBreakdown` types.

### Fixed

- Bridge signature audit refreshed against MindForge CLI 6.3.5 (the v0.2.0
  audit targeted 5.5.6). All ten legacy commands re-verified unchanged;
  `memory-reflection` confirmed to still not expose `--category` — the
  parameter is retained but documented as ignored (previously implied
  "coming soon"; now states the verified fact).
- `reflection()` dead branch removed (category was dropped on the floor
  inside an empty `if`; now explicit `void category`).

### Compatibility

- **Requires MindForge ≥ 6.3.5** for the five new tools and `--explain`.
  The original ten tools work with MindForge ≥ 5.5.6 (graceful degradation:
  drop the new entries from your `tools` config).

## [0.2.1] — 2026-09-18

- `StatsResponse` type corrections (P3-1)
- Configurable `timeoutMs` for the CLI subprocess (P3-2)
- `rerank-search` tags passthrough (CLI now returns tags; no longer
  hardcoded empty)

## [0.2.0] — 2026-09-17

- Bridge layer rewritten to match MindForge CLI v5.5.6 actual signatures
  (importance enum mapping, positional `agent` arguments, `--top-k` vs
  `--top`, `--force` on delete, response field adaptation)

## [0.1.x] — 2026-09-16

- Initial scaffold, P0 `--json` flag-ordering fix, null-check fixes
