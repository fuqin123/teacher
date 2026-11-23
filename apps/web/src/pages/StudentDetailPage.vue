<template>
  <div class="flex mb-18">
    <button class="btn ghost sm" @click="router.push('/students')">返回学生列表</button>
  </div>

  <div v-if="query.isPending.value" class="loading-block">正在加载学生档案…</div>
  <div v-else-if="query.error.value" class="error-panel">{{ query.error.value.message }}</div>

  <template v-else-if="data">
    <div class="page-note">
      <AppIcon name="info" />
      <template v-if="data.mode === 'subject'">
        任课老师单科视图：仅展示 {{ data.subject?.name }} 成绩与名次。
      </template>
      <template v-else>
        成绩画像与趋势基于「{{ data.exam.name }}」及本学期已导入考试。
      </template>
    </div>

    <div class="card mb-18">
      <div class="profile-head">
        <div class="big-ava">{{ data.student.name.slice(0, 1) }}</div>
        <div class="info">
          <h2>{{ data.student.name }}</h2>
          <div class="meta">
            <span>学号 {{ data.student.studentNo }}</span>
            <span>{{ data.student.className }}</span>
            <span>{{ data.student.gradeName }}</span>
            <span>班主任：{{ data.student.headTeacherName ?? '—' }}</span>
          </div>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="v">{{ scoreText(data.totalScore) }}</div>
            <div class="k">{{ data.mode === 'subject' ? '本科成绩' : '本次总分' }}</div>
          </div>
          <div class="stat">
            <div class="v">{{ data.classRank ?? '—' }}</div>
            <div class="k">{{ data.mode === 'subject' ? '班级单科名次' : '班级名次' }}</div>
          </div>
          <div class="stat">
            <div class="v">{{ data.gradeRank ?? '—' }}</div>
            <div class="k">{{ data.mode === 'subject' ? '年级单科名次' : '年级名次' }}</div>
          </div>
          <div class="stat">
            <div class="v">
              <span v-if="data.rankDelta === null">—</span>
              <span v-else-if="data.rankDelta > 0" style="color: #0a8f66">↑ {{ data.rankDelta }}</span>
              <span v-else-if="data.rankDelta < 0" style="color: #d9264a">↓ {{ Math.abs(data.rankDelta) }}</span>
              <span v-else>—</span>
            </div>
            <div class="k">较上场名次</div>
          </div>
        </div>
      </div>

      <div class="subject-pills">
        <div v-for="subject in data.subjects" :key="subject.subjectId" class="sub-pill">
          {{ subject.subjectName }}
          <b>{{ subject.isAbsent ? '缺考' : scoreText(subject.score) }}</b>
          <span class="tag" :class="subject.tag">
            {{ tagText(subject.tag, subject.zScore) }}
          </span>
        </div>
      </div>
    </div>

    <div
      class="grid-2-even"
      :style="{ gridTemplateColumns: data.mode === 'full' ? '1fr 1fr' : '1fr' }"
    >
      <div v-if="data.mode === 'full'" class="card">
        <div class="card-head">
          <h3>多科成绩画像</h3>
          <span class="chip violet">原始分 · 各科满分轴</span>
        </div>
        <div class="chart-box">
          <EChart :option="radarChart" height="300px" />
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <h3>历次{{ data.mode === 'subject' ? '单科' : '班级' }}名次变化</h3>
          <span class="chip mint">数字越小越好</span>
        </div>
        <div class="chart-box">
          <EChart :option="rankChart" height="300px" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>考试历史</h3>
        <span class="chip gray">本学期</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>考试</th>
              <th>日期</th>
              <th class="num">{{ data.mode === 'subject' ? '本科成绩' : '总分' }}</th>
              <th class="num">{{ data.mode === 'subject' ? '单科班名次' : '班级名次' }}</th>
              <th class="num">{{ data.mode === 'subject' ? '单科年名次' : '年级名次' }}</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in data.history.slice().reverse()" :key="item.examId">
              <td style="font-weight: 600; color: var(--ink)">{{ item.examName }}</td>
              <td>{{ item.heldAt }}</td>
              <td class="num">{{ scoreText(item.totalScore) }}</td>
              <td class="num">{{ item.classRank ?? '—' }}</td>
              <td class="num">{{ item.gradeRank ?? '—' }}</td>
              <td>
                <span class="chip" :class="item.complete ? 'mint' : 'amber'">
                  {{ item.complete ? '完整' : '缺考' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import AppIcon from '../components/AppIcon.vue'
import EChart from '../components/EChart.vue'
import { api } from '../api/client'
import { useContextStore } from '../stores/context'

const route = useRoute()
const router = useRouter()
const context = useContextStore()
const studentId = computed(() => String(route.params.id))

const query = useQuery({
  queryKey: computed(
    () =>
      ['student-profile', studentId.value, context.selectedExamId, context.selectedSubjectId] as const,
  ),
  queryFn: () =>
    api.getStudentProfile(
      studentId.value,
      context.selectedExamId || undefined,
      context.selectedSubjectId || undefined,
    ),
  enabled: computed(() => Boolean(studentId.value)),
})

const data = computed(() => query.data.value)

const radarChart = computed(() => {
  if (!data.value) return {}
  const radar = data.value.radar
  return {
    tooltip: {},
    legend: {
      bottom: 4,
      itemWidth: 14,
      textStyle: { color: '#475569', fontSize: 11 },
    },
    radar: {
      indicator: radar.indicators,
      radius: '64%',
      center: ['50%', '50%'],
      axisName: { color: '#475569', fontSize: 12 },
      splitArea: { areaStyle: { color: ['#FFFFFF', '#F6F9FE'] } },
      splitLine: { lineStyle: { color: '#E8EDF4' } },
      axisLine: { lineStyle: { color: '#E8EDF4' } },
    },
    series: [
      {
        type: 'radar',
        symbolSize: 5,
        data: [
          {
            value: radar.student,
            name: data.value.student.name,
            lineStyle: { width: 3, color: '#8B5CF6' },
            itemStyle: { color: '#8B5CF6' },
            areaStyle: { color: 'rgba(139,92,246,.15)' },
          },
          {
            value: radar.classAverage,
            name: '班级平均',
            lineStyle: { width: 2, type: 'dashed', color: '#94A3B8' },
            itemStyle: { color: '#94A3B8' },
            areaStyle: { color: 'rgba(148,163,184,.06)' },
          },
        ],
      },
    ],
  }
})

const rankChart = computed(() => {
  const trend = data.value?.rankTrend ?? []
  const rankValues = trend
    .map((item) => item.classRank)
    .filter((rank): rank is number => rank !== null)
  const maxRank = Math.max(15, ...rankValues, 1)
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 24, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((item) => item.examName),
      axisLabel: {
        color: '#94A3B8',
        fontSize: 11,
        interval: 0,
        rotate: trend.length > 4 ? 20 : 0,
      },
      axisLine: { lineStyle: { color: '#E8EDF4' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      inverse: true,
      min: 1,
      max: maxRank,
      minInterval: 1,
      splitNumber: 7,
      axisLabel: { color: '#94A3B8', fontSize: 11, formatter: '{value}' },
      splitLine: { lineStyle: { color: '#F1F5F9' } },
    },
    series: [
      {
        name: data.value?.mode === 'subject' ? '单科班级名次' : '班级名次',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        connectNulls: true,
        lineStyle: { width: 3, color: '#3B7CFF' },
        itemStyle: { color: '#3B7CFF', borderWidth: 2, borderColor: '#fff' },
        data: trend.map((item) => item.classRank),
        markPoint: {
          data: [{ type: 'min', name: '最佳' }],
          itemStyle: { color: '#10B981' },
          label: { color: '#fff', fontSize: 10 },
        },
      },
    ],
  }
})

function scoreText(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function tagText(tag: string, zScore: number | null) {
  if (tag === 'strong') return `优势科 ${zScore !== null ? `+${zScore.toFixed(1)}σ` : ''}`
  if (tag === 'weak') return `偏科 ${zScore !== null ? `${zScore.toFixed(1)}σ` : ''}`
  if (tag === 'absent') return '缺考'
  return '均衡'
}
</script>