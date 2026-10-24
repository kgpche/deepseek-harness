# Agent Note: 面向 harness 变更的受控评估

Status: proposed

[English](2026-10-21-harness-change-evaluation-protocol.md) | 中文

DeepSeek Harness 的门禁证明智能体仍然能工作，却不能证明某项 harness 变更让它工作得更好。本提案为 persona、提示词、skill（技能）、工具指引、压缩策略与 preset 的变更定义一套受控评估协议。它借用 Google Research Harness² 的实验设计，但拒绝其实现、其基线与安全姿态。

## 问题

现有分层覆盖回归与管线连通性，不覆盖能力。`benchmarks/` 下的性能基准使用合成输入与固定预算；`snapshots/` 下的录制会话快照回放已知 transcript；真实 API e2e 启动一个已发布 profile 并检查很窄的结果。对 persona 前缀、skill、提示词小节、压缩阈值或 preset 的改动，可以通过全部门禁，同时让智能体在未见过的任务上变差。

因此评审是唯一的控制手段，而在这个粒度上它并不可靠：一次亮眼运行会被读成提升，一次糟糕运行会被读成回归，两者都无法与采样噪声区分。同一缺口也阻断了跨模型、跨版本的比较：我们说不出哪个 preset 更好，只能说出哪个看起来更好。

[Harness²](https://arxiv.org/abs/2610.14224) 恰好为这个问题提供了协议：基线与对照、重复探针、来自轨迹的对照证据、输出盲选、事后评分、每次运行的预算账本，以及把评分材料挡在模型上下文之外的泄漏检查。它的价值是协议而非代码：随发布提供的基线是一个空的 stock 框架 harness，其执行器关闭了沙箱，实现则是绑定上游基准克隆的 Python 研究代码。采用其设计，把实现留在外部。

## 提案

对每一项非平凡的、会影响 harness 的改动，采用一套有文档、可脚本化的评估协议。该协议是内部工程实践，不是产品特性：它不新增 package、不新增 profile 条目，也不改变 agent loop（智能体循环）的行为。 第一阶段已实现在 [`scripts/experiments/harness-eval/`](../../../../scripts/experiments/harness-eval/README.zh.md)，其 README 即操作指南。

1. **一次实验只改一个变量。** 候选组是相对基线组合的一个 patch；基线组是已发布的 `standard` preset。两组固定相同的模型、供应商、推理强度、DSH 构建、工作区种子、权限 patch、任务集与重复次数。除预期变更外，一切都保持相等。
2. **用发布入口做探针。** 每次探针运行一次 `dsh --profile headless`，使用全新的 `$DSH_HOME` 与工作区，并把实验组作为 `--patch` 覆盖层应用（[headless profile](../../../../packages/bundle/headless/README.zh.md)）。两组都固定同一份权限 patch：`sandbox-policy.mode: workspace-write` 与 `approval.policy: never`；在没有应答者的无人值守运行中，默认的 `ask` 会失败关闭。
3. **先设计再运行。** 采用任务 × R 次重复 × 2 组，R ≥ 3，逐任务交替两组并随机化顺序。重复用于估计组内离散程度，即噪声地板；未越过噪声地板的组间差值按“无效果”报告。在第一次探针前说明 N、排除规则与中途退出方式。
4. **证据是会话日志。** 规范轨迹是 [会话持久化](../../../../packages/session/session-persistence-jsonl/README.zh.md) 产出的持久化会话 JSONL，而不是带截断、有损的 `--json` 投影。实验使用 `compression: 'none'`，并把工作区、交付物、退出码、挂钟时间、token 用量与该组的 patch 一并保留。
5. **目录布局与泄漏检查。** 每个探针写一个目录（契约见下），并在探针运行前扫描每个可能进入模型上下文的文件：答案键路径、评分标准文件与评分器判定文本一律拒绝，而不是脱敏。泄漏是协议失败，不是发现。
6. **选择之后再测量。** 比较交付物时先匿名再盲选；评分在运行结束之后进行，评分器失败记为 `unavailable`，从分母中排除而不是计零。任何分数都不回流到编辑循环。
7. **把经验写下来。** 每一项被采纳的变更都在实验旁记录 cue、lesson、evidence 与 confidence。必须进入模型的经验要表达为 [skill](../../../../packages/skill/README.zh.md) 或可记录的提示词小节（[system prompt](../../../../packages/core/system-prompt/README.zh.md)），从而维持 `model-visible ⟺ logged`；绝不带外注入。

## 探针契约

仅凭探针目录即可复现一次运行。两组之间唯一的差异是该组的 patch，下列文件全部保留。

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

`meta.json` 记录确切的命令行、DSH 版本与提交、模型与供应商、推理强度、权限 patch 哈希、起止时间、退出码、token 用量，以及锁定的评分器版本。

```sh
DSH_HOME="$RUN/home" dsh --profile headless \
  --patch "$ARM_PATCH" --json "$TASK"
```

以下不变式让该目录可审计：

- `patches/` 下每个 patch 与传给 `--patch` 的覆盖层逐字节相同；`permission.patch.yml` 由两组共享，仅在钉住的运行路径上不同。
- `session/` 是未压缩的持久化日志（`compression: 'none'`）；`stdout.jsonl` 只是有上限的投影。
- `artifacts/` 只包含智能体相对 `source/` 新增或修改的文件。
- `meta.json` 记录命令、patch 哈希、token 总数、退出码，以及新增/修改与删除的文件列表。
- 重跑不得删除或改写任何探针目录；重跑获得新的重复序号。

## 集成选项

协议本身可以独立成立。其余阶段是可选的，并按成本排序；只有 P0 会给本仓库新增内容。

| 阶段 | 范围 | DSH 变更 | 工作量 | 风险 |
|---|---|---|---|---|
| P0 | 协议、脚本与内部小任务集 | 无；仅使用临时目录 | S | 低 |
| P1 | DSH 作为 Harness² 的 proposer 通道 | 无；外部仓库 | S | 低 |
| P2 | DSH 作为 Harness² 的 substrate（执行底座） | 无；外部仓库 | M | 中：启动开销、JSONL 解析 |
| P3 | 驱动外部 sweep 的 experimental bundle | `packages/experimental/` 下的新 package | M–L | 高：安装权限、维护成本 |

## 备选方案

**直接引入 Harness² 并改其代码。** 价值在协议；代码是仅支持 Linux 的 Python，只有一个测试模块，可选适配器钩子靠 `getattr` 发现，基线的 stock harness 是空的。移植它会引入第二个运行时、第二个类型系统，以及关闭沙箱的安全姿态。Apache-2.0 与本仓库兼容，因此兼容性不是拒绝它的理由；维护成本才是。

**现在就在 DSH 内构建原生优化器。** 这需要持久化的评分事件、候选身份、能力语料、预算核算与统计，还需要一个会自我修改默认值的产品消费者。它也违背 experimental 能力的放置规则。上述协议先产出足以支撑该工作的证据。

**只保留评审。** 这是最便宜的选择，而且已经在失效：评审者无法区分真实效果与一次幸运运行，而这种盲目的成本在每次 harness 变更时都要支付。协议的成本按任务可见，而只评审的成本不可见。

**把 LLM 评分器放进编辑循环。** 针对评分器做优化会招致 reward hacking，并让结果随评分器模型漂移。Harness² 刻意把评分留在事后，让编辑者看到行为而非分数；我们保持同样的分离。

## 验收标准

- 协议以本 Agent Note 加一份简短操作指南存在；两者均为双语，且 `pnpm run doc-sync` 通过。
- `packages/` 之外的一个脚本能运行一个任务 × 2 组 × R ≥ 3，写出探针契约目录，计算噪声地板并输出报告；它不修改任何产品 package。
- 泄漏检查对包含答案键路径的 fixture 和包含评分器判定文本的 fixture 均失败，对干净探针通过。
- 没有改动落入 `packages/`、基础 bundle 或 `agent-loop`；实验从临时 `$DSH_HOME` 与 profile 运行。
- 一次真实实验的报告写明协议版本、各组 patch 哈希、任务集与来源、重复次数、噪声地板、逐任务与汇总结果、成本、失败，以及确切命令行。

## 风险

- 小 N 与单一模型：三次重复仍可能被供应商方差主导。用交替运行、对最终对比增加重复次数、报告区间而非点差值来缓解。
- 成本与时间：每次探针都要启动完整 Loader 树并消耗模型 token。预先设定实验预算上限，从构建产物运行，限制并发，并单独记录 token 到 USD 的换算价格，因为 DSH 只报告 token 而非美元。
- 泄漏：任务素材、`AGENTS.md` 与 skill 都可能把评分文本带进上下文。对每个模型可见文件运行检查，把基准数据挡在工作区之外，任何命中都按协议失败处理。
- 出网流量：DSH 的沙箱约束文件效果，不约束网络访问。在限制出网的容器中运行探针，尤其是任务集公开且其评分标准可在线获取时。
- 安全：安装候选 bundle 会执行 Host 代码，需要 `danger-full-access` 或逐次审批。实验必须在监督下进行，使用临时 home，绝不安装到已发布 profile。
- 过拟合：经验库可能编码任务特定的技巧。每条经验都要求 cue 与 evidence，并保留任何组都未见过的 hold-out 任务。
- 测量漂移：更换评分器、其提示词或其模型都会改变结果。将三者都固定写入 `meta.json` 与报告，绝不跨评分器版本比较分数。
