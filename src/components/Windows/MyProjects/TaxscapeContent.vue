<template>
  <div class="text-xs md:text-header-window">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/javascript.svg" alt="JavaScript icon" class="w-9 h-9" />
        <p class="font-bold">TypeScript</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/python.svg" alt="Python icon" class="w-9 h-9" />
        <p class="font-bold">Python</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/web.svg" alt="Web icon" class="w-9 h-9" />
        <p class="font-bold">AI / ML</p>
      </div>
    </div>
    <h3 class="mt-5 mb-2 font-bold">Overview</h3>
    <p>
      TaxScape is an AI-powered R&amp;D tax credit platform that helps CPA firms and in-house teams
      identify, classify, and document qualified research expenses under IRC Section 41. The product
      automates payroll and GL ingestion, employee classification, and contemporaneous documentation
      so credit studies move from weeks of manual work to a guided, review-ready workflow.
    </p>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Key Features</h3>
    <ul class="list-disc ml-3">
      <li>AI classification agent reviews employees, projects, and expenses to surface QREs for expert review</li>
      <li>Interview agent runs structured R&amp;D team interviews and summarizes findings for audit-ready records</li>
      <li>Document processing agent extracts payroll, GL, and invoice data into clean verification summaries</li>
      <li>Workflow orchestration coordinates agents and escalates decisions at every compliance checkpoint</li>
    </ul>
    <br />
    <h3 class="mt-2 mb-2 font-bold">Impact</h3>
    <p>
      Built for startups through enterprise teams, TaxScape targets faster data gathering, stronger
      credit outcomes, and documentation that holds up under scrutiny — with tailored paths for CPA
      firms and in-house tax teams.
    </p>
    <div
      class="w-full justify-center mt-5 mb-2 flex flex-row items-center gap-0.5 cursor-pointer transition-all hover:underline hover:text-heroic-blue hover:fill-heroic-blue"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" class="fill-current">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
        />
      </svg>
      <a rel="noopener" href="https://www.taxscape.ai/" target="_blank" class="cursor-pointer">
        {{ $t('buttons.linkWebSite') }}
      </a>
    </div>
  </div>
</template>
