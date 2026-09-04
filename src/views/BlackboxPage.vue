<template>
  <MetaUpdater />
  <div class="bbp-page">
    <Blackbox :deep-links="true" home="/" source="https://github.com/Dhruv123-123/portfolio/tree/main/blackbox" />
  </div>
</template>

<script setup>
import MetaUpdater from '../MetaUpdater.vue'
import Blackbox from '@/components/Windows/Blackbox/Blackbox.vue'
</script>

<style scoped>
.bbp-page { height: 100svh; width: 100vw; background: #0e1116; }
</style>
