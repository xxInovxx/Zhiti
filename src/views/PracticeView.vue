<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { IonContent, IonPage, onIonViewDidEnter } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import QuestionBlock from '@/components/QuestionBlock.vue'
import { useActiveHardwareBack } from '@/composables/useActiveHardwareBack'
import { copyText, formatQuestionsForClipboard } from '@/domain/clipboard'
import type { PracticeUnit } from '@/domain/models'
import { formatDuration } from '@/domain/utils'
import {
  cycleSessionProgressNumber, isCycleSessionComplete, isGroupReviewSession, shouldCompleteGroupReviewOnLeave,
  shouldShowSingleQuestionResultOnLeave,
} from '@/modules/practice/practiceEngine'
import { allocateQuestionDuration, shouldTrackCurrentUnit } from '@/modules/practice/practiceTiming'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const route = useRoute()
const router = useRouter()
const sessionId = String(route.params.id ?? '')
const session = computed(() => store.data.sessions.find((item) => item.id === sessionId))
const units = computed(() => session.value ? store.getSessionUnits(session.value) : [])
const leavingUnit = ref<PracticeUnit | null>(null)
const unit = computed(() => leavingUnit.value ?? units.value[session.value?.currentIndex ?? 0])
const isExam = computed(() => session.value?.mode === 'EXAM')
const isCycleMode = computed(() => ['ORDERED', 'RANDOM_CYCLE'].includes(session.value?.mode ?? ''))
const isSingleQuestion = computed(() => session.value?.entryKind === 'SINGLE_QUESTION')
const practiceTitle = computed(() => {
  if (isExam.value) return '限时组卷'
  if (session.value?.mode === 'RANDOM_CYCLE') return '随机刷题'
  if (session.value?.mode === 'ORDERED') return '顺序刷题'
  return isSingleQuestion.value ? '单题练习' : '专项重练'
})
const reveal = ref(false)
const remainingMs = ref(0)
const nowMs = ref(Date.now())
const busy = ref(false)
const message = ref('')
const showPreview = ref(false)
const isLeaving = ref(false)
let timer: number | undefined
const timingStartedAt = ref<number | null>(null)
let allowRouteLeave = false

const currentUnitGraded = computed(() => Boolean(unit.value?.questions.every((question) => session.value?.gradedQuestionIds.includes(question.id))))
const savedCycleProgress = computed(() => {
  const current = session.value
  if (!current?.projectId || !['ORDERED', 'RANDOM_CYCLE'].includes(current.mode)) return null
  const progress = store.data.modeProgress.find((item) => item.projectId === current.projectId)
  if (!progress) return null
  const total = current.mode === 'RANDOM_CYCLE' ? progress.randomQueue.length : units.value.length
  const cursor = current.mode === 'RANDOM_CYCLE' ? progress.randomCursor : progress.orderedCursor
  const completedUnitCount = units.value.filter((item) => (
    item.questions.length > 0
    && item.questions.every((question) => current.gradedQuestionIds.includes(question.id))
  )).length
  const currentNumber = cycleSessionProgressNumber(cursor, total, completedUnitCount, current.currentIndex)
  return {
    current: currentNumber,
    total,
    completed: isCycleSessionComplete(currentNumber, total, currentUnitGraded.value),
  }
})
const displayedProgress = computed(() => savedCycleProgress.value ?? {
  current: units.value.length ? (session.value?.currentIndex ?? 0) + 1 : 0,
  total: units.value.length,
})
const progressPercent = computed(() => displayedProgress.value.total
  ? displayedProgress.value.current / displayedProgress.value.total * 100
  : 0)
const allCurrentAnswered = computed(() => Boolean(unit.value?.questions.every((question) => session.value?.answers[question.id])))
const answeredUnitCount = computed(() => units.value.filter((item) => isUnitAnswered(item)).length)
const elapsedDurationMs = computed(() => (session.value?.durationMs ?? 0)
  + (timingStartedAt.value === null ? 0 : Math.max(0, nowMs.value - timingStartedAt.value)))

onMounted(() => {
  syncReveal()
  startTiming()
  updateTimer()
  timer = window.setInterval(updateTimer, 1000)
})
onBeforeUnmount(() => {
  if (session.value?.status === 'ACTIVE') {
    flushTiming()
    void store.saveSession(session.value)
  }
  window.clearInterval(timer)
})

onIonViewDidEnter(updateTimer)
useActiveHardwareBack(leave)

onBeforeRouteLeave(async () => {
  if (allowRouteLeave) {
    allowRouteLeave = false
    return true
  }
  const current = session.value
  if (!current) return true
  if (shouldShowSingleQuestionResultOnLeave(current)) {
    void leave()
    return false
  }
  if (current.status === 'COMPLETED') return true
  if (busy.value) return false
  if (['ORDERED', 'RANDOM_CYCLE', 'EXAM'].includes(current.mode) || isGroupReviewSession(current)) {
    void leave()
    return false
  }
  try {
    stopTiming()
    await store.saveSession(current)
    return true
  } catch (error) {
    flash(`退出保存失败：${(error as Error).message}`)
    return false
  }
})

function updateTimer(): void {
  nowMs.value = Date.now()
  if (!session.value?.deadline || session.value.status === 'COMPLETED') return
  remainingMs.value = Math.max(0, new Date(session.value.deadline).getTime() - Date.now())
  if (remainingMs.value === 0 && !busy.value) finish(true)
}

function startTiming(): void {
  const now = Date.now()
  nowMs.value = now
  const current = session.value
  const currentUnit = unit.value
  timingStartedAt.value = current && currentUnit && shouldTrackCurrentUnit(
    current.status === 'ACTIVE',
    currentUnit.questions.map((question) => question.id),
    current.gradedQuestionIds,
  ) ? now : null
}

function flushTiming(): void {
  const current = session.value
  const currentUnit = unit.value
  if (!current || !currentUnit || timingStartedAt.value === null || current.status !== 'ACTIVE') return
  const now = Date.now()
  const elapsed = Math.max(0, now - timingStartedAt.value)
  current.durationMs += elapsed
  current.questionDurationMs = allocateQuestionDuration(
    current.questionDurationMs,
    currentUnit.questions.map((question) => question.id),
    elapsed,
  )
  timingStartedAt.value = now
  nowMs.value = now
}

function stopTiming(): void {
  flushTiming()
  timingStartedAt.value = null
}

function syncReveal(): void {
  reveal.value = Boolean(unit.value?.questions.every((question) => session.value?.gradedQuestionIds.includes(question.id)))
}

async function persistAnswer(): Promise<void> {
  if (session.value) {
    flushTiming()
    await store.saveSession(session.value)
  }
}

async function submitCurrent(): Promise<void> {
  if (!session.value || !unit.value) return
  if (!allCurrentAnswered.value) return flash('请先完成当前题目')
  busy.value = true
  try {
    stopTiming()
    await store.gradeUnit(session.value, unit.value)
    if (isSingleQuestion.value) await store.finishSession(session.value)
    reveal.value = true
  } catch (error) {
    if (session.value.status === 'ACTIVE') startTiming()
    throw error
  } finally { busy.value = false }
}

async function finishCompletedCycle(): Promise<boolean> {
  const current = session.value
  if (!current || !savedCycleProgress.value?.completed) return false
  prepareLeaving()
  let summarized = false
  try {
    summarized = await store.finishPartialPracticeSession(current)
  } catch (error) {
    cancelLeaving()
    throw error
  }
  if (!summarized) {
    cancelLeaving()
    return false
  }
  allowRouteLeave = true
  await router.replace(`/result/${current.id}`)
  return true
}

async function next(): Promise<void> {
  if (!session.value) return
  if (!isExam.value && !reveal.value) return flash('请先提交当前题目')
  // 单题练习只有一个题目；提交后应直接进入本轮刷题综述，
  // 不再走循环刷题的进度判断，避免“完成本轮”按钮无响应。
  if (isSingleQuestion.value) {
    await finish(false)
    return
  }
  if (isCycleMode.value && savedCycleProgress.value?.completed) {
    busy.value = true
    try {
      await finishCompletedCycle()
    } finally {
      busy.value = false
    }
    return
  }
  if (session.value.currentIndex >= units.value.length - 1) {
    await finish(false)
    return
  }
  flushTiming()
  session.value.currentIndex += 1
  reveal.value = false
  syncReveal()
  startTiming()
  await store.saveSession(session.value)
  document.querySelector('ion-content')?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function previous(): Promise<void> {
  if (!session.value || session.value.currentIndex === 0) return
  flushTiming()
  session.value.currentIndex -= 1
  syncReveal()
  startTiming()
  await store.saveSession(session.value)
}

function isUnitAnswered(target: PracticeUnit): boolean {
  return Boolean(target.questions.length && target.questions.every((question) => session.value?.answers[question.id]))
}

async function jumpTo(index: number): Promise<void> {
  if (!session.value || index < 0 || index >= units.value.length) return
  flushTiming()
  session.value.currentIndex = index
  showPreview.value = false
  reveal.value = false
  syncReveal()
  startTiming()
  await store.saveSession(session.value)
  document.querySelector('ion-content')?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function finish(timeout: boolean): Promise<void> {
  if (!session.value || busy.value) return
  if (!timeout && isExam.value && !window.confirm('确定提交试卷吗？未作答题目将计为未答。')) return
  busy.value = true
  try {
    stopTiming()
    await store.finishSession(session.value)
    isLeaving.value = true
    await router.replace(`/result/${session.value.id}`)
  } catch (error) {
    isLeaving.value = false
    throw error
  } finally { busy.value = false }
}

async function toggleFavorite(questionId: string): Promise<void> {
  await store.toggleFavorite(questionId)
}

async function saveNote(questionId: string, note: string): Promise<void> {
  try {
    await store.saveQuestionNote(questionId, note)
  } catch (error) { flash(`备注保存失败：${(error as Error).message}`) }
}

async function correctFillAnswer(questionId: string, answer: string): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    await store.correctFillAnswer(questionId, answer)
    flash('答案已修正并加入正确答案')
  } catch (error) {
    flash(`答案修正失败：${(error as Error).message}`)
  } finally {
    busy.value = false
  }
}

async function restartCycle(): Promise<void> {
  if (!session.value || busy.value) return
  const prompt = session.value.mode === 'RANDOM_CYCLE'
    ? '确定重新开始随机刷题吗？当前答题进度将清空，题目会重新随机排序。'
    : '确定重新开始顺序刷题吗？当前答题进度将清空，并从第一题开始。'
  if (!window.confirm(prompt)) return
  busy.value = true
  try {
    const count = await store.restartCycleSession(session.value)
    startTiming()
    reveal.value = false
    showPreview.value = false
    syncReveal()
    document.querySelector('ion-content')?.scrollTo({ top: 0, behavior: 'smooth' })
    flash(`已从第一题重新开始，共 ${count} 题`)
  } catch (error) {
    flash((error as Error).message)
  } finally { busy.value = false }
}

async function copyCurrent(): Promise<void> {
  if (!unit.value) return
  try {
    await copyText(formatQuestionsForClipboard(unit.value.context, unit.value.questions))
    flash('题干和答案已复制')
  } catch (error) { flash((error as Error).message) }
}

async function leave(): Promise<void> {
  const current = session.value
  if (!current || busy.value) return
  if (current.mode === 'EXAM' && current.status === 'ACTIVE'
    && !window.confirm('试卷还未提交，确定退出吗？答题进度会保留。')) return
  busy.value = true
  prepareLeaving()
  try {
    stopTiming()
    if (['ORDERED', 'RANDOM_CYCLE'].includes(current.mode)) {
      const summarized = await store.finishPartialPracticeSession(current)
      if (summarized) {
        allowRouteLeave = true
        await router.replace(`/result/${current.id}`)
        return
      }
    }
    if (shouldShowSingleQuestionResultOnLeave(current)) {
      allowRouteLeave = true
      await router.replace(`/result/${current.id}`)
      return
    }
    if (shouldCompleteGroupReviewOnLeave(current, units.value.length, currentUnitGraded.value)) {
      await store.finishSession(current)
      allowRouteLeave = true
      await router.replace(`/result/${current.id}`)
      return
    }
    await store.saveSession(current)
    allowRouteLeave = true
    await router.back()
  } catch (error) {
    cancelLeaving()
    flash(`退出保存失败：${(error as Error).message}`)
  } finally { busy.value = false }
}

function prepareLeaving(): void {
  leavingUnit.value = unit.value ?? null
  isLeaving.value = true
}

function cancelLeaving(): void {
  isLeaving.value = false
  leavingUnit.value = null
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 1800)
}
</script>

<template>
  <IonPage>
    <AppHeader :title="practiceTitle" back custom-back @back="leave">
      <div class="header-actions">
        <button v-if="isCycleMode" class="text-button restart-button" :disabled="busy" title="清空当前进度并从第一题重新开始" @click="restartCycle">⟳ 重刷</button>
        <button v-if="isExam" class="text-button preview-button" title="预览当前答题情况" @click="showPreview = true">▦ 预览</button>
        <button class="text-button" :disabled="busy" @click="leave">保存退出</button>
      </div>
    </AppHeader>
    <IonContent :fullscreen="true">
      <main v-if="session && unit" class="page-content no-nav">
        <div class="practice-top">
          <button class="icon-button" :disabled="session.currentIndex === 0" @click="previous">‹</button>
          <div class="practice-progress">
            <small>{{ displayedProgress.current }} / {{ displayedProgress.total }}</small>
            <div class="progress-track"><i :style="{ width: `${progressPercent}%` }"></i></div>
          </div>
          <span v-if="session.deadline" class="timer">{{ formatDuration(remainingMs) }}</span>
          <span v-else class="timer">{{ formatDuration(elapsedDurationMs) }}</span>
        </div>

        <div v-if="unit.context" class="case-context" style="margin-top:18px">
          <span>案例材料</span>{{ unit.context.stem }}
        </div>
        <div v-else style="height:18px"></div>

        <QuestionBlock
          v-for="question in unit.questions"
          :key="question.id"
          :model-value="session.answers[question.id] || ''"
          :question="question"
          :reveal="reveal"
          :disabled="reveal"
          :learning="store.learningMap.get(question.id)"
          :show-favorite="true"
          @update:model-value="session.answers[question.id] = $event"
          @favorite="toggleFavorite(question.id)"
          @correct-answer="correctFillAnswer(question.id, $event)"
          @save-note="saveNote(question.id, $event)"
          @change="persistAnswer"
        />

        <div class="button-row">
          <button v-if="!isExam && !reveal" class="primary-button" :disabled="busy" @click="submitCurrent">提交并查看解析</button>
          <button v-else class="primary-button" :disabled="busy" @click="next">
            {{ isCycleMode && savedCycleProgress?.completed ? '完成本轮' : session.currentIndex === units.length - 1 ? (isExam ? '提交试卷' : '完成本轮') : '下一题' }}
          </button>
        </div>
        <button v-if="isExam" class="secondary-button wide-button" style="margin-top:10px" @click="finish(false)">提前交卷</button>
        <button v-if="reveal" class="secondary-button wide-button copy-button" @click="copyCurrent">复制题干和答案</button>
      </main>
      <div v-else-if="!isLeaving" class="empty-state"><h3>找不到练习记录</h3><button class="primary-button" @click="router.replace('/')">返回首页</button></div>

      <div v-if="isExam && showPreview && session" class="preview-backdrop" @click.self="showPreview = false">
        <section class="card preview-card" role="dialog" aria-modal="true" aria-label="答题预览">
          <div class="preview-heading">
            <div><h3>答题预览</h3><p>已答 {{ answeredUnitCount }} / {{ units.length }}</p></div>
            <button class="icon-button preview-close" aria-label="关闭预览" @click="showPreview = false">×</button>
          </div>
          <div class="preview-grid">
            <button
              v-for="(previewUnit, index) in units"
              :key="previewUnit.id"
              class="preview-number"
              :class="{ answered: isUnitAnswered(previewUnit), current: index === session.currentIndex }"
              :aria-label="`第 ${index + 1} 题，${isUnitAnswered(previewUnit) ? '已作答' : '未作答'}`"
              @click="jumpTo(index)"
            >{{ index + 1 }}</button>
          </div>
          <div class="preview-legend">
            <span><i class="answered"></i>已作答</span>
            <span><i></i>未作答</span>
          </div>
        </section>
      </div>
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.header-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; }
.header-actions .text-button { padding: 8px 6px; white-space: nowrap; }
.restart-button { color: var(--accent); }
.restart-button:disabled { opacity: .5; }
.preview-button { color: #3478c7; }
.copy-button { margin-top: 10px; }
.preview-backdrop {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(16, 30, 24, .46);
}
.preview-card { width: min(100%, 560px); max-height: 82vh; overflow: auto; }
.preview-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.preview-heading h3 { margin-bottom: 3px; }
.preview-close { flex: 0 0 auto; box-shadow: none; background: var(--primary-soft); }
.preview-grid { display: grid; grid-template-columns: repeat(auto-fill, 42px); justify-content: center; gap: 12px; margin: 22px 0; }
.preview-number {
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 50%;
  color: white;
  background: #a7afac;
  font-weight: 900;
}
.preview-number.answered { background: #3478c7; }
.preview-number.current { box-shadow: 0 0 0 3px white, 0 0 0 5px var(--accent); }
.preview-legend { display: flex; justify-content: center; gap: 22px; color: var(--muted); font-size: 12px; }
.preview-legend span { display: flex; align-items: center; gap: 6px; }
.preview-legend i { width: 12px; height: 12px; border-radius: 50%; background: #a7afac; }
.preview-legend i.answered { background: #3478c7; }
</style>
