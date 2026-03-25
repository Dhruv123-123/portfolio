<template>
  <div class="text-xs md:text-header-window">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/javascript.svg" alt="JavaScript icon" class="w-9 h-9" />
        <p class="font-bold">JavaScript</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/tensorflow.svg" alt="TensorFlow icon" class="w-9 h-9" />
        <p class="font-bold">TF.js</p>
      </div>
    </div>
    <h3 class="mt-5 mb-2 font-bold">Overview</h3>
    <p>
      ModelArena is a client-side machine learning experimentation platform that lets users build, train,
      and compare ML models entirely in the browser. It features a drag-and-drop interface for constructing
      reinforcement-learning agents, neural network architectures, and training pipelines — all without
      any backend.
    </p>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Key Achievements</h3>
    <ul class="list-disc ml-3">
      <li>Fully client-side training via TensorFlow.js and WebGL acceleration</li>
      <li>Drag-and-drop RL training environment with visual agent behavior playback</li>
      <li>Side-by-side model comparison with real-time metrics dashboards</li>
      <li>Exportable model artifacts for deployment or further experimentation</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Technical Details</h3>
    <p>
      Users compose model architectures visually, then kick off training loops that run entirely
      in the browser tab using Web Workers for parallel execution. The platform supports DQN, PPO,
      and custom policy-gradient methods. Training progress, loss curves, and reward graphs are
      rendered live with Chart.js.
    </p>
  </div>
</template>
