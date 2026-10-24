# Agent Note: Controlled evaluation for harness changes

Status: proposed

English | [中文](2026-10-21-harness-change-evaluation-protocol.zh.md)

DeepSeek Harness's gates prove that the agent still works; they do not prove that a harness change makes it work better. This note proposes a controlled evaluation protocol for persona, prompt, skill, tool-guidance, compaction, and preset changes. It borrows the experimental design of Google Research's Harness² and rejects its implementation, its baseline, and its security posture.

## Problem

The existing tiers cover regression and plumbing, not capability. The performance benchmarks under `benchmarks/` use synthetic inputs and fixed budgets; recorded-session snapshots under `snapshots/` replay known transcripts; real-API e2e boots a shipped profile and checks a narrow outcome. A change to a persona prefix, a skill, a prompt section, a compaction threshold, or a preset can pass every tier while making the agent worse on unseen work.

Review is therefore the only control, and it is unreliable at this granularity: a single impressive run reads as improvement, a single bad run reads as regression, and neither is distinguishable from sampling noise. The same gap blocks comparisons across models and versions: we cannot say which preset is better, only which one looks better.

[Harness²](https://arxiv.org/abs/2610.14224) supplies a protocol for exactly this question: a base control, repeated probes, contrastive evidence from trajectories, blind selection of outputs, post-hoc judging, a per-run budget ledger, and leak checks that keep grading material out of model context. Its contribution is the protocol, not the code: the shipped baseline is an empty stock-framework harness, its executors disable sandboxing, and the implementation is Python research code pinned to upstream benchmark clones. Adopt the design and keep the implementation external.

## Proposal

Adopt a documented, scriptable evaluation protocol for every non-trivial harness-affecting change. The protocol is internal engineering practice, not a product feature: it adds no packages, no profile rows, and no agent-loop behavior. The first stage is implemented in [`scripts/experiments/harness-eval/`](../../../../scripts/experiments/harness-eval/README.md); its README is the operator guide.

1. **One variable per experiment.** A candidate arm is a patch against a base composition; the base arm is the shipped `standard` preset. Both arms pin the same model, provider, reasoning effort, DSH build, workspace seed, permission patch, task set, and repeat count. Everything except the intended change stays equal.
2. **Probe with the shipping entry point.** Run `dsh --profile headless` once per probe with a fresh `$DSH_HOME` and workspace, applying the arm as a `--patch` overlay ([headless profile](../../../../packages/bundle/headless/README.md)). Pin a permission patch in both arms: `sandbox-policy.mode: workspace-write` and `approval.policy: never`; without an answerer, the default `ask` fails closed in unattended runs.
3. **Design before running.** Use tasks × R repeats × 2 arms with R ≥ 3, alternating arms per task and randomizing order. Repeats estimate the within-arm dispersion that is the noise floor; a between-arm delta that does not clear it is reported as "no effect". State N, exclusion rules, and dropout before the first probe.
4. **Evidence is the session log.** The canonical trajectory is the durable session JSONL from [session persistence](../../../../packages/session/session-persistence-jsonl/README.md), not the `--json` projection, which is capped and lossy. Set `compression: 'none'` for experiments and keep the workspace, delivered artifacts, exit code, wall time, token usage, and the arm patch beside it.
5. **Layout and leak checks.** Write one directory per probe (contract below) and scan every file that can reach model context before the probe: answer-key paths, rubric files, and grader-verdict text are rejected, not redacted. A leak is a protocol failure, not a finding.
6. **Measure after selection.** When comparing artifacts, anonymize and blind them; when scoring, run the scorer after the run settles and record a scorer failure as `unavailable`, excluded from the denominator rather than counted as zero. No score ever feeds back into the edit loop.
7. **Write the lesson down.** Every adopted change records cue, lesson, evidence, and confidence beside the experiment. A lesson that must reach the model is expressed as a [skill](../../../../packages/skill/README.md) or a logged prompt section ([system prompt](../../../../packages/core/system-prompt/README.md)), so `model-visible ⟺ logged` holds; never inject it out of band.

## Probe contract

A probe is reproducible from its directory alone. The arm patch is the only difference between arms, and every file listed below is retained.

```text
<run>/<task>/<arm>/<repeat>/
  task.md
  source/
  workspace/
  session/
  artifacts/
  patches/
  permission.patch.yml
  stdout.jsonl
  stderr.txt
  verify.log
  meta.json
```

`meta.json` records the exact command line, DSH version and commit, model and provider, reasoning effort, permission patch hash, start and end time, exit code, token usage, and the pinned scorer version.

```sh
DSH_HOME="$RUN/home" dsh --profile headless \
  --patch "$ARM_PATCH" --json "$TASK"
```

These invariants make the directory auditable:

- Every patch under `patches/` is byte-identical to the overlay passed to `--patch`; `permission.patch.yml` is shared by both arms and differs only in the run paths it pins.
- `session/` holds the uncompressed durable log (`compression: 'none'`); `stdout.jsonl` is only the capped projection.
- `artifacts/` contains only files the agent added or changed relative to `source/`.
- `meta.json` records the command, patch hashes, token total, exit code, and the changed and deleted file lists.
- No probe directory is deleted or rewritten on rerun; a rerun gets a new repeat index.

## Integration options

The protocol stands on its own. The remaining stages are optional and ordered by cost; only P0 adds anything to this repository.

| Stage | Scope | DSH changes | Effort | Risk |
|---|---|---|---|---|
| P0 | Protocol, scripts, and a small internal task set | None; scratch directories only | S | Low |
| P1 | DSH as a Harness² proposer channel | None; external repository | S | Low |
| P2 | DSH as a Harness² substrate | None; external repository | M | Medium: startup cost, JSONL parsing |
| P3 | Experimental bundle that drives an external sweep | New package under `packages/experimental/` | M–L | High: installation authority, maintenance |

## Alternatives considered

**Vendor Harness² and adapt its code.** The protocol is the value; the code is Linux-only Python with one test module, optional adapter hooks discovered by `getattr`, and an empty stock baseline. Porting it would import a second runtime, a second type system, and a security posture that disables sandboxing. Apache-2.0 is compatible with this repository, so compatibility is not the reason to decline; maintenance is.

**Build a native optimizer in DSH now.** That requires a durable score event, candidate identity, a capability corpus, budget accounting, and statistics, plus a product consumer for a self-modifying default. It also conflicts with the placement rule for experimental capabilities. The protocol above produces the evidence that would justify such work later.

**Keep review-only.** It is the cheapest option and already fails: reviewers cannot separate a real effect from one lucky run, and the cost of that blindness is paid on every harness change. The protocol's per-task cost is visible; the review-only cost is not.

**Put an LLM judge inside the edit loop.** Optimizing against a judge invites reward hacking and makes results drift with the judge model. Harness² deliberately keeps judging post hoc and lets the editor see behavior, not scores; we keep the same split.

## Acceptance criteria

- The protocol exists as this Agent Note and a short operator guide; both are bilingual and `pnpm run doc-sync` passes.
- A script outside `packages/` runs one task × 2 arms × R ≥ 3, writes the probe contract directories, computes the noise floor, and emits the report; it changes no product package.
- The leak check fails on a fixture containing an answer-key path and on one containing grader-verdict text, and passes on a clean probe.
- No change lands in `packages/`, a base bundle, or `agent-loop`; experiments run from scratch `$DSH_HOME` and profiles.
- One real experiment's report states protocol version, arm patch hashes, task set and provenance, repeats, noise floor, per-task and aggregate results, cost, failures, and exact command lines.

## Risks

- Small N and one model: three repeats may still be dominated by provider variance. Mitigate with interleaving, more repeats for the final comparison, and reporting the interval instead of a point delta.
- Cost and time: every probe boots the full Loader tree and spends model tokens. Cap the experiment budget up front, run from built artifacts, bound concurrency, and record token-to-USD pricing separately because DSH reports tokens, not dollars.
- Leakage: task material, `AGENTS.md`, and skills can carry grading text into context. Run the tripwire over every model-visible file, keep benchmark data out of the workspace, and treat any hit as a protocol failure.
- Network egress: DSH's sandbox constrains file effects, not network access. Run probes in an egress-restricted container, especially when the task set is public and its rubric is online.
- Security: installing a candidate bundle executes Host code and needs `danger-full-access` or per-call approval. Experiments are supervised, use a scratch home, and never install into a shipped profile.
- Overfitting: a lesson library can encode task-specific tricks. Require cue and evidence for each lesson and hold out tasks that no arm has seen.
- Measurement drift: changing the scorer, its prompt, or its model changes the result. Pin all three in `meta.json` and the report, and never compare scores across scorer versions.
