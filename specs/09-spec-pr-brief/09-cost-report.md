# 09 — Cost report (PR Brief run)

Source: `docs/retro/ledger.md` (entry for this run) and the stored brief's `generation` field. USD for agent runs is **not**
available: the split of in/out tokens and model rates were not loaded in the session, so only token totals are reported.

## Building the feature (agents)
| Phase | Tokens | Share |
|---|---|---|
| spec-creator | 83k | 8% |
| implementation-planner | 177k | 17% |
| Opus plan review (`claude-opus-5-5`) | 91k | 9% |
| Implementation + tests + docs + verifier | ≈ 558k | 54% |
| User-driven UI rework (implementer 64.7k + test-writer 56.3k) | 121k | 12% |
| **Total** | **≈ 1,030k** (16 agents) | 100% |

Planning (spec + plan + review) = 34%. Review-driven fix loop: 0% (architecture-reviewer: no findings).
Bottleneck: implementation-planner (448 s, large code reads) and the client card step (81k).

## Running the feature (per brief)
| Run | Model | Tokens in → out | Cost | Attempts |
|---|---|---|---|---|
| PR #28 (141 files), first generation | openrouter `deepseek/deepseek-v4-flash` | 16.1k → 3.7k | $0.00049 | 2 |
| PR #28, refresh | same | 16.1k → 3.4k | $0.00143 | 2 |

`tokens_in` is summed over attempts (≈ 2 × ≤ 8k estimated input; the re-prompt re-sends the facts). One `completeStructured`
invocation, as required by AC-24.
