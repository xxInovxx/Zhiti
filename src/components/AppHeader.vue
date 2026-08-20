<script setup lang="ts">
import { IonHeader, IonToolbar } from '@ionic/vue'
import { useRouter } from 'vue-router'

const props = defineProps<{ title: string; subtitle?: string; back?: boolean; customBack?: boolean }>()
const emit = defineEmits<{ back: [] }>()
const router = useRouter()

function handleBack(): void {
  if (props.customBack) emit('back')
  else router.back()
}
</script>

<template>
  <IonHeader class="app-header" :translucent="true">
    <IonToolbar>
      <div class="header-inner">
        <button v-if="back" class="icon-button" aria-label="返回" @click="handleBack">←</button>
        <div>
          <h1>{{ title }}</h1>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <slot />
      </div>
    </IonToolbar>
  </IonHeader>
</template>
