<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import QuestionBlock from '@/components/QuestionBlock.vue'
import { copyText, formatQuestionsForClipboard } from '@/domain/clipboard'
import { horizontalSwipeOffset } from '@/domain/swipe'
import { buildSessionReviewItems } from '@/modules/practice/sessionReview'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const route = useRoute()
const router = useRouter()
const sessionId = String(route.params.id ?? '')
const reviewScope = route.query.scope === 'WRONG' ? 'WRONG' : 'ALL'
const queryIndex = Number(route.query.index ?? 0)
const selectedIndex = ref(Number.isInteger(queryIndex) && queryIndex >= 0 ? queryIndex : 0)
const message = ref('')
let touchStartX = 0
let touchStartY = 0

const session = computed(() => store.data.sessions.find((item) => item.id === sessionId))
const units = computed(() => session.value ? store.getSessionUnits(session.value) : [])
const reviewItems = computed(() => session.value ? buildSessionReviewItems(session.value, units.value) : [])
const activeReviewItems = computed(() => reviewScope === 'WRONG'
  ? reviewItems.value.filter((item) => !item.correct)
  : reviewItems.value)
const selectedItem = computed(() => activeReviewItems.value[selectedIndex.value] ?? null)
const selectedNumber = computed(() => selectedIndex.value + 1)

async function closeReview(): Promise<void> {
  await router.back()
}

function moveReview(offset: number): void {
  const next = Math.min(activeReviewItems.value.length - 1, Math.max(0, selectedIndex.value + offset))
  if (next === selectedIndex.value) return
  selectedIndex.value = next
  scrollTop()
}

function onTouchStart(event: TouchEvent): void {
  touchStartX = event.changedTouches[0]?.clientX ?? 0
  touchStartY = event.changedTouches[0]?.clientY ?? 0
}

function onTouchEnd(event: TouchEvent): void {
  const touch = event.changedTouches[0]
  const offset = horizontalSwipeOffset({
    deltaX: (touch?.clientX ?? touchStartX) - touchStartX,
    deltaY: (touch?.clientY ?? touchStartY) - touchStartY,
  })
  if (offset) moveReview(offset)
}

async function copySelected(): Promise<void> {
  if (!selectedItem.value) return
  try {
    await copyText(formatQuestionsForClipboard(selectedItem.value.context, [selectedItem.value.question]))
    flash('题干和答案已复制')
  } catch (error) { flash((error as Error).message) }
}

async function saveSelectedNote(note: string): Promise<void> {
  if (!selectedItem.value) return
  try {
    await store.saveQuestionNote(selectedItem.value.question.id, note)
  } catch (error) { flash(`备注保存失败：${(error as Error).message}`) }
}

async function correctSelectedAnswer(answer: string): Promise<void> {
  if (!selectedItem.value) return
  const questionId = selectedItem.value.question.id
  try {
    await store.correctFillAnswer(questionId, answer)
    flash('答案已修正并加入正确答案')
    if (reviewScope === 'WRONG') {
      if (!activeReviewItems.value.length) await router.back()
      else selectedIndex.value = Math.min(selectedIndex.value, activeReviewItems.value.length - 1)
    }
  } catch (error) {
    flash(`答案修正失败：${(error as Error).message}`)
  }
}

function scrollTop(): void {
  window.setTimeout(() => document.querySelector('ion-content')?.scrollTo({ top: 0, behavior: 'smooth' }), 0)
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 1800)
}
</script>

<template>
  <IonPage>
    <AppHeader :title="`${reviewScope === 'WRONG' ? '错题解析' : '题目解析'} ${selectedNumber} / ${activeReviewItems.length}`" back />
    <IonContent :fullscreen="true">
      <main
        v-if="session && selectedItem"
        :key="selectedItem.question.id"
        class="review-page"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <div class="review-toolbar">
          <button class="secondary-button" @click="closeReview">← 返回综述</button>
          <span class="review-status" :class="selectedItem.correct ? 'correct' : 'wrong'">
            {{ selectedItem.correct ? '回答正确' : selectedItem.ownAnswer ? '回答错误' : '未作答' }}
          </span>
        </div>

        <div v-if="selectedItem.context" class="case-context">
          <span>案例材料</span>{{ selectedItem.context.stem }}
        </div>
        <QuestionBlock
          :question="selectedItem.question"
          :model-value="selectedItem.ownAnswer"
          :learning="store.learningMap.get(selectedItem.question.id)"
          :show-favorite="true"
          reveal disabled
          @favorite="store.toggleFavorite(selectedItem.question.id)"
          @correct-answer="correctSelectedAnswer"
          @save-note="saveSelectedNote"
        />
        <button class="secondary-button wide-button" @click="copySelected">复制题干和答案</button>

        <div class="review-navigation">
          <button class="secondary-button" :disabled="selectedIndex === 0" @click="moveReview(-1)">← 上一题</button>
          <span>{{ selectedNumber }} / {{ activeReviewItems.length }}</span>
          <button class="secondary-button" :disabled="selectedIndex === activeReviewItems.length - 1" @click="moveReview(1)">下一题 →</button>
        </div>
        <p class="swipe-hint">在页面上保持接近水平并滑动较长距离，可切换题目</p>
      </main>

      <div v-else class="empty-state"><h3>找不到题目解析</h3></div>
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.review-page { min-height: calc(100vh - 72px); max-width: 820px; margin: 0 auto; padding: 18px 18px calc(28px + var(--safe-bottom)); touch-action: pan-y; }
.review-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.review-status { padding: 7px 11px; border-radius: 999px; font-size: 12px; font-weight: 900; }
.review-status.correct { color: #237a50; background: #e5f6ed; }
.review-status.wrong { color: var(--danger); background: var(--danger-soft); }
.review-navigation { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; margin-top: 16px; }
.review-navigation button:last-child { justify-self: stretch; }
.review-navigation span { color: var(--muted); font-size: 12px; font-weight: 800; }
.review-navigation button:disabled { opacity: .45; }
.swipe-hint { margin: 13px 0 0; text-align: center; color: var(--muted); font-size: 11px; }
</style>
