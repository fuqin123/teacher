import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ClassOption, ExamOption, SubjectOption, TermOption } from '@scorelens/shared'
import { ApiError, api } from '../api/client'
import { useAuthStore } from './auth'

export const useContextStore = defineStore('context', () => {
  const auth = useAuthStore()
  const classes = ref<ClassOption[]>([])
  const exams = ref<ExamOption[]>([])
  const subjects = ref<SubjectOption[]>([])
  const terms = ref<TermOption[]>([])
  const selectedClassId = ref('')
  const selectedExamId = ref('')
  const selectedSubjectId = ref('')
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  const selectedClass = computed(
    () => classes.value.find((item) => item.id === selectedClassId.value) ?? null,
  )
  const selectedExam = computed(
    () => exams.value.find((item) => item.id === selectedExamId.value) ?? null,
  )
  const availableExams = computed(() => {
    if (!selectedClass.value) return exams.value
    return exams.value.filter((exam) => exam.gradeId === selectedClass.value?.gradeId)
  })
  const currentTerm = computed(
    () => terms.value.find((term) => term.isCurrent) ?? terms.value[0] ?? null,
  )

  watch(selectedClassId, () => {
    if (!selectedClass.value) return
    const examStillValid = availableExams.value.some(
      (exam) => exam.id === selectedExamId.value,
    )
    if (!examStillValid) {
      selectedExamId.value = availableExams.value[0]?.id ?? ''
    }
  })

  async function load(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return
    loading.value = true
    error.value = ''
    try {
      const [classList, examList, subjectList, termList] = await Promise.all([
        api.getClasses(),
        api.getExams(),
        api.getSubjects(),
        api.getTerms(),
      ])
      classes.value = classList
      exams.value = examList
      subjects.value = subjectList
      terms.value = termList

      if (!classes.value.some((item) => item.id === selectedClassId.value)) {
        selectedClassId.value = classes.value[0]?.id ?? ''
      }
      if (!subjects.value.some((item) => item.id === selectedSubjectId.value)) {
        selectedSubjectId.value = subjects.value[0]?.id ?? ''
      }
      const examStillValid = availableExams.value.some(
        (exam) => exam.id === selectedExamId.value,
      )
      if (!examStillValid) {
        selectedExamId.value = availableExams.value[0]?.id ?? ''
      }
      loaded.value = true
    } catch (err) {
      // 401 由全局处理器跳转登录页，这里不再渲染“请先登录”
      if (err instanceof ApiError && err.status === 401) return
      error.value = err instanceof Error ? err.message : '加载基础数据失败'
    } finally {
      loading.value = false
    }
  }

  async function refreshExams(preferredExamId?: string) {
    exams.value = await api.getExams()
    if (preferredExamId) {
      selectedExamId.value = preferredExamId
    }
  }

  return {
    classes,
    exams,
    subjects,
    terms,
    selectedClassId,
    selectedExamId,
    selectedSubjectId,
    loading,
    loaded,
    error,
    selectedClass,
    selectedExam,
    availableExams,
    currentTerm,
    isSubjectViewer: computed(() => auth.isSubjectViewer),
    load,
    refreshExams,
  }
})