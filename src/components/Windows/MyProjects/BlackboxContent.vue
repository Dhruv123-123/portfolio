<template>
  <div class="text-xs md:text-header-window">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/python.svg" alt="Python icon" class="w-9 h-9" />
        <p class="font-bold">Python</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/web.svg" alt="Web icon" class="w-9 h-9" />
        <p class="font-bold">Vue + three.js</p>
      </div>
    </div>
    <h3 class="mt-5 mb-2 font-bold">Overview</h3>
    <p>
      <strong>Blackbox</strong> ingests final accident reports from the NTSB, BEA, AAIB, TSB, ATSB and other investigation
      agencies, extracts findings and contributing factors into a controlled taxonomy with an LLM, and links them into one
      cross-agency <strong>knowledge graph</strong>. You can then ask it things like
      <em>"every accident where a blocked pitot tube led to unreliable airspeed that was misdiagnosed as a stall"</em>
      and get back the accidents whose causal chain actually runs that way.
    </p>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Three tools</h3>
    <ul class="list-disc ml-3">
      <li><strong>Graph &amp; search</strong> — force-directed graph of accidents and factors; concept-path queries, BM25 and optional in-browser semantic search; per-factor "what leads to it / what it leads to" statistics</li>
      <li><strong>FDR replay</strong> — synchronized 3D replay of reconstructed flight-data-recorder traces with an Airbus-style PFD, control positions, parameter strips and the CVR transcript scrolling alongside</li>
      <li><strong>Timeline builder</strong> — Cloudberg-style event chains with aircraft state at each step, linked recommendations, a causal DAG, agency dissent, side-by-side comparison of two accidents, and a generated narrative</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">And the immersive layer</h3>
    <ul class="list-disc ml-3">
      <li><strong>Atlas</strong> — a globe of nearly ten thousand accidents; play the century and the crashes draw the coastlines</li>
      <li><strong>Story mode</strong> — any accident told as a documentary, beat by beat, with instrument readouts and CVR lines</li>
      <li><strong>Cockpit &amp; sound</strong> — head-up display, cinematic cameras, night, weather and lightning from the record; engines, warnings and GPWS call-outs synthesized live in the browser</li>
      <li><strong>Counterfactuals</strong> — which factor, if absent, would have broken the causal chain, across the whole corpus</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Pipeline</h3>
    <pre class="text-xxs bg-gray-100 p-2 rounded overflow-x-auto font-mono leading-relaxed">pip install -r blackbox/pipeline/requirements.txt
python3 blackbox/pipeline/fetch_reports.py af447     # download the final report
python3 blackbox/pipeline/extract_text.py af447      # PDF -> page-marked text
python3 blackbox/pipeline/extract_graph.py af447     # Claude structured extraction
python3 blackbox/pipeline/validate.py                # taxonomy + schema checks
python3 blackbox/pipeline/build_graph.py             # -> src/data/blackbox/graph.json
node blackbox/pipeline/build_embeddings.mjs          # semantic vectors</pre>
    <br />
    <div class="mt-5 flex flex-col gap-2">
      <button
        class="w-full flex flex-row items-center gap-1 cursor-pointer transition-all hover:underline hover:text-heroic-blue text-left"
        @click="openWindow('blackbox')"
      >
        <img src="/img/icons/blackbox/blackbox-icon-sm.svg" alt="" class="w-5 h-5" />
        <span>Open Blackbox</span>
      </button>
      <div class="w-full flex flex-row items-center gap-0.5 cursor-pointer transition-all hover:underline hover:text-heroic-blue hover:fill-heroic-blue">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" class="fill-current">
          <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2" />
        </svg>
        <a rel="noopener" href="https://github.com/Dhruv123-123/portfolio/tree/main/blackbox" target="_blank" class="cursor-pointer">{{ $t('buttons.linkRepository') }}</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue'
const openWindow = inject('openWindow', () => {})
</script>
