<script setup lang="ts">
import FavoriteIcon from './FavoriteIcon.vue'
import AppIcon from './AppIcon.vue'

defineProps<{ icon: string; title: string; description: string }>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      <FavoriteIcon v-if="icon === 'favorite'" />
      <AppIcon v-else-if="icon === 'history' || icon === 'wrong' || icon === 'note'" :name="icon" />
      <span v-else>{{ icon }}</span>
    </div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>
