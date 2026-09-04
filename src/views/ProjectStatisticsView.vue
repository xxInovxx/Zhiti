<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonContent, IonPage, onIonViewWillEnter } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import QuestionBlock from '@/components/QuestionBlock.vue'
import { useActiveHardwareBack } from '@/composables/useActiveHardwareBack'
import type { AnswerMode } from '@/domain/models'
import {
  buildQuestionStatisticsRows,
  defaultStatisticsSortDirection,
  sortQuestionStatisticsRows,
  type QuestionStatisticsRow,
  type StatisticsSortDirection,
  type StatisticsSortKey,
} from '@/modules/statistics/questionStatistics'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const route = useRoute()
const router = useRouter()
const projectId = route.params.id as string
const project = computed(() => store.data.projects.find((item) => item.id === projectId))
type StatisticsAnswerMode = Exclude<AnswerMode, 'NONE'>
const validModes: StatisticsAnswerMode[] = ['SINGLE', 'MULTIPLE', 'JUDGE', 'FILL']
function routeAnswerMode(): StatisticsAnswerMode | null {
  const mode = String(route.query.mode ?? '') as StatisticsAnswerMode
  return validModes.includes(mode) ? mode : null
}
const selectedMode = ref<StatisticsAnswerMode | null>(routeAnswerMode())
const projectQuestions = computed(() => store.getProjectQuestions(projectId))
const visibleQuestions = computed(() => selectedMode.value
  ? projectQuestions.value.filter((question) => question.answerMode === selectedMode.value)
  : projectQuestions.value)
const stats = computed(() => store.calculateStats(visibleQuestions.value.filter((question) => question.answerMode !== 'NONE')))
const sortKey = ref<StatisticsSortKey>('INITIAL')
const direction = ref<StatisticsSortDirection>('ASC')
const selectedRow = ref<QuestionStatisticsRow | null>(null)
const message = ref('')

const sourceNames = computed(() => new Map(store.data.sources.map((source) => [source.id, source.name])))
const rows = computed(() => {
  const result = buildQuestionStatisticsRows(projectQuestions.value, store.learningMap)
    .filter((row) => !selectedMode.value || row.question.answerMode === selectedMode.value)
  return sortQuestionStatisticsRows(result, sortKey.value, direction.value)
})
const selectedLearning = computed(() => selectedRow.value ? store.learningMap.get(selectedRow.value.question.id) : undefined)
const selectedContext = computed(() => {
  const parentId = selectedRow.value?.question.parentId
  return parentId ? store.questionMap.get(parentId) ?? null : null
})

onIonViewWillEnter(() => {
  selectedMode.value = routeAnswerMode()
})
useActiveHardwareBack(handleBack)

async function handleBack(): Promise<void> {
  if (selectedRow.value) {
    selectedRow.value = null
    return
  }
  await router.back()
}

function changeSortKey(event: Event): void {
  const nextKey = (event.target as HTMLSelectElement).value as StatisticsSortKey
  sortKey.value = nextKey
  direction.value = defaultStatisticsSortDirection(nextKey)
}

function typeLabel(answerMode: string): string {
  if (answerMode === 'MULTIPLE') return '多选题'
  if (answerMode === 'JUDGE') return '判断题'
  if (answerMode === 'FILL') return '填空题'
  return '单选题'
}

const pageTitle = computed(() => {
  if (!project.value) return '项目不存在'
  return selectedMode.value
    ? `${project.value.name} · ${typeLabel(selectedMode.value)}明细`
    : `${project.value.name} · 学习明细`
})

async function saveSelectedNote(note: string): Promise<void> {
  if (!selectedRow.value) return
  try {
    await store.saveQuestionNote(selectedRow.value.question.id, note)
  } catch (error) { flash(`备注保存失败：${(error as Error).message}`) }
}

async function correctSelectedAnswer(answer: string): Promise<void> {
  if (!selectedRow.value) return
  try {
    await store.correctAnswer(selectedRow.value.question.id, answer)
    flash('答案已修正')
  } catch (error) {
    flash(`答案修正失败：${(error as Error).message}`)
  }
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 1800)
}
</script>

<template>
  <IonPage>
    <AppHeader :title="pageTitle" subtitle="每道题的累计学习统计（跨项目共享）" back custom-back @back="handleBack" />
    <IonContent :fullscreen="false">
      <main v-if="project" class="page-content no-nav">
        <section class="stats-grid detail-summary">
          <div class="stat-card"><strong>{{ stats.total }}</strong><span>题目总数</span></div>
          <div class="stat-card"><strong>{{ stats.attempts }}</strong><span>累计做题</span></div>
          <div class="stat-card"><strong>{{ Math.round(stats.correctRate * 100) }}%</strong><span>总正确率</span></div>
        </section>

        <div class="section-heading"><h2>题目统计</h2><span>共 {{ rows.length }} 道</span></div>
        <section class="card sort-toolbar">
          <label class="field sort-field">
            <span>排序方式</span>
            <select :value="sortKey" @change="changeSortKey">
              <option value="INITIAL">初始顺序</option>
              <option value="ATTEMPTS">做过次数</option>
              <option value="WRONGS">错误次数</option>
              <option value="ACCURACY">总正确率</option>
            </select>
          </label>
          <button class="secondary-button direction-button" @click="direction = direction === 'ASC' ? 'DESC' : 'ASC'">
            {{ direction === 'ASC' ? '↑ 正序' : '↓ 倒序' }}
          </button>
        </section>

        <EmptyState
          v-if="!rows.length"
          icon="○"
          :title="selectedMode ? `项目中没有${typeLabel(selectedMode)}` : '项目中没有题目'"
          description="请先为项目添加包含对应题目的 XLSX 题库。"
        />
        <article
          v-for="row in rows"
          :key="row.question.id"
          class="card question-stat-card"
          role="button"
          tabindex="0"
          :aria-label="`查看第 ${row.initialOrder + 1} 题解析`"
          @click="selectedRow = row"
          @keydown.enter="selectedRow = row"
          @keydown.space.prevent="selectedRow = row"
        >
          <div class="question-stat-heading">
            <div class="meta-row">
              <span class="type-chip">{{ typeLabel(row.question.answerMode) }}</span>
              <span v-if="row.question.nodeType === 'CASE_ITEM'" class="chip warning">案例小题</span>
              <span class="question-number">原序号 {{ row.initialOrder + 1 }}</span>
            </div>
          </div>
          <h3>{{ row.question.stem }}</h3>
          <p class="question-source">{{ sourceNames.get(row.question.sourceFileId) }} · {{ row.question.sheetName }} · 第 {{ row.question.sourceRow }} 行</p>
          <div class="question-stat-values">
            <div><strong>{{ row.attemptCount }}</strong><span>做过次数</span></div>
            <div><strong>{{ row.wrongCount }}</strong><span>错误次数</span></div>
            <div><strong>{{ Math.round(row.correctRate * 100) }}%</strong><span>总正确率</span></div>
          </div>
          <span class="detail-link">查看解析 ›</span>
        </article>
      </main>
      <main v-else class="page-content no-nav">
        <EmptyState icon="?" title="项目不存在" description="该项目可能已经被删除。" />
      </main>

    </IonContent>

    <div v-if="selectedRow" class="detail-backdrop" @click.self="selectedRow = null">
      <section class="detail-modal" role="dialog" aria-modal="true" aria-label="题目解析">
        <div class="detail-modal-heading">
          <div><h2>题目解析</h2><p>原序号 {{ selectedRow.initialOrder + 1 }}</p></div>
          <button class="icon-button" aria-label="关闭解析" @click="selectedRow = null">×</button>
        </div>
        <div v-if="selectedContext" class="case-context">
          <span>案例材料</span>{{ selectedContext.stem }}
        </div>
        <QuestionBlock
          :question="selectedRow.question"
          :model-value="selectedLearning?.lastAnswer || ''"
          :learning="selectedLearning"
          :show-favorite="true"
          reveal
          disabled
          @favorite="store.toggleFavorite(selectedRow.question.id)"
          @correct-answer="correctSelectedAnswer"
          @save-note="saveSelectedNote"
        />
        <button class="primary-button wide-button" @click="selectedRow = null">关闭</button>
      </section>
    </div>
    <div v-if="message" class="toast">{{ message }}</div>
  </IonPage>
</template>

<style scoped>
.detail-summary { grid-template-columns: repeat(3, 1fr); }
.sort-toolbar { display: flex; align-items: end; gap: 12px; margin-bottom: 14px; }
.sort-field { flex: 1; margin: 0; }
.sort-field select { width: 100%; height: 44px; border: 1px solid var(--line); border-radius: 12px; padding: 0 38px 0 13px; color: var(--ink); background: var(--field-bg); }
.direction-button { flex: 0 0 92px; }
.question-stat-card { position: relative; cursor: pointer; outline: none; }
.question-stat-card:focus-visible { box-shadow: 0 0 0 3px var(--primary-soft), var(--shadow); }
.question-stat-card h3 { margin-top: 13px; white-space: pre-wrap; line-height: 1.65; }
.question-stat-heading, .question-stat-heading .meta-row { margin: 0; }
.question-number { align-self: center; color: var(--muted); font-size: 11px; }
.question-source { overflow-wrap: anywhere; }
.question-stat-values { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 15px; padding-top: 14px; border-top: 1px solid var(--line); }
.question-stat-values div { min-width: 0; text-align: center; }
.question-stat-values strong { display: block; color: var(--primary); font: 21px Georgia, serif; }
.question-stat-values span { color: var(--muted); font-size: 11px; }
.detail-link { display: block; margin-top: 12px; color: var(--primary); text-align: right; font-size: 12px; font-weight: 800; }
.detail-backdrop { position: fixed; z-index: 100; inset: 0; padding: calc(18px + env(safe-area-inset-top, 0px)) 18px calc(18px + var(--safe-bottom)); display: grid; place-items: center; background: var(--overlay); }
.detail-modal { width: min(100%, 620px); max-height: 88vh; overflow: auto; padding: 18px; border-radius: 22px; background: var(--app-bg); box-shadow: 0 18px 50px rgba(16, 30, 24, .22); }
.detail-modal-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.detail-modal-heading h2 { margin: 0; font-size: 20px; }
.detail-modal-heading p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
.detail-modal :deep(.question-block) { margin-bottom: 12px; }
@media (max-width: 420px) {
  .detail-summary .stat-card { padding: 12px 10px; }
  .detail-summary .stat-card strong { font-size: 22px; }
}
</style>
