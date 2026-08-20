<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { LearningState, Question } from '@/domain/models'
import { questionAnswerIsCorrect, questionCorrectAnswers } from '@/domain/utils'
import FavoriteIcon from './FavoriteIcon.vue'

const props = withDefaults(defineProps<{
  question: Question
  modelValue: string
  reveal?: boolean
  disabled?: boolean
  showFavorite?: boolean
  learning?: LearningState
}>(), {
  showFavorite: true,
})
const emit = defineEmits<{
  'update:modelValue': [value: string]
  favorite: []
  'correct-answer': [value: string]
  'save-note': [value: string]
  change: []
}>()

const selected = computed(() => new Set(props.modelValue.split('').filter(Boolean)))
const ownAnswerCorrect = computed(() => questionAnswerIsCorrect(props.question, props.modelValue))
const correctAnswerText = computed(() => questionCorrectAnswers(props.question).join(' / '))
const canCorrectFillAnswer = computed(() => Boolean(
  props.reveal
  && props.question.answerMode === 'FILL'
  && props.modelValue
  && !ownAnswerCorrect.value,
))
const noteDraft = ref('')
let lastSubmittedNote = ''
let noteSaveTimer: number | undefined

watch(
  () => props.question.id,
  () => {
    window.clearTimeout(noteSaveTimer)
    noteSaveTimer = undefined
    noteDraft.value = props.learning?.note ?? ''
    lastSubmittedNote = noteDraft.value.trim()
  },
  { immediate: true },
)

watch(
  () => props.learning?.note,
  (value) => {
    const savedNote = value ?? ''
    if (noteDraft.value.trim() === lastSubmittedNote) noteDraft.value = savedNote
    lastSubmittedNote = savedNote.trim()
  },
)

onBeforeUnmount(flushNoteSave)

function queueNoteSave(): void {
  window.clearTimeout(noteSaveTimer)
  noteSaveTimer = window.setTimeout(flushNoteSave, 600)
}

function flushNoteSave(): void {
  window.clearTimeout(noteSaveTimer)
  noteSaveTimer = undefined
  const note = noteDraft.value.trim()
  if (note === lastSubmittedNote) return
  lastSubmittedNote = note
  emit('save-note', note)
}

function choose(key: string): void {
  if (props.disabled) return
  if (props.question.answerMode === 'MULTIPLE') {
    const values = new Set(selected.value)
    if (values.has(key)) values.delete(key)
    else values.add(key)
    emit('update:modelValue', [...values].sort().join(''))
  } else {
    emit('update:modelValue', key)
  }
  emit('change')
}

function updateFillAnswer(event: Event): void {
  if (props.disabled) return
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function answerModeLabel(): string {
  if (props.question.answerMode === 'SINGLE') return '单选'
  if (props.question.answerMode === 'MULTIPLE') return '多选'
  if (props.question.answerMode === 'JUDGE') return '判断'
  return '填空'
}

function requestAnswerCorrection(): void {
  if (!canCorrectFillAnswer.value || !window.confirm('是否确定修正答案？')) return
  emit('correct-answer', props.modelValue)
}

function optionClass(key: string): Record<string, boolean> {
  return {
    selected: selected.value.has(key),
    correct: Boolean(props.reveal && props.question.normalizedAnswer.includes(key)),
    wrong: Boolean(props.reveal && selected.value.has(key) && !props.question.normalizedAnswer.includes(key)),
  }
}
</script>

<template>
  <article class="question-block" :class="{ revealed: reveal }">
    <div class="question-heading">
      <span class="type-chip">{{ answerModeLabel() }}</span>
      <div class="question-heading-actions">
        <button v-if="canCorrectFillAnswer" type="button" class="correct-answer-button" @click="requestAnswerCorrection">修正答案</button>
        <button
          v-if="showFavorite !== false"
          type="button"
          class="favorite-button"
          :class="{ active: learning?.isFavorite }"
          :aria-label="learning?.isFavorite ? '取消收藏' : '收藏题目'"
          :title="learning?.isFavorite ? '取消收藏' : '收藏题目'"
          @click="emit('favorite')"
        >
          <FavoriteIcon />
        </button>
      </div>
    </div>
    <h3>{{ question.stem }}</h3>
    <input
      v-if="question.answerMode === 'FILL'"
      class="fill-answer-input"
      :class="{ correct: reveal && ownAnswerCorrect, wrong: reveal && !ownAnswerCorrect }"
      :value="modelValue"
      :disabled="disabled"
      type="text"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      :spellcheck="false"
      placeholder="请输入答案"
      :aria-label="`${question.stem}的答案`"
      @input="updateFillAnswer"
      @change="emit('change')"
    />
    <div v-else class="options-list">
      <button
        v-for="option in question.options"
        :key="option.key"
        class="option-row"
        :class="optionClass(option.key)"
        :disabled="disabled"
        @click="choose(option.key)"
      >
        <span class="option-key">{{ option.key }}</span>
        <span>{{ option.text }}</span>
      </button>
    </div>
    <div v-if="reveal" class="answer-panel">
      <strong class="answer-line" :class="ownAnswerCorrect ? 'correct-answer' : 'wrong-answer'">你的答案：{{ modelValue || '未作答' }}</strong>
      <strong class="answer-line correct-answer">正确答案：{{ correctAnswerText }}</strong>
      <p class="answer-explanation">{{ question.explanation || '暂无解析' }}</p>
    </div>
    <textarea
      v-if="reveal"
      v-model="noteDraft"
      class="question-note-input"
      rows="4"
      maxlength="5000"
      placeholder="记录这道题的易错点、记忆方法或补充说明..."
      :aria-label="`${question.stem}的备注`"
      @input="queueNoteSave"
      @blur="flushNoteSave"
    ></textarea>
  </article>
</template>

<style scoped>
.question-heading-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.correct-answer-button {
  padding: 6px 10px;
  border: 1px solid #35a66f;
  border-radius: 999px;
  color: #237a50;
  background: #e5f6ed;
  font-size: 12px;
  font-weight: 900;
}
</style>
