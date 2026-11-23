<template>
  <div class="app-shell">
    <aside class="sidebar">
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

      <nav class="nav">
        <template v-for="group in visibleGroups" :key="group.title">
          <div class="group">{{ group.title }}</div>
          <button
            v-for="item in group.items"
            :key="item.to"
            class="nav-item"
            :class="{ active: isActive(item) }"
            @click="go(item.to)"
          >
            <AppIcon :name="item.icon" />
            <span>{{ item.label }}</span>
            <span v-if="item.tag" class="tag">{{ item.tag }}</span>
          </button>
        </template>
      </nav>

      <div class="sidebar-footer">
        <div class="tip">
          <b>v0.1.0</b> · 手动映射导入已可用；AI 表头识别与汇总表优化将在后续版本接入。
        </div>
      </div>

      <div class="user-card">
        <div class="avatar">{{ auth.user?.displayName?.slice(0, 1) ?? '师' }}</div>
        <div class="meta">
          <div class="n">{{ auth.user?.displayName ?? '未登录' }}</div>
          <div class="r">{{ auth.roleText }}</div>
        </div>
        <button class="logout-btn" title="退出登录" @click="logout">
          <AppIcon name="logout" />
        </button>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <h1>{{ pageTitle }}</h1>
          <div class="crumb">{{ pageCrumb }}</div>
        </div>
        <div class="spacer" />

        <div v-if="context.isSubjectViewer" class="select-mock">
          <span>科目</span>
          <select v-model="context.selectedSubjectId">
            <option v-for="subject in context.subjects" :key="subject.id" :value="subject.id">
              {{ subject.name }}
            </option>
          </select>
        </div>

        <div class="select-mock">
          <span>考试</span>
          <select v-model="context.selectedExamId" :disabled="context.availableExams.length === 0">
            <option v-if="context.availableExams.length === 0" value="">暂无考试</option>
            <option v-for="exam in context.availableExams" :key="exam.id" :value="exam.id">
              {{ exam.name }}
            </option>
          </select>
        </div>

        <div class="select-mock">
          <span>班级</span>
          <select v-model="context.selectedClassId" :disabled="context.classes.length === 0">
            <option v-if="context.classes.length === 0" value="">暂无班级</option>
            <option v-for="klass in context.classes" :key="klass.id" :value="klass.id">
              {{ klass.name }}
            </option>
          </select>
        </div>
      </header>

      <div class="content">
        <div v-if="context.error" class="error-panel">{{ context.error }}</div>
        <div v-else-if="context.loading" class="loading-block">正在加载基础数据…</div>
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { RoleCode } from '@scorelens/shared'
import AppIcon from '../components/AppIcon.vue'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'

interface NavItem {
  label: string
  to: string
  icon: string
  roles?: RoleCode[]
  tag?: string
  match?: string
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const auth = useAuthStore()
const context = useContextStore()
const route = useRoute()
const router = useRouter()

const groups: NavGroup[] = [
  {
    title: '分析',
    items: [
      { label: '班级看板', to: '/dashboard', icon: 'dashboard' },
      {
        label: '年级对比',
        to: '/grade',
        icon: 'grade',
        roles: ['admin', 'grade_director'],
        tag: '主任',
      },
      { label: '学生档案', to: '/students', icon: 'students', match: '/students' },
    ],
  },
  {
    title: '数据',
    items: [
      {
        label: '成绩导入',
        to: '/imports/new',
        icon: 'import',
        roles: ['admin', 'grade_director', 'head_teacher'],
      },
      {
        label: '导入历史',
        to: '/imports',
        icon: 'history',
        roles: ['admin', 'grade_director', 'head_teacher'],
      },
    ],
  },
  {
    title: '系统',
    items: [
      { label: '基础数据', to: '/base-data', icon: 'database' },
      { label: '系统设置', to: '/settings', icon: 'settings', roles: ['admin'] },
    ],
  },
]

const visibleGroups = computed(() =>
  groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => auth.hasRole(item.roles)),
    }))
    .filter((group) => group.items.length > 0),
)

const pageTitle = computed(() => String(route.meta.title ?? '成绩云析'))
const pageCrumb = computed(() => {
  if (route.name === 'dashboard' && context.selectedExam) {
    return `${context.selectedClass?.name ?? ''} · ${context.selectedExam.name}`
  }
  if (route.name === 'grade' && context.selectedExam) {
    return `${context.selectedExam.gradeName} · ${context.selectedExam.name}`
  }
  return String(route.meta.crumb ?? '成绩导入与可视化分析')
})

function isActive(item: NavItem) {
  if (item.match) return route.path.startsWith(item.match)
  if (item.to === '/imports') return route.path === '/imports'
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

function go(path: string) {
  if (route.path !== path) router.push(path)
}

async function logout() {
  await auth.logout()
  await router.push('/login')
}

onMounted(() => {
  void context.load(true)
})
</script>