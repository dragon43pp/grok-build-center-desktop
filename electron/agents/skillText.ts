/**
 * 装给各家 Agent 的技能正文。
 *
 * 只写 ASC 已经落地的命令。不写恢复步骤，避免对话文件丢失时
 * Agent 自己拉起一场新的。
 */
export const ASC_SKILL_MARKDOWN = `---
name: agent-session-center
description: 按任务编号列出和回答 Agent Session Center 正在等你的问题。
---

# Agent Session Center

ASC 管的是任务和问题编号，不是终端画面。

- \`asc tasks\` 列出开放任务。
- \`asc tasks questions\` 列出正在等回答的问题。每个问题有自己的编号。
- \`asc tasks answer <问题编号> <答案>\` 作答。批准写 \`approved\`，拒绝写 \`denied\`。

同一题只答一次。第二次不会改写第一次的答案。会话已经退出，或答案不在选项里，命令会拒绝。
`
