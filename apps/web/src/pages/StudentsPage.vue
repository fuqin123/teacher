<template>
  <div class="card">
    <div class="card-head">
      <h3>学生名单</h3>
      <span class="chip gray">{{ students.length }} 人</span>
      <div class="right">
        <select v-model="classFilter" class="select" style="width: 160px">
          <option value="">全部班级</option>
          <option v-for="klass in context.classes" :key="klass.id" :value="klass.id">
            {{ klass.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="toolbar">
      <input
        v-model.trim="searchInput"
        class="search-input"
        placeholder="搜索姓名 / 学号，回车查询"
        @keyup.enter="applySearch"
      />
      <button class="btn" @click="applySearch">查询</button>
      <button v-if="search || classFilter" class="btn ghost" @click="reset">重置</button>
    </div>

    <div v-if="query.isPending.value" class="loading-block">正在加载学生名单…</div>
    <div v-else-if="query.error.value" class="error-panel">{{ query.error.value.message }}</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>学号</th>
            <th>学生</th>
            <th>班级</th>
            <th>年级</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="student in students" :key="student.id">
            <td class="mono">{{ student.studentNo }}</td>
            <td>
              <span class="stu">
                <span class="ava">{{ student.name.slice(0, 1) }}</span>{{ student.name }}
              </span>
            </td>
            <td>{{ student.className }}</td>
            <td>{{ student.gradeName }}</td>
            <td>
              <span class="chip" :class="student.status === 'active' ? 'mint' : 'gray'">
                {{ student.status === 'active' ? '在读' : student.status === 'left' ? '离校' : '毕业' }}
              </span>
            </td>
            <td>
              <button class="btn ghost sm" @click="openStudent(student.id)">查看档案</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="students.length === 0" class="table-empty">没有匹配的学生</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useRouter } from 'vue-router'
import { api } from '../api/client'
import { useContextStore } from '../stores/context'

const context = useContextStore()
const router = useRouter()

const classFilter = ref('')
const searchInput = ref('')
const search = ref('')

watch(
  () => context.selectedClassId,
  (value) => {
    if (!classFilter.value) classFilter.value = value
  },
  { immediate: true },
)

const query = useQuery({
  queryKey: computed(() => ['students', classFilter.value, search.value] as const),
  queryFn: () => api.getStudents(classFilter.value || undefined, search.value || undefined),
})

const students = computed(() => query.data.value ?? [])

function applySearch() {
  search.value = searchInput.value
}

function reset() {
  classFilter.value = ''
  searchInput.value = ''
  search.value = ''
}

function openStudent(id: string) {
  router.push(`/students/${id}`)
}
</script>