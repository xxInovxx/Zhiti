<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import { useActiveHardwareBack } from '@/composables/useActiveHardwareBack'
import { formatDuration } from '@/domain/utils'
import { buildSessionReviewItems } from '@/modules/practice/sessionReview'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const route = useRoute()
const router = useRouter()
const sessionId = String(route.params.id ?? '')
const openedFromHistory = route.query.from === 'history'
const session = computed(() => store.data.sessions.find((item) => item.id === sessionId))
const units = computed(() => session.value ? store.getSessionUnits(session.value) : [])
const isExam = computed(() => session.value?.mode === 'EXAM')
const total = computed(() => (session.value?.correctCount ?? 0) + (session.value?.wrongCount ?? 0) + (session.value?.unansweredCount ?? 0))
const percent = computed(() => total.value ? Math.round((session.value?.correctCount ?? 0) / total.value * 100) : 0)
const returnTarget = computed(() => openedFromHistory
  ? '/history'
  : session.value?.projectId ? `/project/${session.value.projectId}` : '/library')
const isLeaving = ref(false)

const reviewItems = computed(() => session.value ? buildSessionReviewItems(session.value, units.value) : [])
type ReviewItem = (typeof reviewItems.value)[number]
type ExamType = 'SINGLE' | 'MULTIPLE' | 'JUDGE' | 'FILL' | 'CASE'

function reviewType(item: ReviewItem): ExamType {
  if (item.context?.nodeType === 'CASE') return 'CASE'
  if (item.question.answerMode === 'SINGLE') return 'SINGLE'
  if (item.question.answerMode === 'MULTIPLE') return 'MULTIPLE'
  if (item.question.answerMode === 'JUDGE') return 'JUDGE'
  return 'FILL'
}

const examTypeCounts = computed<Record<ExamType, number>>(() => {
  const counts: Record<ExamType, number> = { SINGLE: 0, MULTIPLE: 0, JUDGE: 0, FILL: 0, CASE: 0 }
  reviewItems.value.forEach((item) => { counts[reviewType(item)] += 1 })
  return counts
})

const usesRatioScoring = computed(() => {
  const config = session.value?.config
  return Boolean(config && [
    config.singleRatio, config.multipleRatio, config.judgeRatio, config.fillRatio, config.caseRatio,
  ].some((value) => value !== undefined))
})

function ratioForType(type: ExamType): number {
  const config = session.value?.config
  if (!config) return 1
  const ratio = type === 'CASE' ? config.caseRatio ?? config.caseScore
    : type === 'SINGLE' ? config.singleRatio ?? config.singleScore
      : type === 'MULTIPLE' ? config.multipleRatio ?? config.multipleScore
        : type === 'JUDGE' ? config.judgeRatio ?? config.judgeScore
          : config.fillRatio ?? config.fillScore
  return Math.max(0, Number(ratio ?? 1) || 0)
}

const examTotalRatio = computed(() => (Object.keys(examTypeCounts.value) as ExamType[])
  .reduce((totalRatio, type) => examTypeCounts.value[type] ? totalRatio + ratioForType(type) : totalRatio, 0))

function itemScore(item: ReviewItem): number {
  const config = session.value?.config
  if (!config) return 0
  if (!usesRatioScoring.value) {
    const score = reviewType(item) === 'CASE' ? config.caseScore
      : reviewType(item) === 'SINGLE' ? config.singleScore
        : reviewType(item) === 'MULTIPLE' ? config.multipleScore
          : reviewType(item) === 'JUDGE' ? config.judgeScore : config.fillScore
    return Math.max(0, Number(score ?? 1) || 0)
  }
  const type = reviewType(item)
  const count = examTypeCounts.value[type]
  return examTotalRatio.value > 0 && count > 0 ? ratioForType(type) / examTotalRatio.value * 100 / count : 0
}

const examScore = computed(() => reviewItems.value.reduce((sum, item) => sum + (item.correct ? itemScore(item) : 0), 0))
const examScoreLabel = computed(() => Number(examScore.value.toFixed(2)))
const groups = computed(() => [
  { key: 'SINGLE', label: '单选题', items: reviewItems.value.filter((item) => !item.context && item.question.answerMode === 'SINGLE') },
  { key: 'MULTIPLE', label: '多选题', items: reviewItems.value.filter((item) => !item.context && item.question.answerMode === 'MULTIPLE') },
  { key: 'JUDGE', label: '判断题', items: reviewItems.value.filter((item) => !item.context && item.question.answerMode === 'JUDGE') },
  { key: 'FILL', label: '填空题', items: reviewItems.value.filter((item) => !item.context && item.question.answerMode === 'FILL') },
  { key: 'CASE', label: '案例小题', items: reviewItems.value.filter((item) => Boolean(item.context)) },
].filter((group) => group.items.length).map((group) => {
  const correctCount = group.items.filter((item) => item.correct).length
  const durationMs = group.items.reduce((totalDuration, item) => totalDuration + item.durationMs, 0)
  const score = group.items.reduce((totalScore, item) => totalScore + (item.correct ? itemScore(item) : 0), 0)
  const maxScore = group.items.reduce((totalScore, item) => totalScore + itemScore(item), 0)
  return { ...group, correctCount, correctRate: Math.round(correctCount / group.items.length * 100), durationMs, score, maxScore }
}))
const wrongReviewItems = computed(() => reviewItems.value.filter((item) => !item.correct))

function formatScore(value: number): string {
  return Number(value.toFixed(2)).toString()
}

useActiveHardwareBack(leaveResult)

function reviewLocation(scope: 'ALL' | 'WRONG', index: number): string {
  const from = openedFromHistory ? '&from=history' : ''
  return `/result/${sessionId}/review?scope=${scope}&index=${index}${from}`
}

async function openReview(index: number): Promise<void> {
  await router.push(reviewLocation('ALL', index))
}

async function openWrongReviews(): Promise<void> {
  if (!wrongReviewItems.value.length) return
  await router.push(reviewLocation('WRONG', 0))
}

async function leaveResult(): Promise<void> {
  if (isLeaving.value) return
  isLeaving.value = true
  await router.back()
}

async function returnFromResult(): Promise<void> {
  isLeaving.value = true
  await router.replace(returnTarget.value)
}
</script>

<template>
  <IonPage>
    <AppHeader title="刷题综述" back custom-back @back="leaveResult" />
    <IonContent :fullscreen="true">
      <main v-if="session" class="page-content no-nav">
        <section class="card result-hero">
          <div class="score-ring"><strong>{{ isExam ? examScoreLabel : percent }}</strong></div>
          <h2>{{ percent >= 80 ? '完成得很漂亮' : percent >= 60 ? '正在稳步进步' : '把错题再练一遍吧' }}</h2>
          <p>正确 {{ session.correctCount }} · 错误 {{ session.wrongCount }} · 未答 {{ session.unansweredCount }}</p>
          <p>本次练习用时 {{ formatDuration(session.durationMs) }}</p>
          <div class="button-row">
            <button class="secondary-button" :disabled="!wrongReviewItems.length" @click="openWrongReviews">查看错题</button>
            <button class="primary-button" @click="returnFromResult">返回</button>
          </div>
        </section>

        <div class="section-heading"><h2>分题型综述</h2><span>点击题号查看解析</span></div>
        <section v-for="group in groups" :key="group.key" class="card result-group">
          <div class="result-group-heading">
            <h3>{{ group.label }}</h3>
            <span v-if="isExam">正确 {{ group.correctCount }} / {{ group.items.length }} · 正确率 {{ group.correctRate }}% · {{ formatScore(group.score) }}分 · 用时 {{ formatDuration(group.durationMs) }}</span>
            <span v-else>正确 {{ group.correctCount }} / {{ group.items.length }} · 正确率 {{ group.correctRate }}% · 用时 {{ formatDuration(group.durationMs) }}</span>
          </div>
          <div class="question-circles">
            <button
              v-for="item in group.items"
              :key="item.question.id"
              class="question-circle"
              :class="item.correct ? 'correct' : 'wrong'"
              :aria-label="`第 ${item.index + 1} 题，${item.correct ? '正确' : '错误'}`"
              @click="openReview(item.index)"
            >
              {{ item.index + 1 }}
            </button>
          </div>
        </section>
        <div class="result-legend"><span><i class="correct"></i>正确</span><span><i class="wrong"></i>错误或未答</span></div>
      </main>

      <div v-else-if="!isLeaving" class="empty-state"><h3>找不到练习结果</h3></div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.result-group-heading { display: flex; align-items: center; justify-content: space-between; }
.result-group-heading h3 { margin: 0; }
.result-group-heading span { color: var(--muted); font-size: 12px; }
.result-hero button:disabled { opacity: .5; }
.question-circles { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.question-circle { width: 43px; height: 43px; padding: 0; border: 0; border-radius: 50%; color: white; font-weight: 900; box-shadow: var(--shadow); }
.question-circle.correct, .result-legend i.correct { background: #35a66f; }
.question-circle.wrong, .result-legend i.wrong { background: var(--danger); }
.result-legend { display: flex; justify-content: center; gap: 20px; margin: 18px 0; color: var(--muted); font-size: 12px; }
.result-legend span { display: flex; align-items: center; gap: 6px; }
.result-legend i { width: 10px; height: 10px; border-radius: 50%; }
</style>
