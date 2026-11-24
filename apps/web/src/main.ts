import { createApp } from 'vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import App from './App.vue'
import { router } from './router'
import { pinia } from './pinia'
import { queryClient } from './queryClient'
import { setUnauthorizedHandler } from './api/client'
import { useAuthStore } from './stores/auth'
import './styles/main.css'

// 会话过期或 Cookie 失效：清理状态并回到登录页，避免红条“请先登录”打断使用
setUnauthorizedHandler(() => {
  const auth = useAuthStore(pinia)
  // 只有“已登录后会话失效”才提示过期；冷启动未登录时直接回登录页
  const hadSession = Boolean(auth.user)
  auth.clear()
  queryClient.clear()
  const current = router.currentRoute.value
  if (current.name === 'login') return
  void router.replace({
    name: 'login',
    query: hadSession
      ? { redirect: current.fullPath, expired: '1' }
      : { redirect: current.fullPath },
  })
})

const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(VueQueryPlugin, { queryClient })
app.mount('#app')