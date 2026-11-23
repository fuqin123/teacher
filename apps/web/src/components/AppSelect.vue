<template>
  <div ref="rootRef" class="app-select" :class="[`variant-${variant}`, `size-${size}`]">
    <button
      ref="triggerRef"
      type="button"
      class="app-select-trigger"
      :class="{ 'is-open': open, 'is-disabled': disabled }"
      :disabled="disabled"
      role="combobox"
      :aria-expanded="open"
      :aria-controls="panelId"
      aria-haspopup="listbox"
      @click="toggle"
      @keydown.down.prevent="openMenu"
      @keydown.up.prevent="openMenu"
      @keydown.enter.prevent="toggle"
      @keydown.esc="close"
    >
      <span class="app-select-value" :class="{ 'is-placeholder': !selected }">
        {{ selected?.label ?? placeholder }}
      </span>
      <AppIcon name="chevronDown" class="app-select-chevron" />
    </button>

    <Teleport to="body">
      <Transition name="select-pop">
        <div
          v-if="open"
          :id="panelId"
          ref="panelRef"
          class="app-select-panel"
          :class="{ 'placement-top': placement === 'top' }"
          :style="panelStyle"
          role="listbox"
          tabindex="-1"
          @keydown.down.prevent="moveActive(1)"
          @keydown.up.prevent="moveActive(-1)"
          @keydown.enter.prevent="selectActive"
          @keydown.esc.prevent="close"
        >
          <div v-if="searchable" class="app-select-search">
            <AppIcon name="search" class="app-select-search-icon" />
            <input
              ref="searchRef"
              v-model="query"
              class="app-select-search-input"
              :placeholder="searchPlaceholder"
              autocomplete="off"
              @keydown.down.prevent="moveActive(1)"
              @keydown.up.prevent="moveActive(-1)"
              @keydown.enter.prevent="selectActive"
              @keydown.esc.prevent="close"
            />
          </div>

          <div class="app-select-options">
            <button
              v-for="(option, index) in filteredOptions"
              :key="option.value || '__empty__'"
              type="button"
              class="app-select-option"
              :class="{
                'is-selected': option.value === modelValue,
                'is-active': index === activeIndex,
                'is-disabled': option.disabled,
              }"
              :disabled="option.disabled"
              role="option"
              :aria-selected="option.value === modelValue"
              @mouseenter="activeIndex = index"
              @click="selectOption(option)"
            >
              <span class="app-select-check">
                <AppIcon v-if="option.value === modelValue" name="check" />
              </span>
              <span class="app-select-option-label">{{ option.label }}</span>
              <span v-if="option.hint" class="app-select-hint">{{ option.hint }}</span>
            </button>
            <div v-if="filteredOptions.length === 0" class="app-select-empty">
              {{ emptyText }}
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import AppIcon from './AppIcon.vue'

export interface AppSelectOption {
  value: string
  label: string
  hint?: string
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: AppSelectOption[]
    placeholder?: string
    searchable?: boolean
    disabled?: boolean
    size?: 'sm' | 'md'
    variant?: 'default' | 'ghost'
    searchPlaceholder?: string
    emptyText?: string
    minMenuWidth?: number
    align?: 'start' | 'end'
  }>(),
  {
    placeholder: '请选择',
    searchable: false,
    disabled: false,
    size: 'md',
    variant: 'default',
    searchPlaceholder: '输入关键字搜索…',
    emptyText: '没有匹配项',
    minMenuWidth: 200,
    align: 'start',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const rootRef = ref<HTMLDivElement | null>(null)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLDivElement | null>(null)
const searchRef = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = ref('')
const activeIndex = ref(-1)
const placement = ref<'top' | 'bottom'>('bottom')
const panelStyle = ref<CSSProperties>({})
const panelId = `app-select-${Math.random().toString(36).slice(2, 9)}`

const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
)

const filteredOptions = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!props.searchable || !keyword) return props.options
  return props.options.filter((option) =>
    `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(keyword),
  )
})

function toggle() {
  if (props.disabled) return
  if (open.value) close()
  else openMenu()
}

function openMenu() {
  if (props.disabled || open.value) return
  query.value = ''
  open.value = true
  placement.value = 'bottom'
  const selectedIndex = props.options.findIndex(
    (option) => option.value === props.modelValue && !option.disabled,
  )
  activeIndex.value = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex()
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', onScroll, true)
  void nextTick(() => {
    updatePosition()
    if (props.searchable) searchRef.value?.focus()
    else panelRef.value?.focus()
    scrollActiveIntoView()
  })
}

function close() {
  if (!open.value) return
  open.value = false
  query.value = ''
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', onScroll, true)
  triggerRef.value?.focus()
}

function updatePosition() {
  const trigger = triggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const viewportGap = 8
  const spaceBelow = window.innerHeight - rect.bottom - viewportGap
  const spaceAbove = rect.top - viewportGap
  const openTop = spaceBelow < 180 && spaceAbove > spaceBelow
  const width = Math.min(
    Math.max(rect.width, props.minMenuWidth),
    window.innerWidth - viewportGap * 2,
  )

  let left = props.align === 'end' ? rect.right - width : rect.left
  left = Math.max(viewportGap, Math.min(left, window.innerWidth - width - viewportGap))

  placement.value = openTop ? 'top' : 'bottom'
  panelStyle.value = openTop
    ? {
        left: `${left}px`,
        bottom: `${window.innerHeight - rect.top + 6}px`,
        width: `${width}px`,
        maxHeight: `${Math.max(140, Math.min(340, spaceAbove - 6))}px`,
      }
    : {
        left: `${left}px`,
        top: `${rect.bottom + 6}px`,
        width: `${width}px`,
        maxHeight: `${Math.max(140, Math.min(340, spaceBelow - 6))}px`,
      }
}

function onScroll(event: Event) {
  const target = event.target as Node | null
  if (target && panelRef.value?.contains(target)) return
  updatePosition()
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (rootRef.value?.contains(target) || panelRef.value?.contains(target)) return
  close()
}

function firstEnabledIndex() {
  return props.options.findIndex((option) => !option.disabled)
}

function moveActive(delta: number) {
  if (filteredOptions.value.length === 0) return
  let index = activeIndex.value
  for (let step = 0; step < filteredOptions.value.length; step += 1) {
    index = (index + delta + filteredOptions.value.length) % filteredOptions.value.length
    if (!filteredOptions.value[index]?.disabled) {
      activeIndex.value = index
      scrollActiveIntoView()
      return
    }
  }
}

function scrollActiveIntoView() {
  void nextTick(() => {
    const active = panelRef.value?.querySelector<HTMLElement>('.app-select-option.is-active')
    active?.scrollIntoView({ block: 'nearest' })
  })
}

function selectActive() {
  const option = filteredOptions.value[activeIndex.value]
  if (option) selectOption(option)
}

function selectOption(option: AppSelectOption) {
  if (option.disabled) return
  emit('update:modelValue', option.value)
  close()
}

watch(query, () => {
  activeIndex.value = filteredOptions.value.length > 0 ? 0 : -1
  scrollActiveIntoView()
})

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close()
  },
)

watch(
  () => props.modelValue,
  () => {
    if (!open.value) return
    const index = filteredOptions.value.findIndex(
      (option) => option.value === props.modelValue,
    )
    if (index >= 0) activeIndex.value = index
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', onScroll, true)
})
</script>