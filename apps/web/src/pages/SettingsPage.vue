<template>
  <div class="grid-2-even">
    <div class="card">
      <div class="card-head"><h3>统计口径</h3></div>
      <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">及格线 / 优秀线</div>
          <div class="hint">单科满分 × 60% / 80%；各科满分在考试配置中设置</div>
        </div>
        <span class="chip blue right">60% / 80%</span>
      </div>
      <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">缺考口径</div>
          <div class="hint">单科统计剔除；总分排名剔除并标注</div>
        </div>
        <span class="chip amber right">已启用</span>
      </div>
      <div class="setting-row" style="padding: 14px 20px">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">名次规则</div>
          <div class="hint">同分同名次，下一名跳号；与上一场考试比较</div>
        </div>
        <span class="chip mint right">RANK</span>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>系统信息</h3><span class="chip gray">v0.4.0</span></div>
      <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">当前学期</div>
          <div class="hint">{{ context.currentTerm?.name ?? '未设置' }}</div>
        </div>
        <span class="chip blue right">{{ context.classes.length }} 个班</span>
      </div>
      <div class="setting-row" style="padding: 14px 20px; border-bottom: 1px solid #f1f5f9">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">AI 表头映射</div>
          <div class="hint">使用规则建议 + 人工确认；AI 接口在后续版本接入</div>
        </div>
        <span class="chip gray right">未启用</span>
      </div>
      <div class="setting-row" style="padding: 14px 20px">
        <div>
          <div style="font-size: 13.5px; font-weight: 600">部署基线</div>
          <div class="hint">Windows 本机开发 · 本地 SQLite · Ubuntu 24.04 可用 Docker Compose</div>
        </div>
        <span class="chip violet right">本地优先</span>
      </div>
    </div>
  </div>

  <div class="card mt-16">
    <div class="card-head"><h3>后续版本</h3><span class="chip gray">Roadmap</span></div>
    <div class="tag-list" style="padding-top: 14px">
      <span class="chip blue">AI 表头映射</span>
      <span class="chip blue">映射模板复用</span>
      <span class="chip amber">导入撤销（24h）</span>
      <span class="chip amber">成绩更正与审计</span>
      <span class="chip violet">汇总表与性能优化</span>
      <span class="chip mint">数据导入模板完善</span>
    </div>
    <div class="hint" style="padding: 0 24px 20px">
      当前 0.4.0 已覆盖：登录与角色范围、班级看板、年级对比、学生档案、手动映射导入、导入历史，以及本机 SQLite 单文件存储与备份。
    </div>
  </div>
</template>

<script setup lang="ts">
import { useContextStore } from '../stores/context'

const context = useContextStore()
</script>