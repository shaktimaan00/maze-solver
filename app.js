/* Maze Lab App (Canvas)
   - Wires UI to core generators/solvers with time-sliced animations
   - Batched drawing, rAF loop, FPS cap, pause/step/FF, hover highlight
*/
import {
  rng, toOdd, Grid,
  genDFS, genPrim,
  solveBFS, solveDFS, solveAStar,
  drawGrid, drawVisited, drawPathGlow
} from './maze-core.js';

const $ = (sel)=> document.querySelector(sel);

// UI elements
const canvas = $('#canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const statusEl = $('#status');
const hoverInfo = $('#hoverInfo');

const genAlgEl = $('#genAlg');
const widthEl = $('#width');
const heightEl = $('#height');
const seedEl = $('#seed');
const blockEl = $('#block');
const showGridEl = $('#showGrid');

const btnGenerate = $('#btnGenerate');
const btnReplay = $('#btnReplay');

const solverEl = $('#solver');
const btnSolve = $('#btnSolve');
const btnClearPath = $('#btnClearPath');

const genSpeedEl = $('#genSpeed');       // events per second
const solverSpeedEl = $('#solverSpeed'); // events per second
const fpsCapEl = $('#fpsCap');
const btnPause = $('#btnPause');
const btnStep = $('#btnStep');
const btnFF = $('#btnFF');

// Live readouts to show applied values and step labels
let hudReadout = document.createElement('div');
hudReadout.style.position = 'absolute';
hudReadout.style.right = '12px';
hudReadout.style.bottom = '12px';
hudReadout.style.padding = '6px 8px';
hudReadout.style.background = 'rgba(0,0,0,0.5)';
hudReadout.style.color = '#fff';
hudReadout.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
hudReadout.style.fontSize = '12px';
hudReadout.style.borderRadius = '6px';
document.querySelector('.stage').appendChild(hudReadout);

// Step annotation label overlay
let stepLabel = document.createElement('div');
stepLabel.style.position = 'absolute';
stepLabel.style.left = '12px';
stepLabel.style.bottom = '12px';
stepLabel.style.padding = '6px 8px';
stepLabel.style.background = 'rgba(0,0,0,0.6)';
stepLabel.style.color = '#ffc700';
stepLabel.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
stepLabel.style.fontSize = '12px';
stepLabel.style.borderRadius = '6px';
stepLabel.style.maxWidth = '40%';
stepLabel.style.pointerEvents = 'none';
document.querySelector('.stage').appendChild(stepLabel);

// Palette
const palette = {
  wall: getCss('--wall', '#1e2230'),
  pass: getCss('--pass', '#f5f5f8'),
  start: getCss('--accent', '#57c5b6'),
  goal: getCss('--danger', '#ff5c57'),
  visited: getCss('--visited', '#6272a4'),
  glowO: 'rgba(255, 199, 0, 0.85)',
  glowI: getCss('--path', '#ffc700'),
  grid: getCss('--grid', 'rgba(255,255,255,0.06)'),
  bg: getCss('--bg', '#111117'),
};

function getCss(varName, fallback){
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

// State
let grid = null;
let cell = 20;
let genIter = null;
let genSteps = [];
let solvingIter = null;
let visitedBuf = [];
let pathBuf = [];
let paused = false;
let fastForward = false;
let stepPending = false;
let lastTs = 0;
let accMs = 0;
let fpsCap = 60;

// Atomic step pacing (strict one-event-per-frame unless fast-forward)
let genEventsPerSecond = 6;    // slower defaults: ~166ms per event
let solveEventsPerSecond = 12; // ~83ms per event

// Last event info for annotation
let lastEvent = null;

// Resize canvas to fit chosen grid and fill main stage
function computeCanvasSize() {
  const stage = document.querySelector('.stage');
  const rect = stage.getBoundingClientRect();
  const wCells = grid.w;
  const hCells = grid.h;
  const pad = 20;
  const availW = rect.width - pad;
  const availH = rect.height - pad;
  cell = Math.max(6, Math.floor(Math.min(availW / wCells, availH / hCells)));
  canvas.width = wCells * cell;
  canvas.height = hCells * cell;
}

// Generation dispatch
function getGenGenerator(name, grid, seed){
  if(name === 'dfs') return genDFS(grid, seed);
  if(name === 'prim') return genPrim(grid, seed);
  return genDFS(grid, seed);
}

// Solver dispatch
function getSolverGenerator(name, grid){
  if(name === 'bfs') return solveBFS(grid);
  if(name === 'dfs') return solveDFS(grid);
  if(name === 'astar') return solveAStar(grid);
  return solveBFS(grid);
}

function resetAnimationBuffers(){
  visitedBuf.length = 0;
  pathBuf.length = 0;
  lastEvent = null;
  stepLabel.textContent = '';
}

function buildGridFromUI(){
  const W = toOdd(parseInt(widthEl.value || '41', 10));
  const H = toOdd(parseInt(heightEl.value || '31', 10));
  const B = Math.max(1, parseInt(blockEl.value || '2', 10));
  grid = new Grid(W, H, B);
}

// Generate with animation
function startGenerate(recordOnly=false){
  resetAnimationBuffers();
  genSteps.length = 0;
  const seed = parseInt(seedEl.value || '42', 10);
  const which = genAlgEl.value;
  genIter = getGenGenerator(which, grid, seed);
  paused = false;
  fastForward = false;

  if(recordOnly){
    for(const step of genIter){
      genSteps.push(step);
    }
    genIter = null;
    buildGridFromUI();
    genIter = (function*(){
      for(const s of genSteps) yield s;
    })();
  }
}

// Replay last generation steps (if available)
function replayGeneration(){
  if(!genSteps.length){
    setStatus('Nothing to replay yet. Generate first.');
    return;
  }
  buildGridFromUI();
  resetAnimationBuffers();
  genIter = (function*(){
    for(const s of genSteps) yield s;
  })();
  paused = false;
  fastForward = false;
}

// Solve with animation
function startSolve(){
  if(!grid){ return; }
  solvingIter = getSolverGenerator(solverEl.value, grid);
  visitedBuf.length = 0;
  pathBuf.length = 0;
  paused = false;
  fastForward = false;
}

// Clear path overlays (keep maze)
function clearPath(){
  solvingIter = null;
  visitedBuf.length = 0;
  pathBuf.length = 0;
  lastEvent = null;
  stepLabel.textContent = '';
}

// Buttons
btnGenerate.addEventListener('click', onGenerate);
btnReplay.addEventListener('click', onReplay);
btnSolve.addEventListener('click', onSolve);
btnClearPath.addEventListener('click', onClearPath);
btnPause.addEventListener('click', onPause);
btnStep.addEventListener('click', onStep);
btnFF.addEventListener('click', onFF);

// Sliders (immediate)
function bindImmediateSlider(sliderEl, onValue, label){
  const handler = ()=>{
    const v = Math.max(1, parseInt(sliderEl.value || '1', 10));
    sliderEl.title = `${label}: ${v} ev/s`;
    onValue(v);
    setStatus(`${label} set to ${v} ev/s`);
  };
  sliderEl.addEventListener('input', handler);
  sliderEl.addEventListener('change', handler);
  handler();
}
bindImmediateSlider(genSpeedEl, (v)=> { genEventsPerSecond = v; }, 'Gen speed');
bindImmediateSlider(solverSpeedEl, (v)=> { solveEventsPerSecond = v; }, 'Solve speed');

// FPS cap updates
function applyFps(){
  fpsCap = Math.max(15, Math.min(120, parseInt(fpsCapEl.value||'60',10)));
}
fpsCapEl.addEventListener('input', applyFps);
fpsCapEl.addEventListener('change', applyFps);
applyFps();

// Keyboard controls
document.addEventListener('keydown', (e)=>{
  if(e.target && ['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)) return;
  if(e.key==='g' || e.key==='G'){ onGenerate(); }
  else if(e.key==='r' || e.key==='R'){ onReplay(); }
  else if(e.key==='s' || e.key==='S'){ onSolve(); }
  else if(e.key==='c' || e.key==='C'){ onClearPath(); }
  else if(e.code==='Space'){ e.preventDefault(); onPause(); }
  else if(e.key==='n' || e.key==='N'){ onStep(); }
  else if(e.key==='f' || e.key==='F'){ onFF(); }
});

// Hover highlight
canvas.addEventListener('mousemove', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / cell);
  const y = Math.floor((e.clientY - rect.top) / cell);
  if(grid && grid.inBounds(x,y)){
    hoverInfo.textContent = `(${x}, ${y}) ${grid.get(x,y)===0 ? '· passage' : '# wall'}`;
    hoverInfo.style.left = `${e.clientX}px`;
    hoverInfo.style.top = `${e.clientY}px`;
    hoverInfo.classList.add('show');
  }else{
    hoverInfo.classList.remove('show');
  }
});
canvas.addEventListener('mouseleave', ()=>{
  hoverInfo.classList.remove('show');
});

function onGenerate(){
  buildGridFromUI();
  computeCanvasSize();
  startGenerate();
}

function onReplay(){
  replayGeneration();
}

function onSolve(){
  startSolve();
}

function onClearPath(){
  clearPath();
}

function onPause(){
  paused = !paused;
  setStatus(paused ? 'Paused' : 'Running');
}

function onStep(){
  if(!paused){ paused = true; }
  stepPending = true; // process exactly one event next frame
}

function onFF(){
  fastForward = !fastForward;
  setStatus(fastForward ? 'Fast-Forward' : 'Running');
}

function setStatus(msg){
  statusEl.textContent = msg || '';
  hudReadout.textContent = `gen: ${genEventsPerSecond} ev/s | solve: ${solveEventsPerSecond} ev/s | fps: ${fpsCap}`;
}

// Event annotation helper
function annotate(ev){
  lastEvent = ev;
  if(!ev){ stepLabel.textContent = ''; return; }
  switch(ev.type){
    case 'init':
      stepLabel.textContent = 'Init: place starting cell';
      break;
    case 'carve':
      stepLabel.textContent = `Carve: ${ev.from.x},${ev.from.y} -> ${ev.to.x},${ev.to.y}`;
      break;
    case 'backtrack':
      stepLabel.textContent = `Backtrack: ${ev.from.x},${ev.from.y} <- ${ev.to.x},${ev.to.y}`;
      break;
    case 'visit':
      stepLabel.textContent = `Visit: ${ev.p.x},${ev.p.y}`;
      break;
    case 'path':
      stepLabel.textContent = `Path step: ${ev.p.x},${ev.p.y}`;
      break;
    case 'solve_done':
      stepLabel.textContent = ev.found ? `Solved (cost ${ev.cost})` : 'No path';
      break;
    case 'done':
      stepLabel.textContent = 'Generation done';
      break;
    default:
      stepLabel.textContent = '';
  }
}

// Strict atomic-step processor: one event max per frame (unless fast-forward)
function nextAtomic(gen, handlers){
  const nx = gen.next();
  if(nx.done) return false;
  const ev = nx.value;
  handleEvent(ev, handlers);
  annotate(ev);
  return true;
}

// Handle events into buffers (no grouping)
function handleEvent(ev, { onCarve, onBacktrack, onVisit, onPath, onSolveDone }){
  if(!ev) return;
  switch(ev.type){
    case 'init': break;
    case 'carve': onCarve && onCarve(ev); break;
    case 'backtrack': onBacktrack && onBacktrack(ev); break;
    case 'visit': onVisit && onVisit(ev); break;
    case 'path': onPath && onPath(ev); break;
    case 'solve_done': onSolveDone && onSolveDone(ev); break;
    case 'done': break;
  }
}

// Render loop
let genTimerAcc = 0;
let solveTimerAcc = 0;
function loop(ts){
  const dt = ts - lastTs || 16;
  lastTs = ts;

  // FPS cap
  const minFrameMs = 1000 / fpsCap;
  accMs += dt;
  if(accMs < minFrameMs){ requestAnimationFrame(loop); return; }
  accMs = 0;

  // Clear and draw base grid
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0,0,canvas.width, canvas.height);
  drawGrid(ctx, grid, cell, palette, showGridEl.checked);

  // Atomic step timing via accumulators
  if(!paused){
    // Generation: process at most one event when timer exceeds period
    if(genIter){
      const periodMs = 1000 / Math.max(1, genEventsPerSecond);
      genTimerAcc += dt;
      const shouldStep = (genTimerAcc >= periodMs) || stepPending || fastForward;
      if(shouldStep){
        genTimerAcc = stepPending ? 0 : (genTimerAcc - periodMs);
        const alive = nextAtomic(genIter, {
          onCarve: ({from,to})=>{},
          onBacktrack: ()=>{},
        });
        if(!alive){
          genIter = null;
          annotate({type:'done'});
          setStatus('Generation done');
        }
        if(stepPending) stepPending = false;
      }
    }

    // Solving: process at most one event when timer exceeds period
    if(solvingIter){
      const periodMs = 1000 / Math.max(1, solveEventsPerSecond);
      solveTimerAcc += dt;
      const shouldStep = (solveTimerAcc >= periodMs) || stepPending || fastForward;
      if(shouldStep){
        solveTimerAcc = stepPending ? 0 : (solveTimerAcc - periodMs);
        const alive = nextAtomic(solvingIter, {
          onVisit: ({p})=> visitedBuf.push(p),
          onPath: ({p})=> pathBuf.push(p),
          onSolveDone: ({found,cost})=>{
            setStatus(found ? `Solved, cost=${cost}` : 'No path');
          }
        });
        if(!alive){
          solvingIter = null;
        }
        if(stepPending) stepPending = false;
      }
    }
  }

  // Overlays
  if(visitedBuf.length){
    drawVisited(ctx, visitedBuf, cell, palette.visited);
  }
  if(pathBuf.length){
    drawPathGlow(ctx, pathBuf, cell, palette.glowO, palette.glowI);
  }

  requestAnimationFrame(loop);
}

// Initial boot
(function boot(){
  buildGridFromUI();
  computeCanvasSize();
  genEventsPerSecond = 6;
  solveEventsPerSecond = 12;
  genSpeedEl.value = String(genEventsPerSecond);
  solverSpeedEl.value = String(solveEventsPerSecond);
  setStatus('Ready. Press G to generate, S to solve.');
  startGenerate(true); // pre-record and replay atomically
  requestAnimationFrame(loop);
})();

// Programmatic speed control:
// window.setGenSpeed = (evPerSec)=> { genEventsPerSecond = Math.max(1, evPerSec|0); setStatus('gen speed set'); };
// window.setSolverSpeed = (evPerSec)=> { solveEventsPerSecond = Math.max(1, evPerSec|0); setStatus('solve speed set'); };