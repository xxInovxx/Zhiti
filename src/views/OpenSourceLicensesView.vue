<script setup lang="ts">
import { IonContent, IonPage } from '@ionic/vue'
import AppHeader from '@/components/AppHeader.vue'
import { openSourceComponents } from '@/licenses/openSourceComponents'
import thirdPartyNotices from '../../THIRD_PARTY_NOTICES.md?raw'
</script>

<template>
  <IonPage>
    <AppHeader title="开源许可" subtitle="感谢开源社区的工作" :back="true" />
    <IonContent :fullscreen="true">
      <main class="page-content no-nav licenses-page">
        <section class="card license-intro">
          <div class="license-mark" aria-hidden="true">〈/〉</div>
          <div>
            <h2>第三方开源软件</h2>
            <p>知题使用了以下开源组件。各组件的版权归原作者所有，并依照其许可证使用和分发。</p>
          </div>
        </section>

        <div class="section-heading">
          <h2>组件清单</h2>
          <span>{{ openSourceComponents.length }} 项</span>
        </div>
        <section class="license-list" aria-label="开源组件清单">
          <details v-for="component in openSourceComponents" :key="component.name" class="license-component">
            <summary>
              <span>
                <strong>{{ component.name }}</strong>
                <small>{{ component.version }} · {{ component.license }}</small>
              </span>
              <span class="disclosure-icon" aria-hidden="true">⌄</span>
            </summary>
            <div class="license-component-body">
              <p>{{ component.purpose }}</p>
              <p class="copyright-notice">{{ component.copyright }}</p>
              <a :href="component.url" target="_blank" rel="noopener noreferrer">查看项目源码与许可证 ↗</a>
            </div>
          </details>
        </section>

        <div class="section-heading">
          <h2>完整声明</h2>
          <span>许可证原文</span>
        </div>
        <details class="card complete-notices">
          <summary>查看完整第三方声明与许可证文本</summary>
          <pre>{{ thirdPartyNotices }}</pre>
        </details>
      </main>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.licenses-page { max-width: 760px; }
.license-intro { display: flex; gap: 15px; align-items: flex-start; }
.license-intro h2 { margin: 1px 0 7px; font-size: 18px; }
.license-mark { width: 48px; height: 48px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 15px; color: var(--primary); background: var(--primary-soft); font-size: 15px; font-weight: 900; }
.license-list { overflow: hidden; border: 1px solid var(--card-border); border-radius: var(--radius); background: var(--paper); box-shadow: var(--shadow); }
.license-component + .license-component { border-top: 1px solid var(--line); }
.license-component summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 66px; padding: 13px 16px; cursor: pointer; list-style: none; }
.license-component summary::-webkit-details-marker { display: none; }
.license-component summary strong, .license-component summary small { display: block; }
.license-component summary strong { font-size: 14px; line-height: 1.4; }
.license-component summary small { margin-top: 4px; color: var(--muted); font-size: 11px; }
.disclosure-icon { color: var(--primary); transition: transform .2s ease; }
.license-component[open] .disclosure-icon { transform: rotate(180deg); }
.license-component-body { padding: 0 16px 16px; }
.license-component-body p { margin: 0 0 7px; color: var(--muted); font-size: 12px; line-height: 1.6; }
.license-component-body .copyright-notice { color: var(--ink); white-space: pre-wrap; }
.license-component-body a { color: var(--primary); font-size: 12px; font-weight: 800; }
.complete-notices summary { cursor: pointer; color: var(--primary); font-size: 14px; font-weight: 800; }
.complete-notices pre { margin: 18px 0 0; padding-top: 18px; border-top: 1px solid var(--line); color: var(--review-code-ink); font: 11px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
