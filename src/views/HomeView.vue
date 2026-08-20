<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { insertProjectId } from '@/domain/projectOrder'
import { useQuizStore } from '@/stores/quizStore'

const store = useQuizStore()
const showForm = ref(false)
const message = ref('')
const form = reactive({ name: '', description: '', sourceIds: [] as string[] })
const totalQuestions = computed(() => store.data.questions.filter((question) => question.enabled !== false && question.answerMode !== 'NONE').length)
const attempted = computed(() => store.data.learningStates.filter((state) => state.attemptCount > 0).length)
const displayOrder = ref<string[]>([])
const draggingProjectId = ref('')
const projectListElement = ref<HTMLElement>()
const dragGhostElement = ref<HTMLElement>()
const dragPreviewWidth = ref(0)
const displayedProjects = computed(() => store.data.projects.length
  ? displayOrder.value
    .map((id) => store.data.projects.find((project) => project.id === id))
    .filter((project): project is NonNullable<typeof project> => Boolean(project))
  : [])
const draggedProject = computed(() => store.data.projects.find((project) => project.id === draggingProjectId.value))
let longPressTimer: number | undefined
let insertTimer: number | undefined
let pendingOrderKey = ''
let suppressClickUntil = 0
let touchStartX = 0
let touchStartY = 0
let grabOffsetX = 0
let grabOffsetY = 0
let latestTouchX = 0
let latestTouchY = 0
let dragFrame: number | undefined
let finishingDrag = false
let geometryRefreshTimer: number | undefined
let dropBounds: { left: number; right: number; top: number; bottom: number } | null = null
let dropCenters: number[] = []

watch(
  () => store.data.projects.map((project) => project.id).join('|'),
  () => {
    if (!draggingProjectId.value) displayOrder.value = store.data.projects.map((project) => project.id)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.clearTimeout(longPressTimer)
  clearPendingInsertion()
  cancelDragFrame()
  clearDropGeometry()
  removeActiveDragListeners()
  document.body.classList.remove('project-drag-active')
})

function resetForm(): void {
  form.name = ''
  form.description = ''
  form.sourceIds = []
}

async function createProject(): Promise<void> {
  try {
    await store.saveProject(form)
    resetForm()
    showForm.value = false
    flash('项目已创建')
  } catch (error) {
    flash((error as Error).message)
  }
}

function startProjectPress(projectId: string, event: TouchEvent): void {
  const touch = event.touches[0]
  if (!touch) return
  const card = event.currentTarget as HTMLElement
  const rect = card.getBoundingClientRect()
  window.clearTimeout(longPressTimer)
  touchStartX = touch.clientX
  touchStartY = touch.clientY
  grabOffsetX = touch.clientX - rect.left
  grabOffsetY = touch.clientY - rect.top
  longPressTimer = window.setTimeout(() => {
    draggingProjectId.value = projectId
    displayOrder.value = store.data.projects.map((project) => project.id)
    dragPreviewWidth.value = rect.width
    latestTouchX = touchStartX
    latestTouchY = touchStartY
    document.body.classList.add('project-drag-active')
    addActiveDragListeners()
    refreshDropGeometry()
    scheduleDragFrame()
    navigator.vibrate?.(30)
  }, 520)
}

function trackProjectPress(event: TouchEvent): void {
  const touch = event.touches[0]
  if (!touch) return
  if (!draggingProjectId.value && Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY) > 10) {
    window.clearTimeout(longPressTimer)
  }
}

function addActiveDragListeners(): void {
  window.addEventListener('touchmove', moveActiveProject, { passive: false, capture: true })
  window.addEventListener('touchend', finishProjectPress, { capture: true })
  window.addEventListener('touchcancel', finishProjectPress, { capture: true })
}

function removeActiveDragListeners(): void {
  window.removeEventListener('touchmove', moveActiveProject, true)
  window.removeEventListener('touchend', finishProjectPress, true)
  window.removeEventListener('touchcancel', finishProjectPress, true)
}

function moveActiveProject(event: TouchEvent): void {
  const touch = event.touches[0]
  if (!touch || !draggingProjectId.value) return
  if (event.cancelable) event.preventDefault()
  latestTouchX = touch.clientX
  latestTouchY = touch.clientY
  scheduleDragFrame()
}

function scheduleDragFrame(): void {
  if (dragFrame !== undefined || !draggingProjectId.value) return
  dragFrame = window.requestAnimationFrame(renderDragFrame)
}

function renderDragFrame(): void {
  dragFrame = undefined
  if (!draggingProjectId.value) return
  positionDragGhost()
  queueProjectInsertion(latestTouchX, latestTouchY)
}

function positionDragGhost(): void {
  const ghost = dragGhostElement.value
  if (!ghost) return
  const x = latestTouchX - grabOffsetX
  const y = latestTouchY - grabOffsetY
  ghost.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.025) rotate(.4deg)`
  ghost.style.visibility = 'visible'
}

function cancelDragFrame(): void {
  if (dragFrame === undefined) return
  window.cancelAnimationFrame(dragFrame)
  dragFrame = undefined
}

function queueProjectInsertion(clientX: number, clientY: number): void {
  if (!dropBounds) return clearPendingInsertion()
  if (clientX < dropBounds.left - 24 || clientX > dropBounds.right + 24
    || clientY < dropBounds.top - 44 || clientY > dropBounds.bottom + 44) {
    return clearPendingInsertion()
  }
  let insertIndex = dropCenters.length
  for (let index = 0; index < dropCenters.length; index += 1) {
    if (clientY < dropCenters[index]!) {
      insertIndex = index
      break
    }
  }
  const nextOrder = insertProjectId(displayOrder.value, draggingProjectId.value, insertIndex)
  const nextOrderKey = nextOrder.join('|')
  if (nextOrderKey === displayOrder.value.join('|')) return clearPendingInsertion()
  if (pendingOrderKey === nextOrderKey) return
  clearPendingInsertion()
  pendingOrderKey = nextOrderKey
  insertTimer = window.setTimeout(() => {
    displayOrder.value = nextOrder
    pendingOrderKey = ''
    insertTimer = undefined
    scheduleDropGeometryRefresh()
    navigator.vibrate?.(18)
  }, 500)
}

function refreshDropGeometry(): void {
  const list = projectListElement.value
  if (!list || !draggingProjectId.value) return clearDropGeometry()
  const listRect = list.getBoundingClientRect()
  dropBounds = { left: listRect.left, right: listRect.right, top: listRect.top, bottom: listRect.bottom }
  dropCenters = [...list.querySelectorAll<HTMLElement>('[data-project-id]')]
    .filter((card) => card.dataset.projectId !== draggingProjectId.value)
    .map((card) => {
      const rect = card.getBoundingClientRect()
      return rect.top + rect.height / 2
    })
}

function scheduleDropGeometryRefresh(): void {
  window.clearTimeout(geometryRefreshTimer)
  geometryRefreshTimer = window.setTimeout(() => {
    geometryRefreshTimer = undefined
    refreshDropGeometry()
    queueProjectInsertion(latestTouchX, latestTouchY)
  }, 340)
}

function clearDropGeometry(): void {
  window.clearTimeout(geometryRefreshTimer)
  geometryRefreshTimer = undefined
  dropBounds = null
  dropCenters = []
}

function clearPendingInsertion(): void {
  window.clearTimeout(insertTimer)
  insertTimer = undefined
  pendingOrderKey = ''
}

async function finishProjectPress(event?: Event): Promise<void> {
  window.clearTimeout(longPressTimer)
  if (!draggingProjectId.value || finishingDrag) return
  finishingDrag = true
  if (event?.cancelable) event.preventDefault()
  clearPendingInsertion()
  cancelDragFrame()
  positionDragGhost()
  clearDropGeometry()
  removeActiveDragListeners()
  document.body.classList.remove('project-drag-active')
  suppressClickUntil = Date.now() + 500
  const projectId = draggingProjectId.value
  const finalOrder = [...displayOrder.value]
  const saveResult = store.reorderProjects(finalOrder).then(() => null, (error: unknown) => error)
  await settleDraggedProject(projectId)
  const saveError = await saveResult
  draggingProjectId.value = ''
  finishingDrag = false
  if (saveError) {
    displayOrder.value = store.data.projects.map((project) => project.id)
    flash(`排序保存失败：${(saveError as Error).message}`)
  }
}

async function settleDraggedProject(projectId: string): Promise<void> {
  await nextTick()
  const ghost = dragGhostElement.value
  const target = [...(projectListElement.value?.querySelectorAll<HTMLElement>('[data-project-id]') ?? [])]
    .find((card) => card.dataset.projectId === projectId)
  if (!ghost || !target) return
  const currentRect = ghost.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const targetTransform = window.getComputedStyle(target).transform
  let targetLeft = targetRect.left
  let targetTop = targetRect.top
  if (targetTransform !== 'none') {
    const matrix = new DOMMatrixReadOnly(targetTransform)
    targetLeft -= matrix.m41
    targetTop -= matrix.m42
  }
  if (Math.hypot(currentRect.left - targetLeft, currentRect.top - targetTop) < 2) return

  await new Promise<void>((resolve) => {
    let completed = false
    const finish = (): void => {
      if (completed) return
      completed = true
      window.clearTimeout(fallbackTimer)
      ghost.removeEventListener('transitionend', onTransitionEnd)
      resolve()
    }
    const onTransitionEnd = (transitionEvent: TransitionEvent): void => {
      if (transitionEvent.propertyName === 'transform') finish()
    }
    const fallbackTimer = window.setTimeout(finish, 520)
    ghost.addEventListener('transitionend', onTransitionEnd)
    void ghost.offsetWidth
    ghost.classList.add('settling')
    ghost.style.transform = `translate3d(${targetLeft}px, ${targetTop}px, 0) scale(1) rotate(0deg)`
  })
}

function cancelProjectPress(event: TouchEvent): void {
  window.clearTimeout(longPressTimer)
  if (draggingProjectId.value) void finishProjectPress(event)
}

function preventClickAfterDrag(event: MouseEvent): void {
  if (draggingProjectId.value || Date.now() < suppressClickUntil) event.preventDefault()
}

function flash(text: string): void {
  message.value = text
  window.setTimeout(() => { message.value = '' }, 2200)
}
</script>

<template>
  <IonPage>
    <AppHeader title="知题" subtitle="把每一次作答，变成看得见的进步" />
    <IonContent :fullscreen="true">
      <main class="page-content">
        <section class="hero">
          <p class="eyebrow">OFFLINE STUDY</p>
          <h2>{{ store.data.projects.length ? `已有 ${store.data.projects.length} 个刷题项目` : '从一份题库开始积累' }}</h2>
          <p>共 {{ totalQuestions }} 道可作答题目 · 已学习 {{ attempted }} 道</p>
        </section>

        <section v-if="showForm" class="card form-card">
          <h3>创建刷题项目</h3>
          <label class="field"><span>项目名称</span><input v-model="form.name" maxlength="40" placeholder="例如：消防工程师冲刺" /></label>
          <label class="field"><span>项目说明</span><textarea v-model="form.description" rows="2" placeholder="可选"></textarea></label>
          <span class="field"><span>选择 XLSX 题库</span></span>
          <label v-for="source in store.data.sources" :key="source.id" class="check-row">
            <input v-model="form.sourceIds" type="checkbox" :value="source.id" />
            <span><strong>{{ source.name }}</strong><small>{{ source.questionCount }} 道题 · {{ source.caseCount }} 个案例</small></span>
          </label>
          <p v-if="!store.data.sources.length">请先到“题库”页面导入 XLSX。</p>
          <div class="button-row">
            <button class="secondary-button" @click="showForm = false">取消</button>
            <button class="primary-button" @click="createProject">创建</button>
          </div>
        </section>

        <div class="section-heading"><h2>我的项目</h2><span>{{ store.data.projects.length }} 个</span></div>
        <EmptyState v-if="!store.data.projects.length" icon="＋" title="还没有刷题项目" description="先导入 XLSX 题库，再把一个或多个题库组合成项目。">
          <button class="primary-button" @click="showForm = true">创建第一个项目</button>
        </EmptyState>
        <div v-if="store.data.projects.length" ref="projectListElement" class="project-list">
          <TransitionGroup name="project-list">
            <RouterLink
              v-for="project in displayedProjects"
              :key="project.id"
              :to="`/project/${project.id}`"
              class="card project-card"
              :class="{ dragging: draggingProjectId === project.id }"
              :data-project-id="project.id"
              @click="preventClickAfterDrag"
              @contextmenu.prevent
              @touchstart="startProjectPress(project.id, $event)"
              @touchmove="trackProjectPress"
              @touchend="finishProjectPress"
              @touchcancel="cancelProjectPress"
            >
              <h3>{{ project.name }}</h3>
              <p v-if="project.description">{{ project.description }}</p>
              <div class="meta-row">
                <span class="chip">{{ project.sourceIds.length }} 份题库</span>
                <span class="chip">{{ store.getProjectStats(project.id).total }} 道题</span>
                <span v-if="store.getProjectStats(project.id).wrongActive" class="chip danger">{{ store.getProjectStats(project.id).wrongActive }} 道错题</span>
              </div>
              <span class="arrow">›</span>
            </RouterLink>
          </TransitionGroup>
        </div>
      </main>
      <Teleport to="body">
        <div
          v-if="draggedProject"
          ref="dragGhostElement"
          class="card project-card project-drag-ghost"
          :style="{ width: `${dragPreviewWidth}px` }"
          aria-hidden="true"
        >
          <h3>{{ draggedProject.name }}</h3>
          <p v-if="draggedProject.description">{{ draggedProject.description }}</p>
          <div class="meta-row">
            <span class="chip">{{ draggedProject.sourceIds.length }} 份题库</span>
            <span class="chip">{{ store.getProjectStats(draggedProject.id).total }} 道题</span>
            <span v-if="store.getProjectStats(draggedProject.id).wrongActive" class="chip danger">{{ store.getProjectStats(draggedProject.id).wrongActive }} 道错题</span>
          </div>
          <span class="arrow">›</span>
        </div>
      </Teleport>
      <button v-if="!showForm" class="fab" aria-label="创建项目" @click="showForm = true">＋</button>
      <div v-if="message" class="toast">{{ message }}</div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.project-list { position: relative; }
.project-card { touch-action: pan-y; user-select: none; -webkit-user-select: none; }
.project-card.dragging { opacity: 0; }
.project-list-move { transition: transform .32s cubic-bezier(.22, .8, .3, 1); }
.project-drag-ghost {
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  margin: 0 !important;
  pointer-events: none;
  touch-action: none;
  visibility: hidden;
  opacity: .96;
  box-shadow: 0 18px 42px rgba(16, 30, 24, .24);
  will-change: transform;
}
.project-drag-ghost.settling {
  transition: transform .42s cubic-bezier(.2, .78, .24, 1);
}
:global(body.project-drag-active) { user-select: none; -webkit-user-select: none; }
</style>
