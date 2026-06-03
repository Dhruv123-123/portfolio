<template>
  <div class="text-xs md:text-header-window">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/python.svg" alt="Python icon" class="w-9 h-9" />
        <p class="font-bold">Python</p>
      </div>
    </div>
    <h3 class="mt-5 mb-2 font-bold">Overview</h3>
    <p>
      At Actor Labs, I built end-to-end data infrastructure for field robotics: ingesting
      multi-terabyte sensor streams (RTK GPS, LiDAR, camera), cleaning and fusing them with
      Python/SQL ETL, and feeding curated datasets into detection models and stakeholder dashboards.
    </p>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Key Achievements</h3>
    <ul class="list-disc ml-3">
      <li>End-to-end pipelines from raw field sensors into a queryable store for reproducible analysis and model training</li>
      <li>Python/SQL ETL workflows that powered a 72% mAP@0.5 detection model on the curated dataset</li>
      <li>Automated dashboards and metrics replacing manual ad-hoc field-deployment reporting</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Technical Details</h3>
    <p>
      Pipelines normalized RTK, LiDAR, and camera feeds at scale, with fused aggregates and
      validation checks before training. Downstream CV work used the curated dataset for
      farmland object detection; operational metrics were surfaced to the team through
      automated reporting instead of one-off spreadsheets.
    </p>
  </div>
</template>
