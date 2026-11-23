<template>
  <div class="page-note">
    <AppIcon name="info" />
    当前版本基础数据来自种子/已有数据，编辑功能将在后续版本开放；导入成绩前请确认班级与科目。
  </div>

  <div v-if="context.loading" class="loading-block">正在加载基础数据…</div>
  <template v-else>
    <div class="grid-2-even">
      <div class="card">
        <div class="card-head">
          <h3>学期</h3>
          <span class="chip blue">{{ context.terms.length }} 个</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>学期</th><th>学年</th><th>状态</th></tr></thead>
            <tbody>
              <tr v-for="term in context.terms" :key="term.id">
                <td style="font-weight: 600; color: var(--ink)">{{ term.name }}</td>
                <td>{{ term.schoolYear }}</td>
                <td>
                  <span class="chip" :class="term.isCurrent ? 'mint' : 'gray'">
                    {{ term.isCurrent ? '当前学期' : '历史' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>科目</h3>
          <span class="chip blue">{{ context.subjects.length }} 个</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>科目</th><th>代码</th><th class="num">默认满分</th></tr></thead>
            <tbody>
              <tr v-for="subject in context.subjects" :key="subject.id">
                <td style="font-weight: 600; color: var(--ink)">{{ subject.name }}</td>
                <td class="mono">{{ subject.code }}</td>
                <td class="num">{{ subject.defaultFullScore ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>班级</h3>
        <span class="chip blue">{{ context.classes.length }} 个</span>
        <div class="right">
          <button class="btn sm" @click="router.push('/students')">查看学生名单</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>班级</th>
              <th>年级</th>
              <th>班级组</th>
              <th class="num">学生数</th>
              <th>班主任</th>
              <th>学期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="klass in context.classes" :key="klass.id">
              <td style="font-weight: 600; color: var(--ink)">{{ klass.name }}</td>
              <td>{{ klass.gradeName }}</td>
              <td>{{ klass.classGroupName }}</td>
              <td class="num">{{ klass.studentCount }}</td>
              <td>{{ klass.headTeacherName ?? '—' }}</td>
              <td>{{ klass.termName }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="context.classes.length === 0" class="table-empty">暂无班级数据</div>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { useContextStore } from '../stores/context'

const context = useContextStore()
const router = useRouter()
</script>