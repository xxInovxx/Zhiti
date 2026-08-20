<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import {
  buildPracticeHistory,
  filterPracticeHistory,
  practiceHistoryProjectKey,
  practiceModeLabel,
  type PracticeHistoryTimeRange,
} from '@/modules/history/practiceHistory'
import type { PracticeMode } from '@/domain/models'
import { formatDuration } from '@/domain/utils'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const router = useRouter()
const allHistoryItems = computed(() => buildPracticeHistory(store.data.sessions, store.data.projects))
const timeRange = ref<PracticeHistoryTimeRange>('ALL')
const projectKey = ref('ALL')
const practiceMode = ref<PracticeMode | 'ALL'>('ALL')
const clearing = ref(false)
const clearMessage = ref('')
const deletingSessionId = ref<string | null>(null)
const openSessionId = ref<string | null>(null)
const draggingSessionId = ref<string | null>(null)
const dragOffsets = ref<Record<string, number>>({})
const suppressClickId = ref<string | null>(null)
const DELETE_REVEAL_WIDTH = 88
let clearMessageTimer = 0
let gesture: {
  sessionId: string
  pointerId: number
  startX: number
  startY: number
  baseOffset: number
  horizontal: boolean
  cancelled: boolean
} | null = null
const projectOptions = computed(() => {
  const options = new Map<string, string>()
  allHistoryItems.value.forEach((item) => options.set(practiceHistoryProjectKey(item), item.projectName))
  return [...options].map(([value, label]) => ({ value, label }))
})
const historyItems = computed(() => filterPracticeHistory(allHistoryItems.value, {
  timeRange: timeRange.value,
  projectKey: projectKey.value,
  mode: practiceMode.value,
}))
const isFiltering = computed(() => timeRange.value !== 'ALL' || projectKey.value !== 'ALL' || practiceMode.value !== 'ALL')

onBeforeUnmount(() => window.clearTimeout(clearMessageTimer))

function resetFilters(): void {
  timeRange.value = 'ALL'
  projectKey.value = 'ALL'
  practiceMode.value = 'ALL'
}

async function clearFilteredHistory(): Promise<void> {
  if (!historyItems.value.length || clearing.value) return
  if (!window.confirm('是否确定清除当前筛选的学习记录？')) return
  const sessionIds = historyItems.value.map((item) => item.session.id)
  clearing.value = true
  try {
    await store.deleteSessions(sessionIds)
    showClearMessage(sessionIds.length)
  } catch (error) {
    window.alert(`清除失败：${(error as Error).message}`)
  } finally {
    clearing.value = false
  }
}

function cardOffset(sessionId: string): number {
  return dragOffsets.value[sessionId] ?? (openSessionId.value === sessionId ? -DELETE_REVEAL_WIDTH : 0)
}

function setCardOffset(sessionId: string, offset: number): void {
  dragOffsets.value = { ...dragOffsets.value, [sessionId]: offset }
}

function closeOpenCard(exceptSessionId?: string): void {
  const openId = openSessionId.value
  if (!openId || openId === exceptSessionId) return
  setCardOffset(openId, 0)
  openSessionId.value = null
}

function beginCardDrag(event: PointerEvent, sessionId: string): void {
  if (event.button !== 0 || deletingSessionId.value) return
  closeOpenCard(sessionId)
  gesture = {
    sessionId,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    baseOffset: cardOffset(sessionId),
    horizontal: false,
    cancelled: false,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function moveCardDrag(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return
  const deltaX = event.clientX - gesture.startX
  const deltaY = event.clientY - gesture.startY
  if (!gesture.horizontal) {
    if (Math.abs(deltaX) < 9 && Math.abs(deltaY) < 9) return
    if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
      gesture.cancelled = true
      return
    }
    gesture.horizontal = true
    draggingSessionId.value = gesture.sessionId
  }
  event.preventDefault()
  const offset = Math.max(-DELETE_REVEAL_WIDTH, Math.min(0, gesture.baseOffset + deltaX))
  setCardOffset(gesture.sessionId, offset)
}

function endCardDrag(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const currentGesture = gesture
  gesture = null
  draggingSessionId.value = null
  if (!currentGesture.horizontal) return
  const shouldOpen = cardOffset(currentGesture.sessionId) <= -DELETE_REVEAL_WIDTH * .55
  setCardOffset(currentGesture.sessionId, shouldOpen ? -DELETE_REVEAL_WIDTH : 0)
  openSessionId.value = shouldOpen ? currentGesture.sessionId : null
  suppressClickId.value = currentGesture.sessionId
  window.setTimeout(() => {
    if (suppressClickId.value === currentGesture.sessionId) suppressClickId.value = null
  }, 0)
}

function cancelCardDrag(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const sessionId = gesture.sessionId
  gesture = null
  draggingSessionId.value = null
  setCardOffset(sessionId, openSessionId.value === sessionId ? -DELETE_REVEAL_WIDTH : 0)
}

async function openHistoryRecord(sessionId: string): Promise<void> {
  if (suppressClickId.value === sessionId) return
  if (openSessionId.value === sessionId) {
    setCardOffset(sessionId, 0)
    openSessionId.value = null
    return
  }
  await router.push(`/result/${sessionId}?from=history`)
}

async function deleteHistoryRecord(sessionId: string): Promise<void> {
  if (deletingSessionId.value) return
  if (!window.confirm('是否确定清除这条学习记录？')) return
  deletingSessionId.value = sessionId
  try {
    await store.deleteSessions([sessionId])
    const nextOffsets = { ...dragOffsets.value }
    delete nextOffsets[sessionId]
    dragOffsets.value = nextOffsets
    openSessionId.value = null
    showClearMessage(1)
  } catch (error) {
    window.alert(`清除失败：${(error as Error).message}`)
  } finally {
    deletingSessionId.value = null
  }
}

function showClearMessage(count: number): void {
  window.clearTimeout(clearMessageTimer)
  clearMessage.value = `已清除${count}条学习记录`
  clearMessageTimer = window.setTimeout(() => { clearMessage.value = '' }, 2200)
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}
</script>

<template>
  <IonPage>
    <AppHeader title="学习历史" subtitle="每一次完成的刷题都会记录在这里" />
    <IonContent :fullscreen="true">
      <main class="page-content">
        <section class="card filter-card" aria-label="学习历史筛选">
          <div class="filter-heading">
            <div><h2>筛选记录</h2><p>可按多个条件组合筛选</p></div>
            <div class="filter-actions">
              <button v-if="isFiltering" class="text-button" @click="resetFilters">重置</button>
              <button
                class="text-button danger"
                :disabled="!historyItems.length || clearing"
                @click="clearFilteredHistory"
              >{{ clearing ? '清除中…' : '清除' }}</button>
            </div>
          </div>
          <div class="filter-grid">
            <label>
              <span>时间</span>
              <select v-model="timeRange" aria-label="按时间筛选">
                <option value="ALL">全部时间</option>
                <option value="TODAY">今天</option>
                <option value="LAST_3_DAYS">近 3 天</option>
                <option value="LAST_5_DAYS">近 5 天</option>
                <option value="LAST_7_DAYS">近 7 天</option>
                <option value="LAST_30_DAYS">近 30 天</option>
              </select>
            </label>
            <label>
              <span>刷题项目</span>
              <select v-model="projectKey" aria-label="按刷题项目筛选">
                <option value="ALL">全部项目</option>
                <option v-for="option in projectOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label>
              <span>刷题模式</span>
              <select v-model="practiceMode" aria-label="按刷题模式筛选">
                <option value="ALL">全部模式</option>
                <option value="ORDERED">顺序刷题</option>
                <option value="RANDOM_CYCLE">随机刷题</option>
                <option value="EXAM">随机组卷</option>
                <option value="WRONG_REVIEW">错题重练</option>
                <option value="FAVORITE_REVIEW">收藏重练</option>
                <option value="NOTE_REVIEW">备注重练</option>
              </select>
            </label>
          </div>
        </section>
        <div class="section-heading"><h2>学习记录</h2><span>{{ historyItems.length }} / {{ allHistoryItems.length }} 次</span></div>
        <EmptyState
          v-if="!historyItems.length"
          icon="history"
          :title="allHistoryItems.length ? '没有符合条件的记录' : '还没有学习历史'"
          :description="allHistoryItems.length ? '请调整筛选条件后再试。' : '完成一轮刷题后，记录会自动保存在这里。'"
        />
        <div
          v-for="item in historyItems"
          :key="item.session.id"
          class="history-slide"
        >
          <button
            class="history-delete"
            :disabled="deletingSessionId === item.session.id"
            :tabindex="openSessionId === item.session.id ? 0 : -1"
            :aria-hidden="openSessionId !== item.session.id"
            :aria-label="`清除${item.projectName}的这条学习记录`"
            @click.stop="deleteHistoryRecord(item.session.id)"
          >{{ deletingSessionId === item.session.id ? '清除中' : '清除' }}</button>
          <button
            class="card history-card"
            :class="{ dragging: draggingSessionId === item.session.id }"
            :style="{ transform: `translateX(${cardOffset(item.session.id)}px)` }"
            @click="openHistoryRecord(item.session.id)"
            @pointerdown="beginCardDrag($event, item.session.id)"
            @pointermove="moveCardDrag"
            @pointerup="endCardDrag"
            @pointercancel="cancelCardDrag"
          >
            <div class="history-heading">
              <div>
                <span class="history-label">刷题项目</span>
                <h3>{{ item.projectName }}</h3>
              </div>
              <span class="type-chip">{{ practiceModeLabel(item.session.mode) }}</span>
            </div>
            <div class="history-values">
              <div><strong>{{ item.questionCount }}</strong><span>题目数量</span></div>
              <div><strong>{{ Math.round(item.correctRate * 100) }}%</strong><span>正确率</span></div>
            </div>
            <div class="history-time"><span>刷题时间</span><strong>{{ formatTime(item.practicedAt) }}</strong></div>
            <div class="history-time history-duration"><span>刷题用时</span><strong>{{ formatDuration(item.session.durationMs) }}</strong></div>
          </button>
        </div>
      </main>
      <div v-if="clearMessage" class="toast">{{ clearMessage }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.filter-card { margin-top: 2px; }
.filter-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.filter-heading h2 { margin: 0; font-size: 17px; }
.filter-heading p { margin-top: 4px; }
.filter-actions { display: flex; align-items: center; gap: 12px; }
.filter-actions button:disabled { opacity: .4; }
.filter-grid { display: grid; gap: 11px; margin-top: 16px; }
.filter-grid label > span { display: block; margin-bottom: 6px; color: var(--muted); font-size: 11px; font-weight: 700; }
.filter-grid select { width: 100%; height: 44px; border: 1px solid var(--line); border-radius: 12px; padding: 0 34px 0 12px; color: var(--ink); background: #fbfbf8; font: inherit; outline: none; }
.filter-grid select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.history-slide { position: relative; overflow: hidden; border-radius: var(--radius); box-shadow: var(--shadow); }
.history-slide + .history-slide { margin-top: 12px; }
.history-card { position: relative; z-index: 1; width: 100%; border: 0; color: var(--ink); text-align: left; box-shadow: none; touch-action: pan-y; transition: transform .22s ease; }
.history-card.dragging { transition: none; }
.history-delete { position: absolute; z-index: 0; inset: 0 0 0 auto; width: 88px; border: 0; color: #fff; background: var(--danger); font: inherit; font-weight: 800; }
.history-delete:disabled { opacity: .72; }
.history-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.history-heading h3 { margin-top: 4px; }
.history-label { color: var(--muted); font-size: 11px; }
.history-values { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 14px; padding: 13px 0; border-block: 1px solid var(--line); }
.history-values div { text-align: center; }
.history-values strong { display: block; color: var(--primary); font: 22px Georgia, serif; }
.history-values span, .history-time span { color: var(--muted); font-size: 11px; }
.history-time { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.history-time strong { font-size: 12px; font-weight: 700; }
.history-duration { margin-top: 7px; }
@media (min-width: 700px) { .filter-grid { grid-template-columns: repeat(3, 1fr); } }
</style>
