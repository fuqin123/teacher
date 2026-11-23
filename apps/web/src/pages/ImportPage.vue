<template>
  <div class="card mb-18">
    <div class="stepper">
      <div class="step" :class="{ current: step === 1, done: step > 1 }">
        <div class="dot">{{ step > 1 ? '✓' : '1' }}</div>
        <div class="txt">上传表格<small>选择班级与文件</small></div>
      </div>
      <div class="step-line" :class="{ fill: step > 1 }" />
      <div class="step" :class="{ current: step === 2, done: step > 2 }">
        <div class="dot">{{ step > 2 ? '✓' : '2' }}</div>
        <div class="txt">确认映射<small>表头 → 标准字段</small></div>
      </div>
      <div class="step-line" :class="{ fill: step > 2 }" />
      <div class="step" :class="{ current: step === 3, done: step > 3 }">
        <div class="dot">{{ step > 3 ? '✓' : '3' }}</div>
        <div class="txt">数据校验<small>范围 · 学号 · 缺考</small></div>
      </div>
      <div class="step-line" :class="{ fill: step > 3 }" />
      <div class="step" :class="{ current: step === 4 }">
        <div class="dot">4</div>
        <div class="txt">完成入库<small>事务写入</small></div>
      </div>
    </div>
  </div>

  <div v-if="error" class="error-panel">{{ error }}</div>

  <!-- Step 1 -->
  <div v-if="step === 1" class="grid-2-even" style="grid-template-columns: 1fr 1.2fr">
    <div class="card">
      <div class="card-head">
        <h3>1. 选择班级与文件</h3>
        <span class="chip gray">xlsx / xls / csv</span>
      </div>
      <div style="padding: 16px 24px 0">
        <div class="field">
          <label>班级</label>
          <select v-model="classId" class="select">
            <option value="" disabled>请选择班级</option>
            <option v-for="klass in context.classes" :key="klass.id" :value="klass.id">
              {{ klass.name }}（{{ klass.studentCount }} 人）
            </option>
          </select>
        </div>
      </div>

      <div class="dropzone" @click="fileInput?.click()">
        <div class="dz-icon"><AppIcon name="upload" /></div>
        <h4>{{ file ? '已选择文件，点击可更换' : '点击选择成绩表格' }}</h4>
        <p>
          支持 .xlsx / .xls / .csv，单文件 ≤ 10MB<br />
          首行通常是表头；系统会自动识别表头行
        </p>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".xlsx,.xls,.csv"
        style="display: none"
        @change="onFileChange"
      />

      <div v-if="file" class="file-chip">
        <div class="fc-icon">FILE</div>
        <div class="fc-meta">
          <div class="n">{{ file.name }}</div>
          <div class="s">{{ formatSize(file.size) }} · 待解析</div>
        </div>
        <button class="btn ghost" @click="file = null">移除</button>
      </div>

      <div class="card-foot">
        <button class="btn" @click="downloadTemplate">下载标准模板</button>
        <button class="btn primary" :disabled="busy || !file || !classId" @click="upload">
          {{ busy ? '正在解析…' : '开始解析' }}
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>导入说明</h3>
        <span class="chip blue">v0.1.0 手动映射</span>
      </div>
      <div style="padding: 16px 24px 22px; font-size: 13px; color: var(--ink-2); line-height: 1.9">
        <p><b>标准宽表：</b>一行一个学生，包含学号、姓名和各科成绩列。</p>
        <p><b>缺考：</b>填写“缺考”“缺”“免考”或“—”，不要留空。</p>
        <p><b>学号：</b>必须是本班名单中的学号；数字 0 是有效成绩。</p>
        <p><b>考试记录：</b>下一步填写考试名称、类型与日期，入库时会自动创建或复用同年级同名称的考试。</p>
        <p style="margin-top: 10px; color: var(--ink-faint)">
          当前版本不包含 AI 表头识别，列映射由规则建议 + 人工确认完成。
        </p>
      </div>
    </div>
  </div>

  <!-- Step 2 -->
  <template v-else-if="step === 2 && uploadResult">
    <div class="card mb-18">
      <div class="card-head">
        <h3>2. 确认考试信息与表头映射</h3>
        <span class="chip mint">已识别第 {{ uploadResult.headerRow + 1 }} 行表头</span>
        <div class="right">
          <span class="hint">{{ uploadResult.fileName }} · {{ uploadResult.rowCount }} 行数据</span>
        </div>
      </div>

      <div style="padding: 16px 24px 4px">
        <div class="form-grid">
          <div class="field">
            <label>考试名称</label>
            <input v-model.trim="examForm.name" class="input" placeholder="如：期中考试" />
          </div>
          <div class="field">
            <label>考试类型</label>
            <select v-model="examForm.type" class="select">
              <option v-for="type in examTypes" :key="type" :value="type">
                {{ examTypeLabels[type] }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>考试日期</label>
            <input v-model="examForm.heldAt" type="date" class="input" />
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>源文件列</th>
              <th>样例值</th>
              <th>映射到标准字段</th>
              <th>建议</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(header, index) in uploadResult.headers" :key="index">
              <td style="font-weight: 600; color: var(--ink)">{{ header }}</td>
              <td class="muted">{{ uploadResult.samples[0]?.[index] ?? '—' }}</td>
              <td>
                <select v-model="mappingColumns[index].target" class="mapping-select">
                  <option v-for="option in targetOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </td>
              <td>
                <span class="chip" :class="suggestionClass(suggestionFor(index)?.confidence)">
                  {{ suggestionLabel(suggestionFor(index)?.confidence) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card-head" style="padding-top: 6px">
        <h3 style="font-size: 13.5px">科目满分配置</h3>
        <span class="sub">不同地区/科目可按实际填写</span>
      </div>
      <div class="subject-config-grid">
        <div v-for="row in mappedSubjectRows" :key="row.subject.id" class="subject-config">
          <div class="name">{{ row.subject.name }}</div>
          <div class="line">
            <span>满分</span>
            <input
              v-if="row.config"
              v-model.number="row.config.fullScore"
              type="number"
              min="1"
              max="1000"
              class="input"
            />
            <label style="display: flex; align-items: center; gap: 5px; margin-left: auto">
              <input v-if="row.config" v-model="row.config.includedInTotal" type="checkbox" />
              计入总分
            </label>
          </div>
        </div>
        <div v-if="mappedSubjectRows.length === 0" class="hint" style="grid-column: 1 / -1">
          还没有映射任何科目列。
        </div>
      </div>

      <div class="card-foot">
        <button class="btn ghost" :disabled="busy" @click="restart">重新上传</button>
        <button class="btn primary" :disabled="busy || !mappingValid" @click="saveAndValidate">
          {{ busy ? '正在校验…' : '保存映射并校验' }}
        </button>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>文件预览</h3>
        <span class="chip gray">前 {{ Math.min(uploadResult.samples.length, 5) }} 行</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="header in uploadResult.headers" :key="header">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in uploadResult.samples" :key="rowIndex">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>

  <!-- Step 3 -->
  <template v-else-if="step === 3 && validation">
    <div class="card mb-18">
      <div class="card-head">
        <h3>3. 数据校验结果</h3>
        <span class="chip" :class="validation.status === 'validated' ? 'mint' : 'rose'">
          {{ validation.status === 'validated' ? '全部通过' : '存在异常' }}
        </span>
        <div class="right">
          <button class="btn ghost" @click="restart">重新上传</button>
        </div>
      </div>

      <div class="stat-row" style="padding-top: 14px">
        <div class="item"><b>{{ validation.stats.totalRows }}</b>数据行</div>
        <div class="item"><b>{{ validation.stats.validRows }}</b>可入库</div>
        <div class="item"><b>{{ validation.stats.errorRows }}</b>异常行</div>
        <div class="item"><b>{{ validation.stats.absentCount }}</b>缺考记录</div>
      </div>

      <div v-if="validation.errors.length" class="error-panel">
        发现 {{ validation.errors.length }} 个错误，修正源文件后重新上传即可。错误明细如下：
      </div>
      <div v-if="validation.errors.length" class="table-wrap" style="padding-top: 0">
        <table>
          <thead><tr><th>行号</th><th>列</th><th>问题</th></tr></thead>
          <tbody>
            <tr v-for="(issue, index) in validation.errors" :key="`e-${index}`" class="err-row">
              <td>#{{ issue.row }}</td>
              <td>{{ issue.column ?? '—' }}</td>
              <td>{{ issue.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="validation.warnings.length" class="warn-panel">
        {{ validation.warnings.length }} 条警告（不阻止入库）：
        {{ validation.warnings.slice(0, 3).map((item) => `第 ${item.row} 行 ${item.message}`).join('；') }}
      </div>

      <div class="card-head" style="padding-top: 10px">
        <h3 style="font-size: 13.5px">入库预览</h3>
        <span class="sub">前 {{ validation.preview.length }} 行</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th v-for="key in previewKeys" :key="key">{{ key }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in validation.preview" :key="index">
              <td v-for="key in previewKeys" :key="key">{{ row[key] ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card-foot">
        <span class="hint" style="margin-right: auto; align-self: center">
          入库后会写入成绩、变更日志，并自动出现在看板中。
        </span>
        <button
          class="btn primary"
          :disabled="busy || validation.errors.length > 0"
          @click="commit"
        >
          {{ busy ? '正在入库…' : '确认入库' }}
        </button>
      </div>
    </div>
  </template>

  <!-- Step 4 -->
  <template v-else-if="step === 4 && commitResult">
    <div class="card">
      <div class="card-head">
        <h3>4. 入库完成</h3>
        <span class="chip mint">成功</span>
      </div>
      <div class="success-panel" style="margin: 18px 24px">
        考试「{{ commitResult.examName }}」已写入：新增 {{ commitResult.inserted }} 条，更新
        {{ commitResult.updated }} 条，缺考 {{ commitResult.absentCount }} 条。
      </div>
      <div class="card-foot">
        <button class="btn" @click="router.push('/imports')">查看导入历史</button>
        <button class="btn primary" @click="openDashboard">查看看板</button>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  examTypeLabels,
  examTypes,
  parseSubjectTarget,
  subjectTarget,
  type ExamType,
  type ImportCommitResponse,
  type ImportMappingInput,
  type ImportValidationResponse,
  type ParsedImportResponse,
} from '@scorelens/shared'
import AppIcon from '../components/AppIcon.vue'
import { api } from '../api/client'
import { useContextStore } from '../stores/context'

const context = useContextStore()
const router = useRouter()

const step = ref(1)
const classId = ref(context.selectedClassId)
const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const uploadResult = ref<ParsedImportResponse | null>(null)
const validation = ref<ImportValidationResponse | null>(null)
const commitResult = ref<ImportCommitResponse | null>(null)
const busy = ref(false)
const error = ref('')
const mappingColumns = ref<Array<{ index: number; target: string }>>([])
const subjectConfigs = ref<Record<string, { fullScore: number; includedInTotal: boolean }>>({})
const examForm = reactive<{ name: string; type: ExamType; heldAt: string }>({
  name: '',
  type: 'midterm',
  heldAt: new Date().toISOString().slice(0, 10),
})

const targetOptions = computed(() => [
  { value: 'student_no', label: '学生学号' },
  { value: 'name', label: '学生姓名' },
  { value: 'ignore', label: '跳过此列' },
  ...context.subjects.map((subject) => ({
    value: subjectTarget(subject.id),
    label: `科目：${subject.name}`,
  })),
])

const mappedSubjectIds = computed(() =>
  [
    ...new Set(
      mappingColumns.value
        .map((column) => parseSubjectTarget(column.target))
        .filter((item): item is string => Boolean(item)),
    ),
  ],
)

const mappedSubjectRows = computed(() =>
  mappedSubjectIds.value
    .map((subjectId) => {
      const subject = context.subjects.find((item) => item.id === subjectId)
      if (!subject) return null
      return {
        subject,
        config: subjectConfigs.value[subjectId],
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item)),
)

const mappingValid = computed(() => {
  const targets = mappingColumns.value.map((column) => column.target)
  const studentNoCount = targets.filter((target) => target === 'student_no').length
  const nameCount = targets.filter((target) => target === 'name').length
  return (
    studentNoCount === 1 &&
    nameCount === 1 &&
    mappedSubjectRows.value.length > 0 &&
    mappedSubjectRows.value.every(
      (row) => row.config && row.config.fullScore > 0,
    ) &&
    Boolean(examForm.name) &&
    Boolean(examForm.heldAt)
  )
})

const previewKeys = computed(() =>
  validation.value?.preview[0] ? Object.keys(validation.value.preview[0]) : [],
)

watch(
  () => context.selectedClassId,
  (value) => {
    if (!classId.value) classId.value = value
  },
  { immediate: true },
)

watch(
  mappingColumns,
  () => {
    const nextConfigs: Record<string, { fullScore: number; includedInTotal: boolean }> = {}
    for (const subjectId of mappedSubjectIds.value) {
      const existing = subjectConfigs.value[subjectId]
      if (existing) {
        nextConfigs[subjectId] = existing
        continue
      }
      const subject = context.subjects.find((item) => item.id === subjectId)
      nextConfigs[subjectId] = {
        fullScore: Number(subject?.defaultFullScore ?? 100),
        includedInTotal: true,
      }
    }
    subjectConfigs.value = nextConfigs
  },
  { deep: true },
)

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  file.value = target.files?.[0] ?? null
  error.value = ''
}

async function upload() {
  if (!file.value || !classId.value) return
  busy.value = true
  error.value = ''
  try {
    const result = await api.uploadImport(file.value, classId.value)
    uploadResult.value = result
    mappingColumns.value = result.suggestions.map((suggestion) => ({
      index: suggestion.index,
      target: suggestion.target,
    }))
    examForm.name = result.fileName.replace(/\.[^.]+$/, '') || '期中考试'
    examForm.type = 'midterm'
    step.value = 2
  } catch (err) {
    error.value = err instanceof Error ? err.message : '文件解析失败'
  } finally {
    busy.value = false
  }
}

async function saveAndValidate() {
  if (!uploadResult.value) return
  busy.value = true
  error.value = ''
  try {
    const subjects = mappedSubjectRows.value.map((row) => ({
      subjectId: row.subject.id,
      fullScore: Number(row.config!.fullScore),
      includedInTotal: row.config!.includedInTotal,
    }))
    const payload: ImportMappingInput = {
      headerRow: uploadResult.value.headerRow,
      columns: mappingColumns.value.map((column) => ({
        index: column.index,
        target: column.target,
      })),
      exam: {
        name: examForm.name,
        type: examForm.type,
        heldAt: examForm.heldAt,
      },
      subjects,
    }
    await api.saveImportMapping(uploadResult.value.batchId, payload)
    validation.value = await api.validateImport(uploadResult.value.batchId)
    step.value = 3
  } catch (err) {
    error.value = err instanceof Error ? err.message : '校验失败'
  } finally {
    busy.value = false
  }
}

async function commit() {
  if (!uploadResult.value) return
  busy.value = true
  error.value = ''
  try {
    commitResult.value = await api.commitImport(uploadResult.value.batchId)
    step.value = 4
    try {
      await context.refreshExams(commitResult.value.examId)
      if (uploadResult.value) context.selectedClassId = classId.value
    } catch {
      // 看板刷新失败不影响入库结果
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '入库失败'
  } finally {
    busy.value = false
  }
}

function restart() {
  step.value = 1
  file.value = null
  uploadResult.value = null
  validation.value = null
  commitResult.value = null
  mappingColumns.value = []
  subjectConfigs.value = {}
  error.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function openDashboard() {
  void router.push('/dashboard')
}

function suggestionFor(index: number) {
  return uploadResult.value?.suggestions.find((item) => item.index === index)
}

function suggestionLabel(confidence?: string) {
  if (confidence === 'high') return '高置信'
  if (confidence === 'medium') return '中等'
  return '需确认'
}

function suggestionClass(confidence?: string) {
  if (confidence === 'high') return 'mint'
  if (confidence === 'medium') return 'amber'
  return 'gray'
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function downloadTemplate() {
  const subjects = context.subjects.map((subject) => subject.name)
  const header = ['学号', '姓名', ...subjects].join(',')
  const sample = ['20250001', '示例学生', ...subjects.map(() => '')].join(',')
  const blob = new Blob([`\uFEFF${header}\n${sample}\n`], {
    type: 'text/csv;charset=utf-8',
  })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = '成绩导入模板.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}

onMounted(() => {
  if (!context.loaded) void context.load()
})
</script>