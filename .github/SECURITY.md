# Security policy

## Supported versions

Only the latest release receives security fixes. Pre-release and development builds are not
supported.

| Version | Supported |
| --- | --- |
| Latest `v*` release | ✅ |
| Anything older | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private channel:

**→ <https://github.com/fatedawn/agent-session-center/security/advisories/new>**

Please include:

- the affected version,
- reproduction steps or a proof of concept,
- the impact you believe it has (local privilege escalation, data exposure, remote code execution, …),
- and how you would like to be credited, or say that you would prefer to stay anonymous.

**First response within 72 hours.** If you get no reply after a week, ping the issue-less way —
comment on any of your own issues or send a fresh advisory — rather than opening a public issue.

## Scope

In scope:

- The desktop application in `src/` and `electron/`, and the packaging and release scripts in
  `scripts/`.
- Anything that lets a local, remote, or co-located party read data it should not, execute code
  it should not, or reach the machine through the app's IPC surface, hook ingress, Feishu
  bridge, or remote/host tunnels.

Out of scope, or handled elsewhere:

- **Session history files written by the agents themselves.** A bug in Codex's or Claude Code's
  own storage is theirs to fix. ASC reads those files read-only; if it mishandles hostile
  content found inside one of them, that *is* in scope.
- **The upstream project this repository derives from.** See [NOTICE](../NOTICE); report
  upstream code issues upstream.
- Anything that needs an attacker to already control the user's machine or the user's own
  configured endpoints.

## What to expect

1. Acknowledgement within 72 hours.
2. An assessment and a fix or a decision not to fix, with reasoning, in the advisory thread.
3. A patch release, and credit in the advisory unless you asked to stay anonymous.
4. A public advisory once a fixed release is available.

## A note on code signing

Windows releases are **not code-signed**, so Windows may show a security prompt on first launch.
The installer is built by this repository's release workflow from this repository's source, and
each release publishes its SHA-256 next to the installer — that hash, checked against the release
notes, is what ties a download to a published build. It does not prove who built it; that is what a
code signature would add, and signing is planned but not yet in place. How to verify a download is
described in the [Code signing policy](../README.md#code-signing-policy) section of the README.

---

# 安全政策（中文）

## 支持范围

只有最新版本会收到安全修复。预发布版与开发版不在支持范围内。

## 报告漏洞

**请不要用公开 issue 报告安全问题。** 请走 GitHub 私下渠道：

**→ <https://github.com/fatedawn/agent-session-center/security/advisories/new>**

请附上：受影响的版本、复现步骤或 PoC、你认为的影响面（本地提权 / 数据外泄 / 远程执行），
以及你希望怎么署名（默认匿名）。

**首次响应在 72 小时内。** 如果一周后仍无回音，请再发一条 advisory，而不是转到公开 issue。

## 范围内外

**在范围内：** `src/` 与 `electron/` 的桌面程序，`scripts/` 的打包与发布脚本；任何能让本地、
远程或同机第三方读到不该读的数据、执行不该执行的代码，或经由 IPC 面、hook 入口、
飞书桥接、远程隧道触达本机的问题。

**不在范围内：** 各 Agent 自己写出的会话历史文件本身的 bug（ASC 只读地读它们；
但如果 ASC 对其中恶意内容的处理有问题，那**在范围内**）；本仓库所 fork 的上游项目的代码
（见 [NOTICE](../NOTICE)）；以及需要攻击者已经控制用户机器或其自配端点的场景。

## 你会得到什么

72 小时内确认 → 给出评估与修复或不修的结论及理由 → 发补丁版并在 advisory 中致谢
（除非你要求匿名）→ 修复版可用后公开 advisory。

## 关于代码签名

Windows 版本**没有代码签名**，首次启动时系统可能显示安全提醒。安装包由本仓库的发布工作流、
基于本仓库源码构建；每个版本都会在安装包旁公布 SHA-256，把它与发行说明核对一致，就能确认
这次下载对应的是哪一次已发布的构建。它不能证明「是谁构建的」—— 那正是代码签名能补上的一环，
而签名目前只是计划、尚未落地。如何验证下载见 README 的
[代码签名政策](../README.md#代码签名政策)一节。
