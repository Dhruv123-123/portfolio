<template>
  <div class="text-xs md:text-header-window">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/python.svg" alt="Python icon" class="w-9 h-9" />
        <p class="font-bold">Python</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/tensorflow.svg" alt="TensorFlow icon" class="w-9 h-9" />
        <p class="font-bold">TF.js</p>
      </div>
    </div>
    <h3 class="mt-5 mb-2 font-bold">Overview</h3>
    <p>
      CubeCoach is a real-time Rubik's Cube move classifier that uses YOLOv8 for cube-face detection,
      MediaPipe for hand-landmark tracking, and TensorFlow.js for in-browser inference. It watches you
      solve and identifies each move as you make it, providing instant feedback and analytics.
    </p>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Key Achievements</h3>
    <ul class="list-disc ml-3">
      <li>Real-time cube state recognition using YOLOv8 custom-trained object detection</li>
      <li>Hand tracking via MediaPipe for move segmentation without manual input</li>
      <li>Client-side inference with TensorFlow.js — no server round-trip required</li>
      <li>Solve analytics: tracks move count, TPS, and per-step breakdowns</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Technical Details</h3>
    <p>
      The pipeline captures webcam frames, runs YOLOv8 to detect the cube and its colored facets,
      then uses MediaPipe hand landmarks to determine which hand is gripping and which face is being turned.
      Move classification happens frame-by-frame in TF.js, giving sub-100ms feedback per move.
    </p>
  </div>
</template>
