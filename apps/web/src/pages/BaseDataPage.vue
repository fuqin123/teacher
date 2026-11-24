<template>
  <div class="page-note">
    <AppIcon name="info" />
    <span v-if="isAdmin">
      湖南初中基础数据维护：学期、年级（初一 / 初二 / 初三）、班级、科目与学生在此统一新增和修改，保存后看板、成绩导入与学生档案立即生效。
    </span>
    <span v-else>基础数据由管理员维护，此处为只读展示。导入成绩前请确认班级与科目是否完整。</span>
  </div>

  <div v-if="error" class="error-panel">{{ error }}</div>
  <div v-if="loading" class="loading-block">正在加载基础数据…</div>

  <template v-else>
    <div class="grid-2-even">
      <div class="card">
        <div class="card-head">
          <h3>学期</h3>
          <span class="chip blue">{{ termRows.length }} 个</span>
          <div v-if="isAdmin" class="right">
            <button class="btn sm primary" @click="openTerm()">新增学期</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>学期</th>
                <th>学年</th>
                <th v-if="isAdmin">起止日期</th>
                <th>状态</th>
                <th v-if="isAdmin"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="term in termRows" :key="term.id">
                <td style="font-weight: 600; color: var(--ink)">{{ term.name }}</td>
                <td>{{ term.schoolYear }}</td>
                <td v-if="isAdmin" class="muted">{{ dateRange(term.startDate, term.endDate) }}</td>
                <td>
                  <span class="chip" :class="term.isCurrent ? 'mint' : 'gray'">
                    {{ term.isCurrent ? '当前学期' : '历史' }}
                  </span>
                </td>
                <td v-if="isAdmin">
                  <div class="row-actions">
                    <button class="btn ghost sm" @click="openTerm(term)">编辑</button>
                    <button
                      v-if="!term.isCurrent"
                      class="btn ghost sm"
                      @click="setCurrentTerm(term)"
                    >
                      设为当前
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="termRows.length === 0" class="table-empty">暂无学期</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>科目</h3>
          <span class="chip blue">{{ subjectRows.length }} 个</span>
          <div v-if="isAdmin" class="right">
            <button class="btn sm primary" @click="openSubject()">新增科目</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>科目</th>
                <th>代码</th>
                <th class="num">默认满分</th>
                <th>状态</th>
                <th v-if="isAdmin"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="subject in subjectRows" :key="subject.id">
                <td style="font-weight: 600; color: var(--ink)">{{ subject.name }}</td>
                <td class="mono">{{ subject.code }}</td>
                <td class="num">{{ subject.defaultFullScore ?? '—' }}</td>
                <td>
                  <span class="chip" :class="subject.isActive ? 'mint' : 'gray'">
                    {{ subject.isActive ? '启用' : '停用' }}
                  </span>
                </td>
                <td v-if="isAdmin">
                  <div class="row-actions">
                    <button class="btn ghost sm" @click="openSubject(subject)">编辑</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="subjectRows.length === 0" class="table-empty">暂无科目</div>
        </div>
      </div>
    </div>

    <div class="card mb-18">
      <div class="card-head">
        <h3>年级</h3>
        <span class="chip blue">{{ gradeRows.length }} 个</span>
        <span class="sub">初中三个年级，按学期建档</span>
        <div v-if="isAdmin" class="right">
          <button class="btn sm primary" @click="openGrade()">新增年级</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>年级</th>
              <th class="num">层次</th>
              <th class="num">入学届</th>
              <th>所属学期</th>
              <th v-if="isAdmin" class="num">班级数</th>
              <th v-if="isAdmin"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="grade in gradeRows" :key="grade.id">
              <td style="font-weight: 600; color: var(--ink)">{{ grade.name }}</td>
              <td class="num">{{ levelLabel(grade.level) }}</td>
              <td class="num">{{ grade.entryYear }} 届</td>
              <td>{{ grade.termName || '—' }}</td>
              <td v-if="isAdmin" class="num">{{ grade.classCount }}</td>
              <td v-if="isAdmin">
                <div class="row-actions">
                  <button class="btn ghost sm" @click="openGrade(grade)">编辑</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="gradeRows.length === 0" class="table-empty">暂无年级，请先新增学期再建年级</div>
      </div>
    </div>

    <div class="card mb-18">
      <div class="card-head">
        <h3>班级</h3>
        <span class="chip blue">{{ classRows.length }} 个</span>
        <div class="right">
          <button v-if="isAdmin" class="btn sm primary" @click="openClass()">新增班级</button>
          <button class="btn sm" style="margin-left: 8px" @click="router.push('/students')">
            查看学生档案
          </button>
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
              <th v-if="isAdmin"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="klass in classRows" :key="klass.id">
              <td style="font-weight: 600; color: var(--ink)">{{ klass.name }}</td>
              <td>{{ klass.gradeName }}</td>
              <td>{{ klass.classGroupName }}</td>
              <td class="num">{{ klass.studentCount }}</td>
              <td>{{ klass.headTeacherName ?? '—' }}</td>
              <td>{{ klass.termName }}</td>
              <td v-if="isAdmin">
                <div class="row-actions">
                  <button class="btn ghost sm" @click="openClass(klass)">编辑</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="classRows.length === 0" class="table-empty">暂无班级</div>
      </div>
    </div>

    <div v-if="isAdmin" class="card">
      <div class="card-head">
        <h3>学生名单</h3>
        <span class="chip blue">{{ filteredStudents.length }} 人</span>
        <span class="sub">当前学期在册学生</span>
        <div class="right">
          <button class="btn sm primary" @click="openStudent()">新增学生</button>
        </div>
      </div>
      <div class="toolbar" style="padding-top: 4px">
        <AppSelect
          v-model="studentClassFilter"
          :options="studentClassOptions"
          size="sm"
          placeholder="全部班级"
          :min-menu-width="200"
          @update:model-value="loadStudents"
        />
        <input
          v-model.trim="studentSearch"
          class="input"
          style="max-width: 220px"
          placeholder="按学号或姓名筛选"
        />
        <span class="hint">共 {{ students.length }} 条在册记录</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>学号</th>
              <th>姓名</th>
              <th>班级</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="student in filteredStudents" :key="student.id">
              <td class="mono">{{ student.studentNo }}</td>
              <td style="font-weight: 600; color: var(--ink)">{{ student.name }}</td>
              <td>{{ student.className ?? '—' }}</td>
              <td>
                <span class="chip" :class="student.status === 'active' ? 'mint' : 'gray'">
                  {{ studentStatusLabel(student.status) }}
                </span>
              </td>
              <td>
                <div class="row-actions">
                  <button class="btn ghost sm" @click="openStudent(student)">编辑</button>
                  <button class="btn ghost sm" @click="openEnroll(student)">调班</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="filteredStudents.length === 0" class="table-empty">
          没有匹配的学生；可先新增学生或调整筛选条件
        </div>
      </div>
    </div>

    <div v-else class="card">
      <div class="card-head">
        <h3>学生名单</h3>
        <span class="chip gray">只读</span>
        <div class="right">
          <button class="btn sm" @click="router.push('/students')">前往学生档案</button>
        </div>
      </div>
      <div class="hint" style="padding: 0 24px 20px">
        学生新增、改名与调班需要管理员权限；其他角色可在「学生档案」中查看本班名单。
      </div>
    </div>
  </template>

  <Teleport to="body">
    <div v-if="dialog" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <div class="modal-head">
          <h3>{{ dialogTitle }}</h3>
          <span class="chip gray">{{ dialogTag }}</span>
        </div>
        <div class="modal-body">
          <div v-if="dialogError" class="error-panel" style="margin-bottom: 12px">
            {{ dialogError }}
          </div>

          <div v-if="dialog === 'term'" class="form-grid two">
            <div class="field">
              <label>学年</label>
              <input v-model.trim="form.schoolYear" class="input" placeholder="如 2026-2027" />
            </div>
            <div class="field">
              <label>学期序号</label>
              <AppSelect v-model="form.termNo" :options="termNoOptions" :min-menu-width="140" />
            </div>
            <div class="field" style="grid-column: 1 / -1">
              <label>学期名称</label>
              <input v-model.trim="form.name" class="input" placeholder="如 2026-2027 学年第一学期" />
            </div>
            <div class="field">
              <label>开始日期</label>
              <input v-model="form.startDate" type="date" class="input" />
            </div>
            <div class="field">
              <label>结束日期</label>
              <input v-model="form.endDate" type="date" class="input" />
            </div>
            <label class="checkbox-row" style="grid-column: 1 / -1">
              <input v-model="form.isCurrent" type="checkbox" />
              设为当前学期（同一时间只保留一个当前学期）
            </label>
          </div>

          <div v-if="dialog === 'grade'" class="form-grid two">
            <div class="field">
              <label>所属学期</label>
              <AppSelect v-model="form.termId" :options="termSelectOptions" :min-menu-width="240" />
            </div>
            <div class="field">
              <label>年级</label>
              <AppSelect v-model="form.level" :options="gradeLevelOptions" :min-menu-width="140" />
            </div>
            <div class="field">
              <label>年级名称</label>
              <input v-model.trim="form.name" class="input" placeholder="如 初二" />
            </div>
            <div class="field">
              <label>入学届</label>
              <input v-model.number="form.entryYear" type="number" class="input" />
            </div>
          </div>

          <div v-if="dialog === 'class'" class="form-grid two">
            <div class="field">
              <label>所属年级</label>
              <AppSelect v-model="form.gradeId" :options="gradeSelectOptions" :min-menu-width="240" />
            </div>
            <div class="field">
              <label>班级名称</label>
              <input v-model.trim="form.name" class="input" placeholder="如 初二（1）班" />
            </div>
            <div class="field">
              <label>班级组</label>
              <input v-model.trim="form.classGroupName" class="input" placeholder="如 2025级1班" />
              <span class="hint">用于跨学期趋势串联，同一年级同一班级组应保持一致</span>
            </div>
            <div class="field">
              <label>班主任</label>
              <AppSelect
                v-model="form.headTeacherId"
                :options="headTeacherOptions"
                searchable
                :min-menu-width="200"
              />
            </div>
            <div class="field">
              <label>排序</label>
              <input v-model.number="form.sortOrder" type="number" min="0" class="input" />
            </div>
          </div>

          <div v-if="dialog === 'subject'" class="form-grid two">
            <div class="field">
              <label>科目名称</label>
              <input v-model.trim="form.name" class="input" placeholder="如 道德与法治" />
            </div>
            <div class="field">
              <label>科目代码</label>
              <input v-model.trim="form.code" class="input" placeholder="如 politics" />
            </div>
            <div class="field">
              <label>类别</label>
              <AppSelect v-model="form.category" :options="categoryOptions" :min-menu-width="150" />
            </div>
            <div class="field">
              <label>默认满分</label>
              <input v-model.number="form.defaultFullScore" type="number" min="1" class="input" />
            </div>
            <div class="field">
              <label>排序</label>
              <input v-model.number="form.sortOrder" type="number" min="0" class="input" />
            </div>
            <label class="checkbox-row" style="align-self: end">
              <input v-model="form.isActive" type="checkbox" />
              启用该科目
            </label>
          </div>

          <div v-if="dialog === 'student' || dialog === 'enroll'" class="form-grid two">
            <div class="field">
              <label>学号</label>
              <input
                v-model.trim="form.studentNo"
                class="input"
                :disabled="dialog === 'enroll'"
                placeholder="如 20250001"
              />
            </div>
            <div class="field">
              <label>姓名</label>
              <input
                v-model.trim="form.name"
                class="input"
                :disabled="dialog === 'enroll'"
                placeholder="如 陈雨桐"
              />
            </div>
            <div class="field">
              <label>{{ dialog === 'enroll' ? '调入班级' : '所属班级' }}</label>
              <AppSelect
                v-model="form.classId"
                :options="classSelectOptions"
                searchable
                :min-menu-width="220"
              />
            </div>
            <div v-if="dialog === 'student'" class="field">
              <label>学籍状态</label>
              <AppSelect v-model="form.status" :options="studentStatusOptions" :min-menu-width="150" />
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn ghost" :disabled="saving" @click="closeDialog">取消</button>
          <button class="btn primary" :disabled="saving" @click="submitDialog">
            {{ saving ? '正在保存…' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type {
  AdminClassRow,
  AdminGradeRow,
  AdminStudentRow,
  AdminSubjectRow,
  AdminTermRow,
  TeacherOption,
} from '@scorelens/shared'
import AppIcon from '../components/AppIcon.vue'
import AppSelect from '../components/AppSelect.vue'
import { api } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useContextStore } from '../stores/context'

type DialogKind = 'term' | 'grade' | 'class' | 'subject' | 'student' | 'enroll' | null

const auth = useAuthStore()
const context = useContextStore()
const router = useRouter()

const isAdmin = computed(() => Boolean(auth.user?.roles.includes('admin')))
const loading = ref(false)
const error = ref('')

const terms = ref<AdminTermRow[]>([])
const grades = ref<AdminGradeRow[]>([])
const classes = ref<AdminClassRow[]>([])
const subjects = ref<AdminSubjectRow[]>([])
const teachers = ref<TeacherOption[]>([])
const students = ref<AdminStudentRow[]>([])
const studentClassFilter = ref('')
const studentSearch = ref('')

const dialog = ref<DialogKind>(null)
const editingId = ref<string | null>(null)
const saving = ref(false)
const dialogError = ref('')
const form = reactive<Record<string, any>>({})

const termRows = computed<AdminTermRow[]>(() =>
  isAdmin.value
    ? terms.value
    : context.terms.map((term) => ({
        ...term,
        startDate: null,
        endDate: null,
      })),
)

const subjectRows = computed<AdminSubjectRow[]>(() =>
  isAdmin.value
    ? subjects.value
    : context.subjects.map((subject) => ({ ...subject, isActive: true })),
)

const classRows = computed<AdminClassRow[]>(() =>
  isAdmin.value
    ? classes.value
    : context.classes.map((klass) => ({ ...klass, headTeacherId: null })),
)

const gradeRows = computed(() => grades.value)

const filteredStudents = computed(() => {
  const keyword = studentSearch.value.toLowerCase()
  if (!keyword) return students.value
  return students.value.filter(
    (student) =>
      student.name.toLowerCase().includes(keyword) ||
      student.studentNo.toLowerCase().includes(keyword),
  )
})

const termSelectOptions = computed(() =>
  termRows.value.map((term) => ({ value: term.id, label: term.name, hint: term.schoolYear })),
)
const gradeSelectOptions = computed(() =>
  gradeRows.value.map((grade) => ({
    value: grade.id,
    label: grade.name,
    hint: `${grade.termName} · ${grade.classCount} 个班`,
  })),
)
const classSelectOptions = computed(() =>
  classRows.value.map((klass) => ({
    value: klass.id,
    label: klass.name,
    hint: `${klass.gradeName} · ${klass.studentCount} 人`,
  })),
)
const studentClassOptions = computed(() => [
  { value: '', label: '全部班级' },
  ...classRows.value.map((klass) => ({ value: klass.id, label: klass.name })),
])
const headTeacherOptions = computed(() => [
  { value: '', label: '暂不指定' },
  ...teachers.value
    .filter((teacher) => teacher.roles.includes('head_teacher') || teacher.roles.includes('admin'))
    .map((teacher) => ({
      value: teacher.id,
      label: teacher.displayName,
      hint: teacher.username,
    })),
])
const termNoOptions = [
  { value: '1', label: '第一学期' },
  { value: '2', label: '第二学期' },
]
const gradeLevelOptions = [
  { value: '7', label: '初一（七年级）' },
  { value: '8', label: '初二（八年级）' },
  { value: '9', label: '初三（九年级）' },
]
const categoryOptions = [
  { value: 'cultural', label: '文化科目' },
  { value: 'other', label: '其他科目' },
]
const studentStatusOptions = [
  { value: 'active', label: '在读' },
  { value: 'graduated', label: '已毕业' },
  { value: 'left', label: '已离校' },
]

const dialogTitle = computed(() => {
  const map: Record<string, string> = {
    term: editingId.value ? '编辑学期' : '新增学期',
    grade: editingId.value ? '编辑年级' : '新增年级',
    class: editingId.value ? '编辑班级' : '新增班级',
    subject: editingId.value ? '编辑科目' : '新增科目',
    student: editingId.value ? '编辑学生' : '新增学生',
    enroll: '学生调班',
  }
  return dialog.value ? map[dialog.value] : ''
})

const dialogTag = computed(() => {
  if (!isAdmin.value) return '只读'
  if (dialog.value === 'enroll') return '当前学期生效'
  return editingId.value ? '修改后立即生效' : '新增'
})

onMounted(async () => {
  if (!context.loaded) await context.load()
  if (!isAdmin.value) {
    await loadGradesOnly()
    return
  }
  await loadAll()
})

async function loadGradesOnly() {
  try {
    const list = await api.getGrades()
    grades.value = list.map((grade) => ({
      id: grade.id,
      termId: '',
      termName: '',
      entryYear: grade.entryYear,
      level: grade.level,
      name: grade.name,
      classCount: 0,
    }))
  } catch {
    grades.value = []
  }
}

async function loadAll() {
  loading.value = true
  error.value = ''
  try {
    const [termList, gradeList, classList, subjectList, teacherList] = await Promise.all([
      api.getAdminTerms(),
      api.getAdminGrades(),
      api.getAdminClasses(),
      api.getAdminSubjects(),
      api.getAdminTeachers(),
    ])
    terms.value = termList
    grades.value = gradeList
    classes.value = classList
    subjects.value = subjectList
    teachers.value = teacherList
    await loadStudents()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载基础数据失败'
  } finally {
    loading.value = false
  }
}

async function loadStudents() {
  if (!isAdmin.value) return
  try {
    students.value = await api.getAdminStudents(studentClassFilter.value || undefined)
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载学生名单失败'
  }
}

async function refreshAll() {
  await Promise.all([loadAll(), context.load(true)])
}

function resetForm() {
  for (const key of Object.keys(form)) delete form[key]
  dialogError.value = ''
}

function openTerm(term?: AdminTermRow) {
  resetForm()
  editingId.value = term?.id ?? null
  Object.assign(form, {
    schoolYear: term?.schoolYear ?? currentSchoolYear(),
    termNo: String(term?.termNo ?? 1),
    name: term?.name ?? '',
    startDate: term?.startDate ?? '',
    endDate: term?.endDate ?? '',
    isCurrent: term?.isCurrent ?? false,
  })
  dialog.value = 'term'
}

function openGrade(grade?: AdminGradeRow) {
  resetForm()
  editingId.value = grade?.id ?? null
  Object.assign(form, {
    termId: grade?.termId ?? termRows.value[0]?.id ?? '',
    level: String(grade?.level ?? 7),
    name: grade?.name ?? '初一',
    entryYear: grade?.entryYear ?? new Date().getFullYear(),
  })
  dialog.value = 'grade'
}

function openClass(klass?: AdminClassRow) {
  resetForm()
  editingId.value = klass?.id ?? null
  Object.assign(form, {
    gradeId: klass?.gradeId ?? gradeRows.value[0]?.id ?? '',
    name: klass?.name ?? '',
    classGroupName: klass?.classGroupName ?? '',
    headTeacherId: klass?.headTeacherId ?? '',
    sortOrder: klass ? classRows.value.findIndex((item) => item.id === klass.id) + 1 : 1,
  })
  dialog.value = 'class'
}

function openSubject(subject?: AdminSubjectRow) {
  resetForm()
  editingId.value = subject?.id ?? null
  Object.assign(form, {
    code: subject?.code ?? '',
    name: subject?.name ?? '',
    category: subject?.category ?? 'cultural',
    defaultFullScore: subject?.defaultFullScore ?? 100,
    sortOrder: subject?.sortOrder ?? subjectRows.value.length + 1,
    isActive: subject?.isActive ?? true,
  })
  dialog.value = 'subject'
}

function openStudent(student?: AdminStudentRow) {
  resetForm()
  editingId.value = student?.id ?? null
  Object.assign(form, {
    studentNo: student?.studentNo ?? '',
    name: student?.name ?? '',
    classId: student?.classId || studentClassFilter.value || classRows.value[0]?.id || '',
    status: student?.status ?? 'active',
  })
  dialog.value = 'student'
}

function openEnroll(student: AdminStudentRow) {
  resetForm()
  editingId.value = student.id
  Object.assign(form, {
    studentNo: student.studentNo,
    name: student.name,
    classId: student.classId || classRows.value[0]?.id || '',
  })
  dialog.value = 'enroll'
}

function closeDialog() {
  if (saving.value) return
  dialog.value = null
  editingId.value = null
}

async function submitDialog() {
  if (!dialog.value || saving.value) return
  saving.value = true
  dialogError.value = ''
  try {
    if (dialog.value === 'term') {
      const payload = {
        schoolYear: form.schoolYear,
        termNo: Number(form.termNo),
        name: form.name,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        isCurrent: Boolean(form.isCurrent),
      }
      if (editingId.value) await api.updateTerm(editingId.value, payload)
      else await api.createTerm(payload)
    } else if (dialog.value === 'grade') {
      const payload = {
        termId: form.termId,
        level: Number(form.level),
        name: form.name,
        entryYear: Number(form.entryYear),
      }
      if (editingId.value) await api.updateGrade(editingId.value, payload)
      else await api.createGrade(payload)
    } else if (dialog.value === 'class') {
      const payload = {
        gradeId: form.gradeId,
        name: form.name,
        classGroupName: form.classGroupName,
        headTeacherId: form.headTeacherId || null,
        sortOrder: Number(form.sortOrder) || 0,
      }
      if (editingId.value) await api.updateClass(editingId.value, payload)
      else await api.createClass(payload)
    } else if (dialog.value === 'subject') {
      const payload = {
        code: form.code,
        name: form.name,
        category: form.category,
        defaultFullScore: form.defaultFullScore === '' ? null : Number(form.defaultFullScore),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: Boolean(form.isActive),
      }
      if (editingId.value) await api.updateSubject(editingId.value, payload)
      else await api.createSubject(payload)
    } else if (dialog.value === 'student') {
      if (editingId.value) {
        await api.updateStudent(editingId.value, {
          studentNo: form.studentNo,
          name: form.name,
          status: form.status,
        })
        await api.enrollStudent(editingId.value, { classId: form.classId })
      } else {
        await api.createStudent({
          studentNo: form.studentNo,
          name: form.name,
          classId: form.classId,
          status: form.status,
        })
      }
    } else if (dialog.value === 'enroll' && editingId.value) {
      await api.enrollStudent(editingId.value, { classId: form.classId })
    }

    dialog.value = null
    editingId.value = null
    await refreshAll()
  } catch (err) {
    dialogError.value = err instanceof Error ? err.message : '保存失败'
  } finally {
    saving.value = false
  }
}

async function setCurrentTerm(term: AdminTermRow) {
  try {
    await api.updateTerm(term.id, { isCurrent: true })
    await refreshAll()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '设置当前学期失败'
  }
}

function currentSchoolYear() {
  const now = new Date()
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${year + 1}`
}

function dateRange(start: string | null, end: string | null) {
  if (!start && !end) return '—'
  return `${start ?? '—'} ~ ${end ?? '—'}`
}

function levelLabel(level: number) {
  if (level === 7) return '初一'
  if (level === 8) return '初二'
  if (level === 9) return '初三'
  return `${level} 年级`
}

function studentStatusLabel(status: AdminStudentRow['status']) {
  if (status === 'graduated') return '已毕业'
  if (status === 'left') return '已离校'
  return '在读'
}
</script>
