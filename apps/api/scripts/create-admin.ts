import { PrismaClient } from '@prisma/client'
import { hash } from '@node-rs/argon2'

/**
 * 创建或重置一个管理员账号，用于正式部署时初始化账号
 * （种子脚本会清空数据，只能用于开发/测试环境）。
 *
 * 用法：
 *   ADMIN_USERNAME=principal ADMIN_PASSWORD='至少8位' \
 *     pnpm --filter @scorelens/api admin:create
 */
async function main() {
  const username = (process.env.ADMIN_USERNAME ?? '').trim() || 'admin'
  const password = process.env.ADMIN_PASSWORD ?? ''
  const displayName = (process.env.ADMIN_DISPLAY_NAME ?? '').trim() || '系统管理员'

  if (password.length < 8) {
    console.error('请通过环境变量 ADMIN_PASSWORD 提供至少 8 位的新密码')
    process.exit(1)
  }
  if (username.length < 2 || username.length > 32) {
    console.error('ADMIN_USERNAME 长度需在 2~32 之间')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    const passwordHash = await hash(password)
    const existing = await prisma.user.findUnique({
      where: { username },
      include: { roles: true },
    })

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { passwordHash, displayName, status: 'active' },
        })
      : await prisma.user.create({
          data: { username, passwordHash, displayName, status: 'active' },
        })

    const hasAdminRole = existing?.roles.some((item) => item.role === 'admin') ?? false
    if (!hasAdminRole) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: 'admin' } },
        update: {},
        create: { userId: user.id, role: 'admin' },
      })
    }

    console.log(
      existing
        ? `已重置管理员密码：${username}（${displayName}）`
        : `已创建管理员：${username}（${displayName}）`,
    )
    console.log('账号已写入当前 DATABASE_URL 指向的数据库，可立即登录。')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('创建管理员失败：', error)
  process.exit(1)
})
