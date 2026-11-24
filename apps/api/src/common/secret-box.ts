import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * 轻量对称加密，用于把管理员在界面上填写的 AI Key 落库。
 * 密钥由 SESSION_SECRET 派生：更换 SESSION_SECRET 会导致已保存的 Key 无法解密，
 * 此时按“未配置 Key”处理，需要管理员重新填写。
 */
export function createSecretBox(secret: string) {
  const key = scryptSync(secret || 'scorelens-dev-secret', 'scorelens.ai.config', 32)

  return {
    encrypt(plain: string): string {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.')
    },
    decrypt(payload: string): string | null {
      try {
        const [ivPart, tagPart, dataPart] = payload.split('.')
        if (!ivPart || !tagPart || !dataPart) return null
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          Buffer.from(ivPart, 'base64url'),
        )
        decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(dataPart, 'base64url')),
          decipher.final(),
        ])
        return decrypted.toString('utf8')
      } catch {
        return null
      }
    },
  }
}

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}
