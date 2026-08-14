# koishi-plugin-adapter-harness

把 Koishi 会话桥接到 DeepSeek Harness Agent Runtime。

[![CI](https://github.com/nazidada/koishi-plugin-adapter-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/nazidada/koishi-plugin-adapter-harness/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

这是首个可运行版本：Koishi 接收和发送消息，DeepSeek Harness 维护 Agent 会话并调用模型。默认内置 Runtime 是纯聊天组合，不向模型暴露 Bash、文件系统、Skill、Job 或子代理工具。

## 环境要求

- Node.js `^22.19.0` 或 `>=24.0.0`
- Koishi `^4.18.11`
- DeepSeek API Key

Harness 目前仍处于 RC 阶段。本项目将相关包精确锁定在 `0.1.0-rc.6`，升级时需要重新执行完整验证。

## 本地开发

```bash
npm install
export DEEPSEEK_API_KEY="你的密钥"
npm run check
```

`npm run test:runtime` 只验证内置 Runtime 能启动、完成 SDK 握手并正常退出，不会发起模型请求，因此不需要 API Key。

`npm run test:koishi` 会用真实 Koishi `Context` 验证插件加载、Service/命令注册和释放流程，同样不会发起模型请求。

要从 GitHub 使用当前未发布版本，请先克隆并构建：

```bash
git clone https://github.com/nazidada/koishi-plugin-adapter-harness.git
cd koishi-plugin-adapter-harness
npm ci
npm run build
```

然后在 Koishi 项目目录安装这个本地构建：

```bash
npm install /absolute/path/to/koishi-plugin-adapter-harness
```

随后按下方示例启用 `adapter-harness`。正式发布前也可以先执行 `npm pack --dry-run` 检查包内容。

## macOS 文件权限排查

本项目的安装、构建、测试和打包都不需要 `sudo`。使用 `sudo npm ...` 或 `sudo git ...` 可能留下归 `root` 所有的 Git 对象、依赖或缓存，使后续的普通用户安装、提交和发布出现 `EACCES`。

项目内置两项发布前检查：

```bash
npm run check:permissions
npm run check:package
```

前者检查 Git 文件模式、项目目录可写性、POSIX 所有者以及构建产物模式；后者检查 npm 包内只有命令入口 `dist/runtime.js` 是可执行文件。GitHub 不保存本机的 uid、gid、ACL 或 macOS 扩展属性，但会保存可执行位，因此两类问题需要分别检查。

遇到 `EACCES` 时，先用只读命令定位，不要直接修改整个主目录：

```bash
find . -xdev ! -user "$(id -un)" -print
find "$(npm config get cache)" -xdev ! -user "$(id -un)" -print
find "$(npm config get prefix)" -xdev ! -user "$(id -un)" -print
```

确认某个具体目录确实是误用 `sudo` 产生后，只修复该路径：

```bash
sudo chown -R "$(id -un)":"$(id -gn)" /absolute/confirmed/path
```

不要把上述命令指向整个主目录、磁盘根目录或未经核对的通配路径。修复后重新运行 `npm ci` 和 `npm run check`。

## Koishi 配置示例

```yaml
plugins:
  adapter-harness:
    provider: deepseek-official
    model: deepseek-v4-flash
    maxTokens: 8192
    trigger: direct-and-mention
    sessionScope: channel
```

推荐通过启动 Koishi 的环境变量提供密钥：

```bash
export DEEPSEEK_API_KEY="你的密钥"
```

也可以在 Koishi 配置界面的 `apiKey` secret 字段中填写。插件不会记录密钥，也不会把完整用户提示词写入错误日志。

## 默认行为

- 私聊消息会进入 Harness。
- 群聊仅在机器人被 `@` 或昵称点名时进入 Harness。
- 群聊提示会附带发送者显示名，便于共享会话区分参与者。
- 同一 Runtime 内按稳定 Session ID 续聊。
- 所有模型轮次进入一个有界串行队列。
- 轮次超时或 Runtime 通信失败时，插件会关闭并重建子进程。
- `harness.reset` 命令会为当前 Koishi 会话切换到新的 Harness Session。

## 允许频道

`allowedChannels` 为空时不增加频道限制。配置规则后，只有至少命中一条规则的消息才会进入 Harness：

```yaml
allowedChannels:
  - platform: onebot
    channelId: "123456"
    isDirect: false
  - platform: "*"
    channelId: "*"
    isDirect: true
```

`platform` 和 `channelId` 支持 `*`。

## 自定义 Runtime

内置 Runtime 适合普通聊天。如果需要自己组合 Harness 插件，可以设置：

```yaml
runtimeCommand: node
runtimeArgs:
  - /absolute/path/to/your-runtime.js
runtimeCwd: .
```

自定义进程必须实现 DeepSeek Harness 的 stdio JSON-RPC SDK 协议。启用 Bash、文件写入或无人值守工具前，应独立审计 Runtime 的 sandbox、approval policy 和工作目录。

## 服务 API

插件向 Koishi Context 提供 `ctx.harnessAdapter`：

```ts
const answer = await ctx.harnessAdapter.run('你好', 'my-stable-session-id')
await ctx.harnessAdapter.restart()
```

`run()` 适合其他受信任插件调用。调用方负责选择不含敏感信息的稳定 Session ID。

## 当前限制

- 仅把文本发送给 Harness；图片和其他资源元素尚未映射为 Content Block。
- 仅发送最终文本，不转发 reasoning、工具状态或流式 chunk。
- SDK 暂无单轮取消，因此首版采用全局串行队列。
- Session 尚不能在 Runtime 重启后从持久日志恢复。
- Harness RC 协议可能继续变化。

详细设计与后续里程碑见 [PLAN.md](./PLAN.md)。

参与开发请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。安全问题请按照 [SECURITY.md](./SECURITY.md) 私下报告，不要提交公开 Issue。
