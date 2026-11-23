import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { pinia } from './pinia'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./pages/LoginPage.vue'),
      meta: { public: true, title: '登录' },
    },
    {
      path: '/',
      component: () => import('./layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('./pages/DashboardPage.vue'),
          meta: { title: '班级看板', crumb: '成绩概览 · 学科 · 排名' },
        },
        {
          path: 'grade',
          name: 'grade',
          component: () => import('./pages/GradePage.vue'),
          meta: {
            title: '年级对比',
            crumb: '班级均分 · 学科偏差',
            roles: ['admin', 'grade_director'],
          },
        },
        {
          path: 'students',
          name: 'students',
          component: () => import('./pages/StudentsPage.vue'),
          meta: { title: '学生档案', crumb: '按班级查看 · 搜索学生' },
        },
        {
          path: 'students/:id',
          name: 'student-detail',
          component: () => import('./pages/StudentDetailPage.vue'),
          meta: { title: '学生档案', crumb: '成绩画像 · 名次趋势' },
        },
        {
          path: 'imports/new',
          name: 'import-new',
          component: () => import('./pages/ImportPage.vue'),
          meta: {
            title: '成绩导入',
            crumb: '上传 · 映射 · 校验 · 入库',
            roles: ['admin', 'grade_director', 'head_teacher'],
          },
        },
        {
          path: 'imports',
          name: 'imports',
          component: () => import('./pages/ImportHistoryPage.vue'),
          meta: {
            title: '导入历史',
            crumb: '批次 · 映射快照 · 结果',
            roles: ['admin', 'grade_director', 'head_teacher'],
          },
        },
        {
          path: 'base-data',
          name: 'base-data',
          component: () => import('./pages/BaseDataPage.vue'),
          meta: { title: '基础数据', crumb: '学期 · 班级 · 科目 · 学生' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('./pages/SettingsPage.vue'),
          meta: {
            title: '系统设置',
            crumb: '统计口径 · 版本信息',
            roles: ['admin'],
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/dashboard',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore(pinia)
  if (!auth.initialized) {
    await auth.fetchMe()
  }

  if (to.meta.public) {
    if (auth.user && to.path === '/login') return '/dashboard'
    return true
  }

  if (!auth.user) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  const roles = to.meta.roles as string[] | undefined
  if (roles && !auth.user.roles.some((role) => roles.includes(role))) {
    return '/dashboard'
  }

  return true
})