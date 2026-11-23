<template>
  <div ref="element" class="chart-el" :style="{ height }" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, RadarChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
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

const element = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!element.value) return
  chart = echarts.init(element.value)
  chart.setOption(props.option)
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(element.value)
})

watch(
  () => props.option,
  (option) => {
    chart?.setOption(option, { notMerge: false })
  },
  { deep: true },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
})
</script>

<style scoped>
.chart-el {
  width: 100%;
}
</style>