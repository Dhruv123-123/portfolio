<template>
  <div class="text-xs md:text-header-window">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/python.svg" alt="Python icon" class="w-9 h-9" />
        <p class="font-bold">Python</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/web.svg" alt="Web icon" class="w-9 h-9" />
        <p class="font-bold">PyPI</p>
      </div>
    </div>
    <h3 class="mt-5 mb-2 font-bold">Overview</h3>
    <p>
      <strong>Crucible</strong> is an open-source VLA policy validation framework — stress-test your
      robot policy before the real world does. Wrap any Vision-Language-Action model behind a
      <code class="text-xxs">PolicyAdapter</code>, run Latin Hypercube perturbation sweeps across
      seven canonical dimensions, and get structured Markdown, HTML, or JSON reports with a
      <strong>PASS / CONDITIONAL / FAIL</strong> tier verdict for CI gates.
    </p>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Capabilities</h3>
    <ul class="list-disc ml-3">
      <li><strong>Perturbation sweeps</strong> — LHS sampling across camera, lighting, layout, init state, and more to find where policies break</li>
      <li><strong>Failure detection</strong> — SAFE-style MLP probes with conformal prediction bounds</li>
      <li><strong>Red team engine</strong> — ERT adversarial instructions, linguistic attacks, and RoboMonkey-style action-space verification</li>
      <li><strong>Structured reports</strong> — fragility charts, recommendations, and tier verdicts (nominal ≥70% &amp; perturbed ≥50% for PASS)</li>
      <li><strong>Pluggable adapters</strong> — OpenVLA, mock policies, or any custom VLA; no framework lock-in</li>
      <li><strong>Live dashboard</strong> — Rich terminal UI with real-time success rates and episode logs during eval runs</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Get started</h3>
    <pre class="text-xxs bg-gray-100 p-2 rounded overflow-x-auto font-mono leading-relaxed">pip install crucible-vla

# Or from source
git clone https://github.com/Dhruv123-123/crucible.git
cd crucible &amp;&amp; pip install -e ".[dev]"

# Quick eval (~15s with mock adapters)
crucible eval -c examples/configs/default.yaml -s quick</pre>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Technical details</h3>
    <p>
      The engine unifies perturbation benchmarking (LIBERO-plus-style dims), SAFE failure detection,
      embodied red teaming, and SimplerEnv-inspired evaluation into one pipeline: policy in,
      sweeps + optional red team phase, tier-scored <code class="text-xxs">RunReport</code> out.
      Suites range from <code class="text-xxs">quick</code> (50 LHS samples, ~15s) to
      <code class="text-xxs">full</code> (500 samples) for comprehensive audits.
    </p>
    <div class="mt-5 flex flex-col gap-2">
      <div
        class="w-full flex flex-row items-center gap-0.5 cursor-pointer transition-all hover:underline hover:text-heroic-blue hover:fill-heroic-blue"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" class="fill-current">
          <path
            d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
          />
        </svg>
        <a rel="noopener" href="https://github.com/Dhruv123-123/crucible" target="_blank" class="cursor-pointer">
          {{ $t('buttons.linkRepository') }}
        </a>
      </div>
      <div
        class="w-full flex flex-row items-center gap-0.5 cursor-pointer transition-all hover:underline hover:text-heroic-blue"
      >
        <img src="/img/icons/projects/tools/web.svg" alt="" class="w-5 h-5" />
        <a rel="noopener" href="https://crucible-bay.vercel.app/#install" target="_blank" class="cursor-pointer">
          {{ $t('buttons.linkWebSite') }} (install &amp; docs)
        </a>
      </div>
    </div>
  </div>
</template>
