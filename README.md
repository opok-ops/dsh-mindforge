# dsh-mindforge

> Encrypted 4-layer lifelong memory for DeepSeek Harness — powered by [MindForge](https://github.com/opok-ops/MindForge)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![dsh-plugin](https://img.shields.io/badge/DSH-Plugin-purple.svg)](https://github.com/topics/dsh-plugin)
[![v3.0.0](https://img.shields.io/badge/version-3.0.0-blue.svg)](CHANGELOG.md)
[![MindForge 6.3.5](https://img.shields.io/badge/MindForge-6.3.5-orange.svg)](https://github.com/opok-ops/MindForge)
[![Python 3.9+](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/)
[![Node 22+](https://img.shields.io/badge/Node-22+-green.svg)](https://nodejs.org/)
[![MindForge Stars](https://img.shields.io/github/stars/opok-ops/MindForge.svg?label=MindForge%20%E2%AD%90)](https://github.com/opok-ops/MindForge/stargazers)

## What's New in v3.0

- **Memory compression** — `memory_compress` / `memory_compress_list` / `memory_decompress`: cluster near-duplicate memories into single summaries, sources archived and recoverable. **Dry-run is the safety default.**
- **Adaptive retrieval** — `memory_adaptive_search`: session-aware weight tuning (usage frequency × recency × relevance), gets better as the session progresses.
- **Association reasoning** — `memory_link`: find memories related to a target (link strength, shared tags, temporal proximity).
- **Search explainability** — `memory_search` with `explain: true`: per-result score breakdown across the 4 recall paths.
- **Fully aligned with MindForge 6.3.5** — scrypt KDF (6.3.1), compression + adaptive engine (6.3.5), 241 CLI commands, 87 MCP tools, 1,210 tests.

## Why dsh-mindforge?

DeepSeek Harness ships with basic session persistence — an append-only log and a simple `memory` table. That's enough for a single conversation, but agents forget everything across sessions, can't reason over past interactions, and have no way to encrypt sensitive memories.

**dsh-mindforge** plugs [MindForge](https://github.com/opok-ops/MindForge) — a production-grade lifelong memory engine — directly into DSH as a native Cordis plugin. Your agent gets:

| Feature | dsh-mindforge | dsh-mnemon | DSH native |
|---|:---:|:---:|:---:|
| Memory layers | **4** (sensory/short/long/permanent) | 3 | 2 |
| Encryption (scrypt KDF + AES-256-GCM) | **Yes** | No | No |
| Full-text search (FTS5 + trigram, Chinese-ready) | **Yes** | Partial | Partial |
| Vector search (384-dim MiniLM) | **Yes** | No | No |
| 6-way fusion retrieval | **Yes** | No | No |
| Adaptive retrieval (session-aware weights) | **Yes** (v3.0) | No | No |
| Memory compression (cluster + summarize) | **Yes** (v3.0) | No | No |
| Knowledge graph | **Yes** | Yes | No |
| Federated memory + ACL | **Yes** | No | No |
| Memory evolution (decay/cluster/link/reinforce) | **Yes** | Partial | No |
| Metacognitive reflection | **Yes** | No | No |
| Memory lineage & version history | **Yes** | Partial | No |
| DSH native tools | 15 | ~8 | — |
| DSH commands (`/mindforge`) | **Yes** | Yes | — |
| Auto context injection (`agent.inject`) | **Yes** | Yes | — |

## Architecture

```
┌─────────────────────────────────────────────────┐
│              DeepSeek Harness (Cordis)            │
│  ctx.tools  │  ctx.commands  │  agent.inject()   │
└──────┬───────┴───────┬───────┴────────┬──────────┘
       │               │                │
┌──────▼───────────────▼────────────────▼──────────┐
│           dsh-mindforge (TypeScript)              │
│  Tool registration │ Commands │ Pre-step injection │
│                   CLI Bridge                      │
└───────────────────────┬───────────────────────────┘
                        │ child_process.spawn
┌───────────────────────▼───────────────────────────┐
│              MindForge (Python CLI)                │
│  241 CLI commands │ 150+ API methods │ 87 MCP tools│
│  SQLite + FTS5(trigram) │ Embeddings(384-dim)     │
│  Knowledge Graph │ Federated ACL │ scrypt+AES-256-GCM │
│  Memory Compressor │ AdaptiveContextEngine │ 1,210 tests │
└───────────────────────────────────────────────────┘
```

This is the same proven pattern used by [`dsh-mnemon`](https://github.com/omdsh-dev/dsh-mnemon) — a TypeScript Cordis plugin wrapping an external CLI. The difference: MindForge brings **encryption, 4-layer memory, federated ACL, and 6-way fusion search** that no other DSH memory plugin offers.

## Quick Start

### Prerequisites

1. **MindForge CLI** — Install Python engine:
   ```bash
   pip install MindForge
   # Or from source:
   git clone https://github.com/opok-ops/MindForge.git
   cd MindForge
   pip install -e .
   ```

2. **Initialize MindForge** (creates encrypted database):
   ```bash
   MindForge init
   # Or non-interactive (CI/CD):
   MindForge init --no-encrypt
   ```

3. **Node.js 22+** — Required by DSH.

### Install Plugin

```bash
# From local path (development):
dsh plugin --profile web add "link:/absolute/path/to/dsh-mindforge"

# From GitHub (once published):
dsh plugin --profile web add "github:opok-ops/dsh-mindforge"
```

### Configure

The `cordis.patch.yml` in this plugin provides defaults. Override in your DSH config:

```yaml
mindforge:
  cliPath: MindForge          # or full path to executable
  # dbPath: ~/.MindForge/data/store/memory.db
  # keyFile: ~/.MindForge/data/store/key.bin
  agentId: default            # agent id used for add/context/recall/reflection/reinforce
  timeoutMs: 30000            # CLI subprocess timeout in ms (raise for very large stores)
  storageScope: global         # global | workspace | custom
  injectOnStep: true           # auto-inject memories before each model step
  maxContextTokens: 2048
  tools:                       # choose which tools to expose to the model
    - memory_add
    - memory_search
    - memory_context
    - memory_stats
    - memory_recall
    - memory_reflection
    - memory_reinforce
    - memory_lineage
    - graph_query
    - rerank_search
    - memory_compress          # v3.0: dry-run by default, safe
    - memory_compress_list     # v3.0
    - memory_decompress        # v3.0
    - memory_adaptive_search   # v3.0
    - memory_link              # v3.0
```

> **Requires MindForge ≥ 6.3.5** for the v3.0 tools (`memory_compress*`, `memory_decompress`, `memory_adaptive_search`) and `search --explain`. The first 10 tools work with MindForge ≥ 5.5.6.

## Usage

### Model Tools (auto-registered on `ctx.tools`)

The model can call these tools directly:

| Tool | Description |
|---|---|
| `memory_add` | Store a memory (4-layer, encrypted) |
| `memory_search` | 6-way fusion search (vector + FTS5 + TF-IDF + fuzzy + expansion + rerank); `explain=true` for score breakdown |
| `memory_context` | Token-budget-aware context retrieval for prompt injection |
| `memory_stats` | Memory store statistics |
| `memory_recall` | Smart recall (search + association + layer-aware) |
| `memory_reflection` | Metacognitive analysis of memory themes and drift |
| `memory_reinforce` | Identify high-value decaying memories |
| `memory_lineage` | Trace version history and audit events |
| `graph_query` | Query the knowledge graph |
| `rerank_search` | Query expansion + cross-encoder reranking |
| `memory_compress` ⭐ | Compress similar memory clusters into one summary (**dry-run by default** — safe for agent automation) |
| `memory_compress_list` ⭐ | List all compressed clusters |
| `memory_decompress` ⭐ | Restore a compressed cluster's source memories |
| `memory_adaptive_search` ⭐ | Session-aware adaptive retrieval (usage frequency + recency + relevance weights) |
| `memory_link` ⭐ | Association reasoning: find memories related to a target memory |

⭐ = new in v3.0 (powered by MindForge 6.3.5)

### DSH Commands

```
/mindforge status              # Memory store statistics
/mindforge recall <query>      # Smart recall top 5
/mindforge remember <text>     # Store as permanent memory
/mindforge forget <id>         # Delete a memory
/mindforge graph               # Knowledge graph overview
/mindforge search <query>      # Full 6-way fusion search
/mindforge compress            # [dry-run] Report compressible clusters (v3.0)
/mindforge compress apply      # Actually compress (v3.0)
/mindforge clusters            # List compressed clusters (v3.0)
/mindforge adaptive <query>    # Adaptive retrieval (v3.0)
```

### Auto Context Injection

When `injectOnStep: true` (default), dsh-mindforge listens to `agent/pre-step` events and automatically injects relevant memories before each model turn:

1. Extract keywords from the user's message
2. Call `MindForge memory-context` for token-budget-aware retrieval
3. Inject as a system message via `agent.inject()`

No configuration needed — works out of the box.

## The 4-Layer Memory Architecture

| Layer | Lifetime | Use Case |
|---|---|---|
| **Sensory** | Seconds–minutes | Raw input buffer, auto-expiring |
| **Short-term** | Current session | Working memory, conversation context |
| **Long-term** | Permanent (until decay) | Facts, preferences, learned skills |
| **Permanent** | Never expires | Core identity, critical knowledge |

Memory evolves automatically: sensory → short-term → long-term → permanent, with decay scoring, clustering, link reasoning, and reinforcement suggestions.

## 6-Way Fusion Search

MindForge's retrieval pipeline combines six strategies, merging scores by document ID (highest wins):

1. **Vector recall** — 384-dim MiniLM embeddings, cosine similarity
2. **FTS5 full-text** — trigram tokenizer (Chinese-ready), BM25 scoring
3. **TF-IDF** — bigram Chinese tokenization, cosine similarity
4. **Fuzzy** — edit-distance fallback for typos and partial matches
5. **Query expansion** — synonym/hypernym augmentation
6. **Cross-encoder reranking** — precision-focused reordering

## Encryption

All memory content is encrypted with **AES-256-GCM** at rest. Since MindForge 6.3.1, the key is derived with **scrypt** — a memory-hard KDF that makes GPU/ASIC brute-force attacks prohibitively expensive. The key file is stored separately from the database. Even if an attacker obtains the SQLite file, they cannot read the memories without the key file.

This makes dsh-mindforge suitable for **enterprise and compliance-sensitive** use cases that no other DSH memory plugin supports.

## Memory Compression (v3.0)

Powered by MindForge 6.3.5's **MemoryCompressor**: TF-IDF cosine similarity clustering finds near-duplicate memory clusters and merges them into a single summary memory. Source memories are archived (not deleted) and can be restored individually via decompress.

**Safety by default**: the `memory_compress` tool **always dry-runs unless the caller explicitly sets `dry_run: false`**. An automated agent that forgets its arguments cannot accidentally merge memories. The `/mindforge compress` command follows the same rule — bare `/mindforge compress` reports, `/mindforge compress apply` writes.

## Adaptive Retrieval (v3.0)

Powered by MindForge 6.3.5's **AdaptiveContextEngine**: retrieval weights are tuned per session by usage frequency, recency, and query relevance. The more your agent searches within a session, the better the ranking adapts to what it's actually working on.

## Federated Memory

Multiple agents can share memories through MindForge's federated layer:

- **ACL rules** — fine-grained per-principal, per-resource, per-operation
- **Conflict resolution** — LWW (last-write-wins) or branch (keep-both)
- **Default deny** — access requires explicit allow rule

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Watch mode
pnpm dev
```

### Project Structure

```
dsh-mindforge/
├── src/
│   ├── index.ts        # Plugin entry — apply(ctx)
│   ├── bridge.ts       # MindForge CLI subprocess bridge (aligned to MindForge 6.3.5)
│   ├── tools.ts        # ctx.tools registration (15 tools)
│   ├── commands.ts     # /mindforge command registration
│   ├── inject.ts       # agent/pre-step context injection
│   ├── config.ts        # Config schema & defaults
│   └── types.ts        # TypeScript type definitions
├── tests/
│   └── bridge.test.ts  # Unit tests
├── cordis.patch.yml    # DSH configuration patch
├── package.json
├── tsconfig.json
├── tsdown.config.ts
└── vitest.config.ts
```

## Comparison with dsh-mnemon

[`dsh-mnemon`](https://github.com/omdsh-dev/dsh-mnemon) is the other memory plugin in the DSH ecosystem. Both follow the same architecture (TypeScript plugin + external CLI). Key differences:

| | dsh-mindforge | dsh-mnemon |
|---|---|---|
| Engine | MindForge (Python) | mnemon (Go) |
| Memory layers | 4 | 3 |
| Encryption | scrypt KDF + AES-256-GCM | None |
| Search | 6-way fusion + adaptive | Semantic recall |
| Memory compression | Yes (v3.0) | No |
| Adaptive retrieval | Yes (v3.0) | No |
| Knowledge graph | Yes | Yes (4-graph) |
| Federated ACL | Yes | No |
| Memory evolution | Decay + cluster + compress + link + reinforce + reflect | Capacity maintenance |
| CLI commands | 241 | ~10 |
| MCP tools | 87 | 0 |
| Tests | 1,210 (Python) + 48 (vitest) | vitest |

**Choose dsh-mindforge** if you need encryption, federated memory, or the richest search. **Choose dsh-mnemon** if you prefer a single Go binary with no Python dependency.

## Roadmap

- [x] M1: CLI bridge + 3 core tools (add/search/context)
- [x] M2: `/mindforge` commands + agent.inject auto-injection
- [x] M3: Full 10-tool registration + knowledge graph
- [x] M3.5 (v3.0): Memory compression + adaptive retrieval + link reasoning + search explain — aligned with MindForge 6.3.5
- [ ] M4: WebUI memory management panel
- [ ] M5: npm publish + DSH plugin store listing
- [ ] Future: PyInstaller standalone binary (no Python dependency)
- [ ] Future: MCP server mode (persistent process for high-frequency search)

## License

MIT — see [LICENSE](LICENSE).

## Powered by

- [MindForge](https://github.com/opok-ops/MindForge) — AI Agent lifelong memory engine ⭐
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Agent runtime
- [Cordis](https://github.com/koishijs/cordis) — Plugin framework
