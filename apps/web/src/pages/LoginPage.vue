<template>
  <div class="login-page">
    <div class="login-card">
      <section class="login-hero">
        <div>
          <div class="brand">
            <div class="logo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 3v18h18" />
                <rect x="7" y="12" width="3" height="6" rx="1" fill="currentColor" stroke="none" />
                <rect x="12" y="8" width="3" height="10" rx="1" fill="currentColor" stroke="none" />
                <rect x="17" y="4" width="3" height="14" rx="1" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <div class="name">成绩云析<em>SCORELENS</em></div>
          </div>
        </div>
        <div>
          <h1>让每一次考试<br /><span>都能被读懂</span></h1>
          <p>
            上传成绩表，自动完成班级、年级与学生维度的分析。
            数据进入统一模型，排名、趋势、偏科与临界生一目了然。
          </p>
          <div class="login-features">
            <div class="login-feature"><span class="dot" />成绩表手动映射导入，校验后事务入库</div>
            <div class="login-feature"><span class="dot" />班级看板 / 年级对比 / 学生档案</div>
            <div class="login-feature"><span class="dot" />数据范围按角色隔离，导入可追溯</div>
          </div>
        </div>
        <p style="font-size: 12px; color: var(--ink-faint)">
          v0.3.0 · 初中文化科目 · 单校部署
        </p>
      </section>

      <form class="login-form" @submit.prevent="submit">
        <div>
          <h2>登录</h2>
          <div class="sub">使用教师账号进入成绩分析工作台</div>
        </div>

        <div v-if="error" class="login-error">{{ error }}</div>

        <div class="field">
          <label for="username">账号</label>
          <input id="username" v-model.trim="username" class="input" autocomplete="username" placeholder="请输入账号" />
        </div>
        <div class="field">
          <label for="password">密码</label>
          <input id="password" v-model="password" class="input" type="password" autocomplete="current-password" placeholder="请输入密码" />
        </div>

        <button class="btn primary" type="submit" :disabled="busy">
          {{ busy ? '正在登录…' : '进入工作台' }}
        </button>

        <div class="demo-accounts">
          <div class="t">演示账号（种子数据）</div>
          <div class="demo-grid">
            <button
              v-for="account in accounts"
              :key="account.username"
              type="button"
              class="demo-btn"
              @click="fill(account.username, account.password)"
            >
              <b>{{ account.label }}</b>
              {{ account.username }} / {{ account.password }}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

const accounts = [
  { label: '班主任', username: 'wang', password: 'wang123' },
  { label: '年级主任', username: 'director', password: 'director123' },
  { label: '任课老师', username: 'zhang', password: 'zhang123' },
  { label: '管理员', username: 'admin', password: 'admin123' },
]

function fill(name: string, pwd: string) {
  username.value = name
  password.value = pwd
  error.value = ''
}

async function submit() {
  if (!username.value || !password.value) {
    error.value = '请输入账号和密码'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await auth.login(username.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
    await router.push(redirect)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '登录失败'
  } finally {
    busy.value = false
  }
}
</script>