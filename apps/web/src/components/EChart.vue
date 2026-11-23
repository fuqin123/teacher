<template>
  <div class="chart-el" :style="{ height }">
    <div v-if="!ready" class="chart-skeleton" aria-hidden="true">
      <div class="chart-skeleton-bars">
        <span
          v-for="(barHeight, index) in skeletonHeights"
          :key="index"
          :style="{ height: `${barHeight}%`, animationDelay: `${index * 80}ms` }"
        />
      </div>
    </div>
    <div ref="element" class="chart-canvas" :class="{ 'is-ready': ready }" />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, RadarChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'

echarts.use([
  BarChart,
  LineChart,
  RadarChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  CanvasRenderer,
])

const props = withDefaults(
  defineProps<{
    option: EChartsCoreOption
    height?: string
  }>(),
  { height: '320px' },
)

type EChartsInstance = ReturnType<typeof echarts.init>
type SeriesLike = Record<string, unknown> & { type?: string }

const element = ref<HTMLDivElement | null>(null)
const ready = ref(false)
const skeletonHeights = [40, 65, 52, 80, 62, 88, 70, 55]

let chart: EChartsInstance | null = null
let observer: ResizeObserver | null = null
let raf1 = 0
let raf2 = 0
let disposed = false
let lastWidth = 0
let lastHeight = 0

const ENTER_PRESETS: Record<
  string,
  { duration: number; easing: string; stagger: number }
> = {
  bar: { duration: 900, easing: 'quarticOut', stagger: 55 },
  line: { duration: 1200, easing: 'cubicInOut', stagger: 0 },
  radar: { duration: 1000, easing: 'cubicOut', stagger: 180 },
}

const DEFAULT_PRESET = { duration: 800, easing: 'cubicOut', stagger: 0 }
const UPDATE_DURATION = 650
const SERIES_OFFSET = 90

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function withContentAnimation(option: EChartsCoreOption): EChartsCoreOption {
  const reduced = prefersReducedMotion()
  const source = option as Record<string, unknown>
  const rawSeries = source.series
  const seriesArray = Array.isArray(rawSeries)
    ? rawSeries
    : rawSeries
      ? [rawSeries]
      : []

  const series = (seriesArray as SeriesLike[]).map((item, seriesIndex) => {
    if (reduced) return { ...item, animation: false }
    const preset = ENTER_PRESETS[item.type ?? ''] ?? DEFAULT_PRESET
    return {
      animation: true,
      animationDuration: preset.duration,
      animationEasing: preset.easing,
      animationDelay:
        preset.stagger > 0
          ? (dataIndex: number) =>
              dataIndex * preset.stagger + seriesIndex * SERIES_OFFSET
          : seriesIndex * SERIES_OFFSET,
      animationDurationUpdate: UPDATE_DURATION,
      animationEasingUpdate: 'cubicOut',
      ...item,
    }
  })

  return {
    animation: !reduced,
    animationThreshold: 3000,
    animationDuration: DEFAULT_PRESET.duration,
    animationEasing: 'cubicOut',
    animationDurationUpdate: UPDATE_DURATION,
    animationEasingUpdate: 'cubicInOut',
    ...source,
    ...(series.length ? { series } : {}),
  } as EChartsCoreOption
}

function initChart() {
  if (!element.value || disposed) return
  chart = echarts.init(element.value)
  chart.setOption(withContentAnimation(props.option), true)
  lastWidth = element.value.clientWidth
  lastHeight = element.value.clientHeight
  ready.value = true

  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (!rect) return
    if (
      Math.abs(rect.width - lastWidth) < 1 &&
      Math.abs(rect.height - lastHeight) < 1
    ) {
      return
    }
    lastWidth = rect.width
    lastHeight = rect.height
    chart?.resize()
  })
  observer.observe(element.value)
}

onMounted(() => {
  raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(initChart)
  })
})

watch(
  () => props.option,
  (option) => {
    if (!ready.value || !chart) return
    chart.setOption(withContentAnimation(option), { replaceMerge: ['series'] })
  },
  { deep: true },
)

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf1)
  cancelAnimationFrame(raf2)
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
})
</script>