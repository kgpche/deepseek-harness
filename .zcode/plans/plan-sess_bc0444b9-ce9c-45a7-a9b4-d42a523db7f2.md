查看器内 VSCode 式 Ctrl+F 文件内搜索。服务端新增流式 `find` RPC（不驻留全文、带结果上限），客户端在文本/代码查看器加 VSCode 风格 find 栏（输入 + 计数 + 上/下个 + 关闭 + 大小写/正则切换），快捷键桌面端 Ctrl+F、Web 端 Ctrl+Alt+F（Web 禁注册裸 Ctrl+F，浏览器占用）。只做文本与代码渲染器；markdown/PDF/图片/Office 与跨文件搜索不在本次范围。

## 服务端（packages/api/workspace-files）

1. `src/types.ts` 新增：
   - `WorkspaceFileFindOptions { caseSensitive?: boolean; regex?: boolean }`
   - `WorkspaceFileMatch { lineNumber: number; start: number; end: number; line: string }`（start/end 为行内码元偏移）
   - `WorkspaceFileFind = WorkspaceFileStat + { matches: WorkspaceFileMatch[]; truncated: boolean }`
2. `src/index.ts` 新增 `@Remote async find(scope, path, query: WorkspaceFileFindQuery, signal)`：
   - 复用 `locateFile` 门 + `ctx.fs.streamText` 单遍扫描（`cutPage` 同款逐块消费，不整文件驻留；UTF-16/BOM 解码随 streamText 生效）
   - 语义：默认字面量忽略大小写；`caseSensitive`/`regex` 可选；空查询或非法正则 → `gateway/bad-request`
   - 上限：`Config` 加 `maxFindResults`（默认 500，超出即停并 `truncated: true`，复用 `maxEntries` 的截断报告模式）；匹配行预览截断到固定码元数（沿用 tool-fs-search 的行预览先例）
3. `find.spec.ts`：跨页行号正确、大小写/正则、非法正则拒绝、超限 truncated、二进制 not-text、BOM UTF-16 文件可查、行预览截断。

## 客户端（packages/client/ui-sidebar-documentpreview）

4. RPC 缝：`rpc.ts` 扩宽 remote 切面（`find` 方法）+ `createFind` 绑定函数（`createReadPage` 同款）。
5. store：`TextTabState` 增加按 tab 的 find 状态（query/caseSensitive/regex/matches/index/open），文件 version 变化时重置。
6. `FindBar` 组件（VSCode 形态，查看器体右上角覆盖层）：输入框（防抖 200ms 触发查询）、"n / m"计数（truncated 显示 m+）、上一个/下一个/关闭按钮、大小写(A)/正则(.*)切换。组件内按键：Enter 下一个、Shift+Enter 上一个、Esc 关闭、Alt+C/Alt+R 切换（本地处理，不进全局目录）。
7. 高亮（两种 DOM 词汇表，`scrollToLine` 已有先例）：
   - 纯文本：行内精确匹配片段高亮（`<span>` 包裹，findMatch 弱/当前 findCurrent 强）
   - 代码（shiki，不改共享 CodeBlock）：整行级高亮，当前匹配行强标记
8. 跳转：泛化现有"加载到目标行为止"循环（TextPreview.tsx:138-160 的 load-until-covered）→ 跳到未加载区的匹配先补页再 `scrollToLine`；回绕（wrap-around）与 VSCode 一致。
9. 快捷键：注册 `document.find` 命令（ui-workspace 的请求计数器模式：命令只校验焦点在右侧栏 tab 内并 bump 计数，TextPreview 收到后——body 为文本/代码渲染器才打开 find 栏，否则无动作）。默认键位：全部桌面 profile `primary+KeyF`；全部 web profile `primary+alt+KeyF`（避开 session.fork 的 web 键位与 Web 白名单限制，注册冲突由 registry 抛错兜底）。
10. locales：新增全部文案走 typed dictionary（中英），过 verify-client-ui-i18n。

## 生成物与传播

- `tsx scripts/generate-typert.ts` 重新生成 `lib/typert.*`（不手编）；`packages/api/remotes` 客户端装配零改动（结构化拓宽）。

## 文档与验证

- README：workspace-files（方法表 + find 语义与上限）与 ui-sidebar-documentpreview（find 栏交互契约）中英双语 + 配对记录。
- 无 recorded-session 快照：纯客户端 UI + 只读 RPC，无模型可见输出（依 docs/testing.md 判定）。
- 验证：聚焦 vitest（find.spec + FindBar/text-preview 组件 spec + 快捷键注册）→ `tsc -b tsconfig.client.json` → `build:artifacts`（含 host 门）→ 浏览器实测（Ctrl+F 打开、输入即查、Enter 跳转含未加载区、大小写/正则切换、Esc 关闭、代码视图行高亮）。

## 明确不在范围

markdown/PDF/图片/Office 内查找、跨文件搜索（Ctrl+Shift+F，后续可基于 tool-fs-search 做 UI 投影）、替换（replace）、编辑。