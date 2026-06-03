<template>
  <div class="text-xs md:text-header-window hardware-project">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1 mb-4">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/looping.svg" alt="SolidWorks icon" class="w-9 h-9" />
        <p class="font-bold">SolidWorks</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/figma.svg" alt="Rendering icon" class="w-9 h-9" />
        <p class="font-bold">Rendering</p>
      </div>
    </div>

    <h3 class="mt-2 mb-2 font-bold">Overview</h3>
    <p>
      Full SolidWorks CAD of a high-school product prototype: a compact electric utility pushcart with
      an operator canopy, handlebar steering, and an open tubular cargo frame on casters. This was my
      first CAD project — I learned patterning for efficient modeling, spline-based surfacing for the
      canopy, fillets for comfort and presentation, plus drafting and photorealistic rendering for
      manufacturing quotes.
    </p>

    <figure class="my-4">
      <img
        src="/img/projects/hardware/pushcart-cad.png"
        alt="SolidWorks render of electric pushcart prototype"
        class="w-full max-w-2xl rounded border border-gray-300 shadow-sm"
      />
      <figcaption class="text-xxs text-gray-600 mt-1 italic">Photorealistic render — drivetrain housing, canopy, cargo frame, and caster layout</figcaption>
    </figure>

    <h3 class="mt-4 mb-2 font-bold">Design Highlights</h3>
    <ul class="list-disc ml-3 space-y-1">
      <li>Feature patterns to reuse geometry and speed design iteration</li>
      <li>Spline-driven canopy for smooth operator coverage</li>
      <li>Fillets on edges for ergonomics and cleaner manufacturing transitions</li>
      <li>2D drawings with dimensions for fabrication</li>
      <li>Material finishes and lighting studies for stakeholder presentations</li>
    </ul>

    <h3 class="mt-4 mb-2 font-bold">Technical Specifications</h3>
    <table class="spec-table w-full text-xxs md:text-xs mb-4">
      <tbody>
        <tr><th>Project</th><td>Electric utility pushcart (product prototype)</td></tr>
        <tr><th>CAD platform</th><td>Dassault SolidWorks</td></tr>
        <tr><th>Configuration</th><td>Front operator pod + rear open cargo bed</td></tr>
        <tr><th>Steering</th><td>Handlebar-actuated front wheel</td></tr>
        <tr><th>Chassis</th><td>Tubular frame with rectangular tube side rails</td></tr>
        <tr><th>Mobility</th><td>Front drive wheel + rear caster set (5-wheel layout)</td></tr>
        <tr><th>Canopy</th><td>Single-piece curved shell over operator station</td></tr>
        <tr><th>Deliverables</th><td>3D assembly, manufacturing drawings, rendered visuals</td></tr>
        <tr><th>Timeline</th><td>High school — first CAD / design-for-manufacture project</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.spec-table {
  border-collapse: collapse;
  font-family: 'Tahoma', sans-serif;
}
.spec-table th,
.spec-table td {
  border: 1px solid #c0c0c0;
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.spec-table th {
  background: #ece9d8;
  font-weight: 600;
  width: 32%;
}
.spec-table tr:nth-child(even) td {
  background: #f8f8f8;
}
</style>
