# dsh-mindforge

> Encrypted 4-layer lifelong memory for DeepSeek Harness — powered by [MindForge](https://github.com/opok-ops/MindForge)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![dsh-plugin](https://img.shields.io/badge/DSH-Plugin-purple.svg)](https://github.com/topics/dsh-plugin)
[![Python 3.9+](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/)
[![Node 22+](https://img.shields.io/badge/Node-22+-green.svg)](https://nodejs.org/)

## Why dsh-mindforge?

DeepSeek Harness ships with basic session persistence — an append-only log and a simple `memory` table. That's enough for a single conversation, but agents forget everything across sessions, can't reason over past interactions, and have no way to encrypt sensitive memories.

**dsh-mindforge** plugs [MindForge](https://github.com/opok-ops/MindForge) — a production-grade lifelong memory engine — directly into DSH as a native Cordis plugin. Your agent gets:

| Feature | dsh-mindforge | dsh-mnemon | DSH native |
|---|:---:|:---:|:---:|
| Memory layers | **4** (sensory/short/long/permanent) | 3 | 2 |
| AES-256-GCM encryption | **Yes** | No | No |
| Full-text search (FTS5 + trigram, Chinese-ready) | **Yes** | Partial | Partial |
| Vector search (384-dim MiniLM) | **Yes** | No | No |
| 6-way fusion retrieval | **Yes** | No | No |
| Knowledge graph | **Yes** | Yes | No |
| Federated memory + ACL | **Yes** | No | No |
| Memory evolution (decay/cluster/link/reinforce) | **Yes** | Partial | No |
| Metacognitive reflection | **Yes** | No | No |
| Memory lineage & version history | **Yes** | Partial | No |
| DSH native tools | 10 | ~8 | — |
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
│  201 CLI commands │ 150+ API methods │ 32 MCP tools│
│  SQLite + FTS5(trigram) │ Embeddings(384-dim)      │
│  Knowledge Graph │ Federated ACL │ AES-256-GCM     │
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
  storageScope: global         # global | workspace | custom
  injectOnStep: true           # auto-inject memories before each model step
  maxContextTokens: 2048
  tools:                       # choose which tools to expose to the model
    - memory_add
    - memory_search
    - memory_context
    - memory_stats
    - memory_recall
    - graph_query
```

## Usage

### Model Tools (auto-registered on `ctx.tools`)

The model can call these tools directly:

| Tool | Description |
|---|---|
| `memory_add` | Store a memory (4-layer, encrypted) |
| `memory_search` | 6-way fusion search (vector + FTS5 + TF-IDF + fuzzy + expansion + rerank) |
| `memory_context` | Token-budget-aware context retrieval for prompt injection |
| `memory_stats` | Memory store statistics |
| `memory_recall` | Smart recall (search + association + layer-aware) |
| `memory_reflection` | Metacognitive analysis of memory themes and drift |
| `memory_reinforce` | Identify high-value decaying memories |
| `memory_lineage` | Trace version history and audit events |
| `graph_query` | Query the knowledge graph |
| `rerank_search` | Query expansion + cross-encoder reranking |

### DSH Commands

```
/mindforge status              # Memory store statistics
/mindforge recall <query>      # Smart recall top 5
/mindforge remember <text>     # Store as permanent memory
/mindforge forget <id>         # Delete a memory
/mindforge graph               # Knowledge graph overview
/mindforge search <query>      # Full 6-way fusion search
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

All memory content is encrypted with **AES-256-GCM** at rest. The encryption key is stored separately from the database. Even if an attacker obtains the SQLite file, they cannot read the memories without the key file.

This makes dsh-mindforge suitable for **enterprise and compliance-sensitive** use cases that no other DSH memory plugin supports.

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
│   ├── bridge.ts       # MindForge CLI subprocess bridge
│   ├── tools.ts        # ctx.tools registration (10 tools)
│   ├── commands.ts     # /mindforge command registration
│   ├── inject.ts       # agent/pre-step context injection
│   ├── config.ts       # Config schema & defaults
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
| Encryption | AES-256-GCM | None |
| Search | 6-way fusion | Semantic recall |
| Knowledge graph | Yes | Yes (4-graph) |
| Federated ACL | Yes | No |
| Memory evolution | Decay + cluster + link + reinforce + reflect | Capacity maintenance |
| CLI commands | 201 | ~10 |
| MCP tools | 32 | 0 |
| Tests | 88 (Python) + vitest | vitest |

**Choose dsh-mindforge** if you need encryption, federated memory, or the richest search. **Choose dsh-mnemon** if you prefer a single Go binary with no Python dependency.

## Roadmap

- [ ] M1: CLI bridge + 3 core tools (add/search/context) — **in progress**
- [ ] M2: `/mindforge` commands + agent.inject auto-injection
- [ ] M3: Full 10-tool registration + knowledge graph
- [ ] M4: WebUI memory management panel
- [ ] M5: npm publish + DSH plugin store listing
- [ ] Future: PyInstaller standalone binary (no Python dependency)
- [ ] Future: MCP server mode (persistent process for high-frequency search)

## License

MIT — see [LICENSE](LICENSE).

## Powered by

- [MindForge](https://github.com/opok-ops/MindForge) — AI Agent lifelong memory engine
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Agent runtime
- [Cordis](https://github.com/koishijs/cordis) — Plugin framework
