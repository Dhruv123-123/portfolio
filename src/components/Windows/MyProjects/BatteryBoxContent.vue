<template>
  <div class="text-xs md:text-header-window hardware-project">
    <div class="flex w-full text-xxs md:text-xs items-center justify-start ml-px flex-wrap gap-4 md:min-w-80 md:ml-1 mb-4">
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/cpu.svg" alt="CAD icon" class="w-9 h-9" />
        <p class="font-bold">CAD</p>
      </div>
      <div class="flex flex-col items-center flex-wrap">
        <img src="/img/icons/projects/tools/gnu.svg" alt="Sheet metal icon" class="w-9 h-9" />
        <p class="font-bold">Sheet Metal</p>
      </div>
    </div>

    <h3 class="mt-2 mb-2 font-bold">Overview</h3>
    <p>
      CAD model of a competition battery enclosure for an electric vehicle platform. I supported
      enclosure layout with a focus on manufacturable sheet-metal geometry, internal mounting features,
      and precise roof cutouts so high-current terminals exit in the correct orientation for wiring
      and service access.
    </p>

    <figure class="my-4">
      <img
        src="/img/projects/hardware/battery-box-cad.png"
        alt="Isometric CAD render of the battery box assembly"
        class="w-full max-w-2xl rounded border border-gray-300 shadow-sm"
      />
      <figcaption class="text-xxs text-gray-600 mt-1 italic">Isometric assembly — tab-and-slot plates, internal shelf, and side mounting ears</figcaption>
    </figure>

    <h3 class="mt-4 mb-2 font-bold">Contributions</h3>
    <ul class="list-disc ml-3 space-y-1">
      <li>Modeled welding-tab geometry for reliable joint access during assembly</li>
      <li>Defined roof-hole pattern so battery terminals face the required directions</li>
      <li>Validated internal standoff and vent cutout layout on the mounting shelf</li>
      <li>Coordinated side L-bracket interfaces for chassis integration</li>
    </ul>

    <h3 class="mt-4 mb-2 font-bold">Technical Specifications</h3>
    <table class="spec-table w-full text-xxs md:text-xs mb-4">
      <tbody>
        <tr><th>Project</th><td>EV battery enclosure (competition platform)</td></tr>
        <tr><th>Construction</th><td>Tab-and-slot sheet metal plates, laser-cut profiles</td></tr>
        <tr><th>Primary plates</th><td>Front, rear, sides, internal horizontal shelf</td></tr>
        <tr><th>Roof features</th><td>Terminal clearance holes — orientation-critical layout</td></tr>
        <tr><th>Internal shelf</th><td>Rectangular vent/clearance slots + PCB/standoff hole pattern</td></tr>
        <tr><th>External mounts</th><td>Four side L-brackets with through-holes for chassis attachment</td></tr>
        <tr><th>Rear panel</th><td>Multi-diameter cable / fan pass-through apertures</td></tr>
        <tr><th>My focus</th><td>Welding tabs, roof-hole placement, assembly-ready CAD</td></tr>
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
.hardware-project figure img {
  background: #fff;
}
</style>
