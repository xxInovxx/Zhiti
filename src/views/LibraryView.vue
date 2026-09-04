<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { isGroupReviewSession } from '@/modules/practice/practiceEngine'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const router = useRouter()
const tab = ref<'wrong' | 'favorite' | 'note'>('wrong')
const projectFilter = ref('ALL')
const message = ref('')
const listQuestions = computed(() => {
  const questions = store.data.questions.filter((question) => question.enabled !== false && question.answerMode !== 'NONE')
  if (projectFilter.value === 'ALL') return questions
  const project = store.data.projects.find((item) => item.id === projectFilter.value)
  if (!project) return []
  const sourceIds = new Set(project.sourceIds)
  return questions.filter((question) => sourceIds.has(question.sourceFileId))
})
const visibleQuestions = computed(() => {
  const stateIds = new Set(store.data.learningStates
    .filter((state) => tab.value === 'wrong'
      ? state.isWrongActive
      : tab.value === 'favorite' ? state.isFavorite : Boolean(state.note.trim()))
    .map((state) => state.questionId))
  return listQuestions.value.filter((question) => stateIds.has(question.id))
})
const listStats = computed(() => store.calculateStats(listQuestions.value))
const notedCount = computed(() => listQuestions.value.filter((question) => Boolean(store.learningMap.get(question.id)?.note.trim())).length)
const practiceCount = computed(() => projectFilter.value === 'ALL'
  ? store.data.settings.totalPracticeCount
  : store.data.settings.projectPracticeCounts?.[projectFilter.value] ?? 0)

function reviewMode(): 'WRONG_REVIEW' | 'FAVORITE_REVIEW' | 'NOTE_REVIEW' {
  if (tab.value === 'wrong') return 'WRONG_REVIEW'
  if (tab.value === 'favorite') return 'FAVORITE_REVIEW'
  return 'NOTE_REVIEW'
}

function typeLabel(answerMode: string): string {
  if (answerMode === 'SINGLE') return '单选'
  if (answerMode === 'MULTIPLE') return '多选'
  if (answerMode === 'JUDGE') return '判断'
  return '填空'
}

async function review(): Promise<void> {
  try {
    const mode = reviewMode()
    const unfinished = store.data.sessions.filter((session) => (
      session.projectId === null
      && session.mode === mode
      && isGroupReviewSession(session)
      && session.status === 'ACTIVE'
      && store.getSessionUnits(session).length > 0
    ))
    const latest = unfinished[0]
    if (latest && window.confirm('检测到上一次重练尚未完成，是否恢复上次进度？')) {
      await router.push(`/practice/${latest.id}`)
      return
    }
    if (unfinished.length) await store.deleteSessions(unfinished.map((session) => session.id))
    const session = await store.startGlobalReview(mode)
    await router.push(`/practice/${session.id}`)
  } catch (error) { flash((error as Error).message) }
}

async function practiceQuestion(questionId: string): Promise<void> {
  try {
    const session = await store.startSingleQuestion(
      questionId,
      reviewMode(),
    )
    await router.push(`/practice/${session.id}`)
  } catch (error) { flash((error as Error).message) }
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 2200)
}
</script>

<template>
  <IonPage>
    <AppHeader title="统计中心" subtitle="错题、收藏、备注和学习统计在所有项目间共享" />
    <IonContent :fullscreen="true">
      <main class="page-content">
        <label class="card question-project-filter">
          <span>刷题项目</span>
          <select v-model="projectFilter" aria-label="按刷题项目筛选统计中心">
            <option value="ALL">全部项目</option>
            <option v-for="project in store.data.projects" :key="project.id" :value="project.id">{{ project.name }}</option>
          </select>
        </label>
        <section class="stats-grid">
          <div class="stat-card"><strong>{{ listStats.attempted }}</strong><span>已经学习</span></div>
          <div class="stat-card"><strong>{{ listStats.attempts }}</strong><span>累计做题</span></div>
          <div class="stat-card"><strong>{{ practiceCount }}</strong><span>练习总次数</span></div>
          <div class="stat-card"><strong>{{ Math.round(listStats.correctRate * 100) }}%</strong><span>正确率</span></div>
        </section>
        <div class="section-heading"><h2>题目清单</h2><button class="text-button" @click="review">开始重练</button></div>
        <div class="tabs question-list-tabs">
          <button :class="{ active: tab === 'wrong' }" @click="tab = 'wrong'">错题 {{ listStats.wrongActive }}</button>
          <button :class="{ active: tab === 'favorite' }" @click="tab = 'favorite'">收藏 {{ listStats.favorites }}</button>
          <button :class="{ active: tab === 'note' }" @click="tab = 'note'">备注 {{ notedCount }}</button>
        </div>
        <EmptyState
          v-if="!visibleQuestions.length"
          :icon="tab === 'wrong' ? 'wrong' : tab === 'favorite' ? 'favorite' : 'note'"
          :title="tab === 'wrong' ? '当前没有错题' : tab === 'favorite' ? '还没有收藏题目' : '还没有备注题目'"
          :description="tab === 'wrong' ? '继续保持，新的错题记录会自动同步到这里。' : tab === 'favorite' ? '刷题时点击星标即可全局收藏。' : '在题目解析下方填写备注后，会自动汇总到这里。'"
        />
        <article
          v-for="question in visibleQuestions"
          :key="question.id"
          class="card practice-card"
          role="button"
          tabindex="0"
          @click="practiceQuestion(question.id)"
          @keydown.enter="practiceQuestion(question.id)"
          @keydown.space.prevent="practiceQuestion(question.id)"
        >
          <div class="meta-row card-meta">
            <span class="type-chip">{{ question.nodeType === 'CASE_ITEM' ? `案例小题 · ${typeLabel(question.answerMode)}` : typeLabel(question.answerMode) }}</span>
            <span class="practice-hint">单题练习 →</span>
          </div>
          <h3>{{ question.stem }}</h3>
          <p>已作答 {{ store.learningMap.get(question.id)?.attemptCount || 0 }} 次 · 错误 {{ store.learningMap.get(question.id)?.wrongCount || 0 }} 次</p>
          <div class="button-row">
            <button class="secondary-button" @click.stop="store.toggleFavorite(question.id)">{{ store.learningMap.get(question.id)?.isFavorite ? '取消收藏' : '收藏' }}</button>
          </div>
        </article>
      </main>
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.question-project-filter { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 14px; margin-bottom: 14px; padding: 10px 12px 10px 16px; }
.question-project-filter span { color: var(--muted); font-size: 12px; font-weight: 800; white-space: nowrap; }
.question-project-filter select { width: 100%; height: 40px; min-width: 0; padding: 0 34px 0 12px; border: 1px solid var(--line); border-radius: 11px; color: var(--ink); background: var(--field-bg); font: inherit; outline: none; }
.question-project-filter select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.question-list-tabs { grid-template-columns: repeat(3, 1fr); }
.practice-card { cursor: pointer; outline: none; transition: transform .15s ease, border-color .15s ease; }
.practice-card:active { transform: scale(.99); }
.practice-card:focus-visible { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft), var(--shadow); }
.card-meta { align-items: center; margin: 0 0 10px; }
.practice-hint { margin-left: auto; color: var(--primary); font-size: 12px; font-weight: 800; }
</style>
