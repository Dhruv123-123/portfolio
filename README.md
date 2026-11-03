# Dhruv's personal site

Personal site. The home page is a Rubik's cube: each face is one side of me, and the panel beside it follows whichever face points at you. Visitors can turn layers, scramble it, time a solve, or let it solve itself.

No build step and no framework. Edit, push to `main`, and GitHub Pages deploys it.

- `index.html` holds all six sides' copy. Face → side: U white = work, R red = training, F green = beliefs and rabbit holes, B blue = AI right now, L orange = off the clock, D yellow = under construction.
- `assets/cube.js` is the cube (three.js): layer turns by drag or keys, scramble, timer, auto-solve, the cube map.
- `assets/site.css` styles the home page. The older `interests/*` pages are no longer linked from it.
- `vendor/three/` is a pinned copy of three.js r170 so the site doesn't depend on a CDN.
- `resume.pdf` is served at `/resume.pdf`.
