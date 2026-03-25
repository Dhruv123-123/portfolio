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
      At Acre Robotics, I built a custom end-to-end computer vision pipeline for autonomous
      farmland detection. The system uses YOLOv8 models trained on aerial imagery to identify
      crop rows, weeds, and terrain features for precision agriculture robots.
    </p>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Key Achievements</h3>
    <ul class="list-disc ml-3">
      <li>72% mAP@0.5 on farmland object detection with a custom YOLOv8 pipeline</li>
      <li>±8mm sensor-alignment repeatability via custom 3D-printed RTK and LiDAR hardware mounts</li>
      <li>Co-authored pitch decks and ROI models that secured a $750K pre-seed round</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Technical Details</h3>
    <p>
      The CV pipeline ingests multi-spectral aerial and ground-level imagery, runs inference
      through a fine-tuned YOLOv8 model, and outputs bounding boxes with class labels for
      actionable field zones. I also designed precision hardware mounts for RTK-GPS and LiDAR
      sensors to ensure sub-centimeter alignment on the robotic platform.
    </p>
  </div>
</template>
