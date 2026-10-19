# Agent Note: Run the bundled dsh tree under standalone Node on Linux Desktop

Status: implemented

English | [中文](2026-10-19-linux-desktop-standalone-node.zh.md)

## Problem

The Linux desktop target reuses the installed Electron executable as its Node runtime, like macOS and Windows. The Electron executable links GTK and its dependencies, which load even under `ELECTRON_RUN_AS_NODE=1`; the loaded system glib then satisfies the undefined glib references inside sharp's bundled libvips, and calls such as `g_object_unref` cross between the two glib copies. Image decoding crashes with `SIGSEGV` in `g_object_unref` (gdb backtrace, reproduced independently of packaging). This is the upstream conflict tracked as [electron#46323](https://github.com/electron/electron/issues/46323); sharp documents it without a workaround, and `LD_PRELOAD` of the system glib does not repair it.

Every desktop platform ships a standalone Node binary in `resources/runtime/primary-runtime` for plugin and CLI use, pinned to the same Node version Electron embeds.

## Decision

`desktopHostNodeExecutable` in `apps/desktop/src/node-environment.ts` selects the Node executable the bundled dsh tree runs under: the primary-runtime standalone Node on Linux, the installed Electron executable on every other platform. The main process (`runtimeResources`), `prepare-dsh`, `smoke-packaged-runtime`, and the `cli/dsh` launcher all select through this helper, so the Host, smokes, build-time preparation, and the installed CLI agree on one runtime per platform. The `cli/dsh` launcher falls back to the installed application binary when the standalone Node is absent, which keeps unpackaged development layouts working; packaging fails its own smoke checks before such an artifact can ship.

The Electron binary keeps owning the desktop shell, protocol handler, and window management. Only Node-mode child processes change runtime on Linux. The standalone Node has no ASAR support, so the Linux package ships the dsh tree as physical files under `resources/dsh` (electron-builder `extraResources`) instead of application archive members; macOS and Windows keep the ASAR layout. The packaged payload smoke still asserts `process.versions.node` equals the release's recorded Node version, so a future divergence between the standalone Node and Electron's embedded Node fails the build loudly.

## Consequences

Linux child processes no longer depend on Electron's embedded Node, so `ELECTRON_RUN_AS_NODE` behavior differences between Electron versions cannot affect the Host or CLI. The standalone Node adds one process binary the runtime integrity checks must cover; it already ships for plugin execution, so installer size is unchanged. macOS and Windows behavior is byte-for-byte unchanged.

## Alternatives considered

Rebuilding sharp against Electron on Linux would replace upstream prebuilt binaries with a maintained build matrix and still inherits whatever glib the Electron process loads. Preloading a glib copy cannot unify the two type-system registrations, which the crash backtrace crosses. Keeping the Electron runtime and disabling sharp on Linux would remove shipped product capability rather than route around an upstream loader conflict.
