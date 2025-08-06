# Maze Solver — Dijkstra (Python) + Animated Web Canvas (JS)

This project contains:
1) A Python implementation that generates thick-wall mazes and solves with Dijkstra/BFS (CLI and optional Pygame, desktop).
2) A modern Web app (HTML5 Canvas) for immersive, animated maze generation and solving with smooth transitions, controls, and performance tuning.

Highlights (Web):
- Generators: Randomized DFS (backtracker), Randomized Prim (time-sliced, animated carving/backtracking).
- Solvers: BFS, DFS, A* (visited trail + glowing shortest path).
- Smooth animation with requestAnimationFrame and time-budgeted step processing.
- Cohesive color palette, optional grid lines, hover cell info.
- Controls for algorithm, width/height, block thickness, seed, speeds, pause/resume, step-through, and fast-forward.
- Clean separation between core algorithms and UI rendering.

Contents
- Python (desktop)
  - [`src/maze.py`](src/maze.py): Maze generation (thick-wall), pretty-print
  - [`src/pathfinding.py`](src/pathfinding.py): Dijkstra/BFS shortest path
  - [`src/cli.py`](src/cli.py): CLI entry (prints maze/path)
  - [`src/pygame_app.py`](src/pygame_app.py): Pygame visualizer (desktop)
- Web (browser)
  - [`web/index.html`](web/index.html): UI layout with controls, canvas stage
  - [`web/style.css`](web/style.css): Visual styling and palette
  - [`web/maze-core.js`](web/maze-core.js): Grid model, seeded RNG, generators (DFS, Prim), solvers (BFS/DFS/A*), drawing helpers
  - [`web/app.js`](web/app.js): App wiring, animation loop, event handling

------------------------------------------------------------
Python — CLI and Pygame (Desktop)
------------------------------------------------------------

Setup
1) Create and activate a virtual environment
   macOS/Linux:
     python3 -m venv .venv
     source .venv/bin/activate
   Windows (PowerShell):
     python -m venv .venv
     .venv\Scripts\Activate.ps1

2) Install requirements
   pip install -r requirements.txt

CLI usage (text mode)
   python -m src.cli --print-maze --print-path --width 21 --height 21 --block 2 --complexity 0.6 --density 0.6

Pygame visualizer
   python -m src.pygame_app
Notes: Use module form (-m) so relative imports resolve.

------------------------------------------------------------
Web — Animated Canvas App (Browser)
------------------------------------------------------------

How to run (no backend needed)
Option A: Open via a local server (recommended, avoids CORS issues)
- VSCode Live Server or Python http.server:
  cd web
  python3 -m http.server 5500
Then open in browser: http://localhost:5500

Option B: Open index.html directly
- Double-click web/index.html to open in your default browser. Most modern browsers will run this fine.

Web App Controls
- Generation
  - Algorithm: Randomized DFS (backtracker) or Randomized Prim
  - Width/Height: Odd sizes recommended; UI coerces to odd internally
  - Block (thickness): Visual scaling of cells (kept in model for future)
  - Seed: Integer seed for reproducibility
  - Generate (G): Starts a new generation with animation
  - Replay (R): Replays the last recorded generation steps at the chosen speed
  - Show grid: Toggle grid lines over the maze
- Solving
  - Solver: BFS, DFS, or A*
  - Solve (S): Animate exploration trail and reveal shortest path
  - Clear Path (C): Remove path overlays
- Animation
  - Gen speed (cells/s): Controls generator step budget per frame
  - Solver speed (cells/s): Controls solver step budget per frame
  - FPS cap: Frame rate cap for consistent animation
  - Pause (Space): Pause/resume
  - Step (N): Step a single event while paused
  - Fast-Forward (F): Temporarily accelerate animation
- Keyboard (shown in app):
  - G: Generate
  - R: Replay
  - S: Solve
  - C: Clear Path
  - Space: Pause/Resume
  - N: Step one event (while paused)
  - F: Fast-forward toggle
- Hover cell info: Move the mouse over the canvas to see coords and cell type.
- Status bar shows current state (paused/running, solved cost, etc).

Performance Considerations
- requestAnimationFrame loop with FPS cap to maintain consistent motion.
- Time-budgeted processing per frame (cells/second) to keep animation smooth without blocking rendering.
- Batched draw calls (grid drawn as fills; visited/path drawn with simple overlays).
- For slower devices:
  - Reduce width/height.
  - Increase Gen/Solver speed sliders.
  - Lower FPS cap modestly (e.g., 45) for steadier frame times.

Architecture Overview (Web)
- maze-core.js
  - Grid: efficient Uint8Array storage (0=passage, 1=wall).
  - rng: Mulberry32 seedable RNG.
  - Generators: genDFS, genPrim emit events: init, carve, backtrack, done.
  - Solvers: solveBFS, solveDFS, solveAStar emit: visit, path, solve_done.
  - Drawing helpers: drawGrid (walls/passages/start/goal/grid), drawVisited, drawPathGlow (two-pass glow).
- app.js
  - UI bindings, keyboard controls, hover info.
  - Animation loop with FPS cap and time-sliced generator consumption.
  - Replay support by recording generation steps.
  - Clear separation between state updates and drawing.

Roadmap / Extensibility
- Add more generators (Kruskal, Wilson’s, Aldous–Broder).
- Add easing-based in-between interpolation for carve/backtrack visuals (currently event-based).
- Add export/import of seeds and paths.
- Add mobile touch controls and layout tweaks.

License
MIT