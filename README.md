# dhruvramasubban.com

Personal site. The home page is a Rubik's cube: each face is one side of me, and the panel beside it follows whichever face points at you. Visitors can turn layers, scramble it, time a solve, or let it solve itself.

No build step and no framework. Edit, push to `main`, and GitHub Pages deploys it.

- `index.html` holds all six sides' copy. Face → side: U white = work, D yellow = cubing, R red = F1 and sim racing, B blue = Pokémon, F green = rabbit holes, L orange = off the clock.
- `assets/cube.js` is the cube (three.js): layer turns by drag or keys, scramble, timer, auto-solve, the cube map.
- `assets/site.css` styles the home page. `style.css` still styles `interests.html` and `interests/*`.
- `vendor/three/` is a pinned copy of three.js r170 so the site doesn't depend on a CDN.
- `resume.pdf` is served at `/resume.pdf`.
