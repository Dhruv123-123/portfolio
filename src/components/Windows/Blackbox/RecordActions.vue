<template>
  <div class="bb-actions ra-root">
    <button v-if="showGraph" class="bb-btn small" @click="store.openGraph(record.id)">Graph</button>
    <button v-if="hasEvents && current !== 'timeline'" class="bb-btn small" @click="store.openTimeline(record.id)">Timeline</button>
    <button v-if="record.fdr && current !== 'replay'" class="bb-btn small" @click="store.openReplay(record.id)">Replay</button>
    <button v-if="hasEvents" class="bb-btn small" @click="store.openStory(record.id)" title="Documentary walkthrough">Story</button>
    <button v-if="record.fdr" class="bb-btn small" @click="store.openFlightGear(record.id)" title="Export a FlightGear package or drive a running FlightGear">FlightGear</button>
    <button v-if="record.curated_id && index && index.byId[record.curated_id]" class="bb-btn small" @click="store.openGraph(record.curated_id)">Reviewed record</button>
    <a :href="wikipediaUrl(record)" target="_blank" rel="noopener" class="bb-btn small ghost ra-wiki">{{ hasWikipediaArticle(record) ? 'Wikipedia' : 'Search Wikipedia' }} <span class="ra-ext">↗</span></a>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useBlackboxStore } from '@/stores/blackboxStore'
import { wikipediaUrl, hasWikipediaArticle } from './lib/geo.js'

const props = defineProps({ record: { type: Object, required: true }, index: Object, current: { type: String, default: '' }, showGraph: { type: Boolean, default: false } })
const store = useBlackboxStore()
const hasEvents = computed(() => !!(props.record.events && props.record.events.length))
</script>

<style scoped>
.ra-wiki { color: var(--bb-blue); }
.ra-wiki:hover { color: var(--bb-blue); text-decoration: underline; background: transparent; }
.ra-ext { font-size: 10px; }
</style>
