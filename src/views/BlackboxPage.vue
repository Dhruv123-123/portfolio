<template>
  <MetaUpdater />
  <div class="bbp-page">
    <div class="bbp-bar">
      <router-link to="/" class="bbp-home">← dhruvramasubban.com</router-link>
      <span class="bbp-title">Blackbox · aviation accident knowledge graph</span>
      <a href="https://github.com/Dhruv123-123/portfolio/tree/main/blackbox" target="_blank" rel="noopener" class="bbp-home">source</a>
    </div>
    <div class="bbp-frame">
      <Blackbox :deep-links="true" />
    </div>
  </div>
</template>

<script setup>
import MetaUpdater from '../MetaUpdater.vue'
import Blackbox from '@/components/Windows/Blackbox/Blackbox.vue'
</script>

<style scoped>
.bbp-page { height: 100svh; width: 100vw; display: flex; flex-direction: column; background: #070a12; }
.bbp-bar { height: 28px; display: flex; align-items: center; gap: 16px; padding: 0 12px; background: #05080f; border-bottom: 1px solid #26334d; font-family: Tahoma, Verdana, sans-serif; font-size: 11px; color: #8fa3c7; }
.bbp-title { flex: 1; text-align: center; color: #e6eefc; letter-spacing: 0.05em; }
.bbp-home { color: #8fa3c7; text-decoration: none; }
.bbp-home:hover { color: #ffbf00; }
.bbp-frame { flex: 1; min-height: 0; position: relative; }
.bbp-frame :deep(.bb-root) { padding-top: 0; }
</style>
