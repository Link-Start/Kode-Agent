# packages/runtime-bun

Bun 运行时实现（性能路径）。

用途：

- 作为 `packages/runtime` 的一种实现，封装 Bun 提供的文件/进程能力（可选）。
- 主要用于开发/实验与二进制构建场景；npm 包的默认运行时基线是 Node.js（见 `cli.js` 与 `docs/binary-distribution.md`）。
