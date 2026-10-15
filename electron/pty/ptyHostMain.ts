/**
 * 终端宿主入口。独立进程，监听命名管道。
 * 窗口断开只丢掉这个客户端，终端留在本进程里。
 */
import { createServer } from 'node:net'
import { unlinkSync } from 'node:fs'
import { PtyHostServer } from './PtyHostServer'
import { ptyHostPipeName } from './PtyHostContract'

const pipe = ptyHostPipeName()
if (process.platform !== 'win32') {
  try {
    unlinkSync(pipe)
  } catch {
    // 没有旧套接字。
  }
}

const host = new PtyHostServer()
const server = createServer((socket) => {
  host.attachClient(socket)
})
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') process.exit(0)
  console.error('[pty-host] listen failed:', error.code ?? error.message)
  process.exit(1)
})
server.listen(pipe, () => {
  console.error(`[pty-host] listening ${pipe}`)
})
