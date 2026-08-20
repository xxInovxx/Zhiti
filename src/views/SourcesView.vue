<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import { parseWorkbook } from '@/modules/import/workbookParser'
import { IMPORT_QUESTION_TYPES, questionImportType, type ImportQuestionType, type ParsedWorkbook } from '@/modules/import/importTypes'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const parsing = ref(false)
const importing = ref(false)
const preview = ref<ParsedWorkbook | null>(null)
const selectedTypes = ref<ImportQuestionType[]>([])
const editingSource = ref<{ sourceId: string; types: ImportQuestionType[] } | null>(null)
const message = ref('')
const typeLabels: Record<ImportQuestionType, string> = {
  SINGLE: '单选题', MULTIPLE: '多选题', JUDGE: '判断题', FILL: '填空题', CASE: '案例题',
}
const DELETE_REVEAL_WIDTH = 88
const openSourceId = ref<string | null>(null)
const draggingSourceId = ref<string | null>(null)
const dragOffsets = ref<Record<string, number>>({})
const suppressClickId = ref<string | null>(null)
let gesture: { sourceId: string; pointerId: number; startX: number; startY: number; baseOffset: number; horizontal: boolean; cancelled: boolean } | null = null

onBeforeUnmount(() => { gesture = null })

async function chooseFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.name.toLowerCase().endsWith('.xlsx')) return flash('请选择 .xlsx 文件')
  if (file.size > 50 * 1024 * 1024) return flash('文件不能超过 50MB')
  parsing.value = true
  preview.value = null
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    preview.value = await parseWorkbook(await file.arrayBuffer(), file.name)
    selectedTypes.value = IMPORT_QUESTION_TYPES.filter((type) => {
      if (type === 'SINGLE') return (preview.value?.counts.single ?? 0) > 0
      if (type === 'MULTIPLE') return (preview.value?.counts.multiple ?? 0) > 0
      if (type === 'JUDGE') return (preview.value?.counts.judge ?? 0) > 0
      if (type === 'FILL') return (preview.value?.counts.fill ?? 0) > 0
      return (preview.value?.counts.cases ?? 0) > 0
    })
  } catch (error) {
    flash(`解析失败：${(error as Error).message}`)
  } finally {
    parsing.value = false
  }
}

async function commitImport(): Promise<void> {
  if (!preview.value) return
  if (!selectedTypes.value.length) return flash('请至少选择一种题型')
  importing.value = true
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await store.importWorkbook(preview.value, selectedTypes.value)
    const importedCount = preview.value.questions.filter((question) => selectedTypes.value.includes(questionImportType(question)) && question.answerMode !== 'NONE').length
    flash(`已导入 ${importedCount} 道题`)
    preview.value = null
  } catch (error) {
    flash((error as Error).message)
  } finally { importing.value = false }
}

async function removeSource(id: string, name: string): Promise<void> {
  if (!window.confirm(`删除“${name}”及其题目和全局学习记录？引用它的项目也会移除此题库。`)) return
  try {
    await store.deleteSource(id)
    flash('题库已删除')
  } catch (error) { flash(`删除失败：${(error as Error).message}`) }
}

function availableTypes(sourceId: string): ImportQuestionType[] {
  const types = new Set(store.data.questions
    .filter((question) => question.sourceFileId === sourceId)
    .map((question) => questionImportType(question)))
  return IMPORT_QUESTION_TYPES.filter((type) => types.has(type))
}

function activeTypes(sourceId: string): ImportQuestionType[] {
  const types = new Set(store.data.questions
    .filter((question) => question.sourceFileId === sourceId && question.enabled !== false)
    .map((question) => questionImportType(question)))
  return IMPORT_QUESTION_TYPES.filter((type) => types.has(type))
}

function typeCount(sourceId: string, type: ImportQuestionType, activeOnly = true): number {
  return store.data.questions.filter((question) => question.sourceFileId === sourceId
    && (!activeOnly || question.enabled !== false) && questionImportType(question) === type && question.answerMode !== 'NONE').length
}

function openSourceEditor(sourceId: string): void {
  editingSource.value = { sourceId, types: activeTypes(sourceId) }
}

async function saveSourceSelection(): Promise<void> {
  if (!editingSource.value) return
  const current = editingSource.value
  try {
    await store.updateSourceSelection(current.sourceId, current.types)
    editingSource.value = null
    flash(current.types.length ? '题库题型已更新' : '已隐藏该题库全部题目，可重新勾选恢复')
  } catch (error) { flash(`更新失败：${(error as Error).message}`) }
}

function sourceOffset(sourceId: string): number {
  return dragOffsets.value[sourceId] ?? (openSourceId.value === sourceId ? -DELETE_REVEAL_WIDTH : 0)
}

function setSourceOffset(sourceId: string, offset: number): void {
  dragOffsets.value = { ...dragOffsets.value, [sourceId]: offset }
}

function closeOpenSource(exceptSourceId?: string): void {
  const openId = openSourceId.value
  if (!openId || openId === exceptSourceId) return
  setSourceOffset(openId, 0)
  openSourceId.value = null
}

function beginSourceDrag(event: PointerEvent, sourceId: string): void {
  if (event.button !== 0) return
  closeOpenSource(sourceId)
  gesture = { sourceId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, baseOffset: sourceOffset(sourceId), horizontal: false, cancelled: false }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function moveSourceDrag(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return
  const deltaX = event.clientX - gesture.startX
  const deltaY = event.clientY - gesture.startY
  if (!gesture.horizontal) {
    if (Math.abs(deltaX) < 9 && Math.abs(deltaY) < 9) return
    if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) { gesture.cancelled = true; return }
    gesture.horizontal = true
    draggingSourceId.value = gesture.sourceId
  }
  event.preventDefault()
  setSourceOffset(gesture.sourceId, Math.max(-DELETE_REVEAL_WIDTH, Math.min(0, gesture.baseOffset + deltaX)))
}

function endSourceDrag(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const current = gesture
  gesture = null
  draggingSourceId.value = null
  if (!current.horizontal) return
  const shouldOpen = sourceOffset(current.sourceId) <= -DELETE_REVEAL_WIDTH * .55
  setSourceOffset(current.sourceId, shouldOpen ? -DELETE_REVEAL_WIDTH : 0)
  openSourceId.value = shouldOpen ? current.sourceId : null
  suppressClickId.value = current.sourceId
  window.setTimeout(() => { if (suppressClickId.value === current.sourceId) suppressClickId.value = null }, 0)
}

function cancelSourceDrag(event: PointerEvent): void {
  if (!gesture || gesture.pointerId !== event.pointerId) return
  const sourceId = gesture.sourceId
  gesture = null
  draggingSourceId.value = null
  setSourceOffset(sourceId, openSourceId.value === sourceId ? -DELETE_REVEAL_WIDTH : 0)
}

function openSource(sourceId: string): void {
  if (suppressClickId.value === sourceId) return
  if (openSourceId.value === sourceId) {
    setSourceOffset(sourceId, 0)
    openSourceId.value = null
    return
  }
  openSourceEditor(sourceId)
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 2500)
}
</script>

<template>
  <IonPage>
    <AppHeader title="题库来源" subtitle="XLSX 全程在本地解析，不上传网络" />
    <IonContent :fullscreen="true">
      <main class="page-content">
        <label class="card source-upload">
          <input type="file" :disabled="parsing || importing" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" @change="chooseFile" />
          <div class="mode-icon" style="margin-inline:auto">＋</div>
          <h3>{{ parsing ? '正在解析题库…' : '选择 XLSX 文件' }}</h3>
          <p>支持单选题、多选题、判断题、填空题和案例题</p>
        </label>

        <div v-if="preview" class="modal-backdrop" @click.self="preview = null">
          <section class="card modal-card">
            <h3>选择导入题型</h3>
            <p>{{ preview.source.name }} · 取消的题型会先隐藏，不会删除题目，之后仍可在题库卡片中重新启用。</p>
            <div class="meta-row">
              <span class="chip">单选 {{ preview.counts.single }}</span>
              <span class="chip">多选 {{ preview.counts.multiple }}</span>
              <span class="chip">判断 {{ preview.counts.judge }}</span>
              <span class="chip">填空 {{ preview.counts.fill }}</span>
              <span class="chip">案例 {{ preview.counts.cases }}</span>
              <span class="chip">案例小题 {{ preview.counts.caseItems }}</span>
            </div>
            <label v-for="type in IMPORT_QUESTION_TYPES" :key="type" class="check-row">
              <input v-model="selectedTypes" type="checkbox" :value="type" />
              <span><strong>{{ typeLabels[type] }}</strong><small>导入该题型</small></span>
            </label>
            <div v-if="preview.issues.length" class="issue-list">
              <div v-for="(issue, index) in preview.issues" :key="index" class="issue" :class="issue.level">
                {{ issue.sheetName }} 第 {{ issue.row }} 行：{{ issue.message }}
              </div>
            </div>
            <div class="button-row">
              <button class="secondary-button" :disabled="importing" @click="preview = null">取消</button>
              <button class="primary-button" :disabled="importing || !selectedTypes.length || preview.issues.some(i => i.level === 'error')" @click="commitImport">
                {{ importing ? '正在导入…' : '确认导入' }}
              </button>
            </div>
          </section>
        </div>

        <div class="section-heading"><h2>已导入</h2><span>{{ store.data.sources.length }} 份</span></div>
        <EmptyState v-if="!store.data.sources.length" icon="▤" title="还没有题库" description="导入第一份 XLSX，应用会先校验内容再保存。" />
        <div v-for="source in store.data.sources" :key="source.id" class="source-slide">
          <button class="source-delete" :tabindex="openSourceId === source.id ? 0 : -1" :aria-hidden="openSourceId !== source.id" @click.stop="removeSource(source.id, source.name)">删除</button>
          <button
            class="card source-card"
            :class="{ dragging: draggingSourceId === source.id }"
            :style="{ transform: `translateX(${sourceOffset(source.id)}px)` }"
            @click="openSource(source.id)"
            @pointerdown="beginSourceDrag($event, source.id)"
            @pointermove="moveSourceDrag"
            @pointerup="endSourceDrag"
            @pointercancel="cancelSourceDrag"
          >
            <div class="source-icon">XLSX</div>
            <div class="grow">
              <h3>{{ source.name }}</h3>
              <p>{{ source.questionCount }} 道题 · {{ source.caseCount }} 个案例 · {{ new Date(source.importedAt).toLocaleDateString() }}</p>
              <div class="meta-row source-types">
                <span v-for="type in availableTypes(source.id)" :key="type" class="chip">{{ typeLabels[type] }} {{ typeCount(source.id, type) }}</span>
              </div>
            </div>
          </button>
        </div>
      </main>
      <div v-if="editingSource" class="modal-backdrop" @click.self="editingSource = null">
        <section class="card modal-card">
          <h3>选择导入题型</h3>
          <p>取消勾选的题型会从刷题范围隐藏，不会删除题目或学习记录，重新勾选即可恢复。</p>
          <label v-for="type in availableTypes(editingSource.sourceId)" :key="type" class="check-row">
            <input v-model="editingSource.types" type="checkbox" :value="type" />
            <span><strong>{{ typeLabels[type] }}</strong><small>共 {{ typeCount(editingSource.sourceId, type, false) }} 道可作答题目</small></span>
          </label>
          <div class="button-row"><button class="secondary-button" @click="editingSource = null">取消</button><button class="primary-button" @click="saveSourceSelection">保存</button></div>
        </section>
      </div>
      <LoadingOverlay v-if="parsing || importing" :text="parsing ? '正在解析 XLSX…' : '正在导入题库…'" />
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.modal-backdrop { position: fixed; z-index: 50; inset: 0; padding: 20px; display: grid; place-items: center; background: rgba(16,30,24,.42); }
.modal-card { width: min(100%, 520px); max-height: 85vh; overflow: auto; }
.source-slide { position: relative; overflow: hidden; border-radius: var(--radius); box-shadow: var(--shadow); }
.source-slide + .source-slide { margin-top: 12px; }
.source-card { position: relative; z-index: 1; width: 100%; border: 0; text-align: left; touch-action: pan-y; transition: transform .22s ease; }
.source-card.dragging { transition: none; }
.source-delete { position: absolute; z-index: 0; inset: 0 0 0 auto; width: 88px; border: 0; color: #fff; background: var(--danger); font: inherit; font-weight: 800; }
.source-types { margin-top: 9px; }
.source-types .chip { padding: 4px 7px; font-size: 10px; }
</style>
