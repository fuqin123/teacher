import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

/**
 * 使用 SQLite 的 VACUUM INTO 生成一致性快照。
 *
 * 相比直接复制 .db 文件，VACUUM INTO 由 SQLite 自身完成页面拷贝，
 * 在 API 运行期间也能得到可用的一致性备份。
 */
async function main() {
  const prisma = new PrismaClient()
  try {
    const dir = path.resolve(process.cwd(), 'backups')
    await mkdir(dir, { recursive: true })

    const stamp = new Date()
      .toLocaleString('sv-SE', { timeZone: process.env.TZ ?? 'Asia/Shanghai' })
      .replace(/[: ]/g, '-')
    const target = path.join(dir, `scorelens-${stamp}.db`)

    await prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    console.log(`备份完成：${target}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('备份失败：', error)
  process.exit(1)
})
