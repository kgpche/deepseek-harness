# Agent Note: Linux 桌面端在独立 Node 上运行打包的 dsh 树

Status: implemented

[English](2026-10-19-linux-desktop-standalone-node.md) | 中文

## Problem

Linux 桌面目标与 macOS、Windows 一样，把已安装的 Electron 可执行文件复用为 Node 运行时。Electron 可执行文件链接 GTK 及其依赖，即使以 `ELECTRON_RUN_AS_NODE=1` 启动也会加载它们；已加载的系统 glib 随后满足 sharp 内置 libvips 中未定义的 glib 引用，`g_object_unref` 等调用在两份 glib 之间交叉执行。图像解码在 `g_object_unref` 中以 `SIGSEGV` 崩溃（gdb 回溯，已在打包流程之外独立复现）。这是上游冲突 [electron#46323](https://github.com/electron/electron/issues/46323)；sharp 文档记录了它但没有给出解法，`LD_PRELOAD` 系统 glib 也无法修复。

每个桌面平台都在 `resources/runtime/primary-runtime` 内置了独立 Node 二进制，供插件与 CLI 使用，版本与 Electron 内嵌的 Node 一致。

## Decision

`apps/desktop/src/node-environment.ts` 中的 `desktopHostNodeExecutable` 选择打包 dsh 树运行所用的 Node 可执行文件：Linux 使用 primary-runtime 的独立 Node，其他平台使用已安装的 Electron 可执行文件。主进程（`runtimeResources`）、`prepare-dsh`、`smoke-packaged-runtime` 与 `cli/dsh` 启动器都通过该帮助函数选择，因此 Host、冒烟检查、构建期准备与已安装的 CLI 在每个平台上使用同一个运行时。`cli/dsh` 启动器在独立 Node 缺失时回退到已安装的应用二进制，保证未打包的开发布局仍可工作；打包流程自身的冒烟检查会在这种产物发布之前失败。

Electron 二进制继续负责桌面外壳、协议处理与窗口管理，只有 Linux 上的 Node 模式子进程更换运行时。独立 Node 不支持 ASAR，因此 Linux 包把 dsh 树以物理文件放在 `resources/dsh`（electron-builder `extraResources`）而不是应用归档内；macOS 与 Windows 保持 ASAR 布局。打包的 payload 冒烟仍断言 `process.versions.node` 等于发布记录的 Node 版本，因此独立 Node 与 Electron 内嵌 Node 未来出现分歧时构建会响亮失败。

## Consequences

Linux 子进程不再依赖 Electron 内嵌的 Node，Electron 版本之间 `ELECTRON_RUN_AS_NODE` 的行为差异不会影响 Host 或 CLI。独立 Node 增加了一个需要运行时完整性检查覆盖的进程二进制；它本就为插件执行而内置，安装包体积不变。macOS 与 Windows 的行为逐字节不变。

## Alternatives considered

在 Linux 上针对 Electron 重新构建 sharp 会用一套需要维护的构建矩阵替换上游预构建产物，且仍然继承 Electron 进程加载的任何 glib。预加载某一份 glib 无法统一两套类型系统注册，崩溃回溯正是在两者之间交叉。保留 Electron 运行时并在 Linux 上禁用 sharp 会砍掉已发布的产品能力，而不是绕开一个上游加载器冲突。
