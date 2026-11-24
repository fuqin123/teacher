import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { roleLabels, type RoleCode, type SessionUser } from '@scorelens/shared'
import { api } from '../api/client'
import { queryClient } from '../queryClient'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null)
  const initialized = ref(false)
  const loading = ref(false)

  const roleText = computed(() =>
    user.value
      ? user.value.roles.map((role) => roleLabels[role]).join(' / ')
      : '',
  )
  const isSubjectViewer = computed(
    () => Boolean(user.value?.roles.includes('subject_teacher')) && !user.value?.fullView,
  )
  const canImport = computed(
    () =>
      Boolean(
        user.value?.roles.some((role) =>
          ['admin', 'grade_director', 'head_teacher'].includes(role),
        ),
      ),
  )

  async function fetchMe(force = false) {
    if (initialized.value && !force) return user.value
    loading.value = true
    try {
      user.value = await api.me()
    } catch {
      user.value = null
    } finally {
      initialized.value = true
      loading.value = false
    }
    return user.value
  }

  async function login(username: string, password: string) {
    loading.value = true
    try {
      queryClient.clear()
      user.value = await api.login(username, password)
      initialized.value = true
      return user.value
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await api.logout()
    } finally {
      queryClient.clear()
      user.value = null
      initialized.value = true
    }
  }

  /** 会话失效时清空登录态（由全局 401 处理调用） */
  function clear() {
    user.value = null
    initialized.value = true
  }

  function hasRole(roles: RoleCode[] | undefined) {
    if (!roles || roles.length === 0) return true
    return Boolean(user.value?.roles.some((role) => roles.includes(role)))
  }

  return {
    user,
    initialized,
    loading,
    roleText,
    isSubjectViewer,
    canImport,
    fetchMe,
    login,
    logout,
    clear,
    hasRole,
  }
})