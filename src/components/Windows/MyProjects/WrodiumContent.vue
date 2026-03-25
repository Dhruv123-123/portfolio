<template>
  <div class="text-xs md:text-header-window">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/python.svg" alt="Python icon" class="w-9 h-9" />
        <p class="font-bold">Python</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/javascript.svg" alt="JavaScript icon" class="w-9 h-9" />
        <p class="font-bold">Node.js</p>
      </div>
    </div>
    <h3 class="mt-5 mb-2 font-bold">Overview</h3>
    <p>
      Wrodium automates LLM-ready web indexing. It crawls websites, generates llms.txt manifests,
      and produces atomic, citation-ready claims that language models can consume directly.
      The system powers search-augmented generation workflows at scale.
    </p>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Key Achievements</h3>
    <ul class="list-disc ml-3">
      <li>LLM-ready indexing for 100+ pages/site at 90% link coverage via automated llms.txt manifests</li>
      <li>&lt;1% duplicate IDs across reruns using stable-hash deduplication on 5-30 atomic claims/page</li>
      <li>300+ cited outputs/day by normalizing prompt-answer-source pipelines at 100 prompts × 3 engines/day</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Technical Details</h3>
    <p>
      The crawler traverses site maps and follows internal links, extracting structured content and
      generating manifests conforming to the llms.txt specification. Each page is decomposed into
      atomic claims with stable hashes for deduplication. The pipeline supports multiple LLM engines
      and produces citation-annotated responses.
    </p>
  </div>
</template>
