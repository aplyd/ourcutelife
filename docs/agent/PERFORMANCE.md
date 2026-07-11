# Performance and Profiling

Summary:

1. Performance work needs repeatable measurements, not vibes.
2. Record baseline, change, and post-change measurements together.
3. Add benchmark scripts for hot paths before optimizing them.
4. Mobile profiling should use React/native profiler tooling when investigating render or startup cost.
5. Regressions should become automated checks when cheap enough.
6. Update this doc with concrete commands as benchmarks are added.
7. Avoid claiming performance wins without before/after evidence.

## Current status

No dedicated performance benchmark harness is established yet. Use Argent/React profiler tooling for targeted investigations once a real performance issue is identified.
