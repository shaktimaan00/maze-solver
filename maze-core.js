/**
 * Maze Lab Core
 * - Grid model, RNG (seeded), generators (DFS backtracker, Prim), solvers (BFS/DFS/A*)
 * - Time-sliced, event-yielding algorithms for animation
 * - Batched rendering helpers for Canvas
 */

/* RNG - Mulberry32 */
export function rng(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
export function randInt(r, a, b) {
  return a + Math.floor(r() * (b - a + 1));
}

/* Grid */
export class Grid {
  constructor(w, h, block=1) {
    this.w = w|0;
    this.h = h|0;
    this.block = Math.max(1, block|0);
    // 1 = wall, 0 = passage
    this.cells = new Uint8Array(this.w * this.h);
    this.fill(1);
    this.start = {x:1, y:1};
    this.goal = {x:this.w-2, y:this.h-2};
  }
  idx(x, y){ return y*this.w + x; }
  inBounds(x,y){ return x>=0 && y>=0 && x<this.w && y<this.h; }
  get(x,y){ return this.cells[this.idx(x,y)]; }
  set(x,y,v){ this.cells[this.idx(x,y)] = v; }
  isOpen(x,y){ return this.inBounds(x,y) && this.get(x,y) === 0; }
  fill(v){ this.cells.fill(v); }
  clone(){ const g = new Grid(this.w,this.h,this.block); g.cells.set(this.cells); g.start={...this.start}; g.goal={...this.goal}; return g; }
}

/* Directions (4-neighborhood) */
export const DIRS = [
  {dx:0, dy:-1}, // up
  {dx:0, dy:1},  // down
  {dx:-1,dy:0},  // left
  {dx:1, dy:0},  // right
];

/* Ensure odd dimension for better mazes */
export function toOdd(n){ n = n|0; return n%2===1 ? n : n+1; }

/* Generator: Randomized DFS (Backtracker) - yields steps for animation */
export function* genDFS(grid, seed=42) {
  const r = rng(seed);
  const w = grid.w, h = grid.h;
  grid.fill(1);

  const stack = [];
  // start at random odd cell
  let sx = (randInt(r,1,w-2)|1), sy = (randInt(r,1,h-2)|1);
  grid.set(sx, sy, 0);
  stack.push({x:sx, y:sy});

  yield {type:"init", x:sx, y:sy};

  const randShuffle = (arr)=>{
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(r()* (i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
  };

  while(stack.length){
    const cur = stack[stack.length-1];
    const candidates = [];
    for(const d of DIRS){
      const nx = cur.x + d.dx*2;
      const ny = cur.y + d.dy*2;
      if(nx>0 && ny>0 && nx<w-1 && ny<h-1 && grid.get(nx,ny)===1){
        candidates.push({dx:d.dx, dy:d.dy, nx, ny});
      }
    }
    if(candidates.length){
      randShuffle(candidates);
      const ch = candidates[0];
      // carve
      grid.set(cur.x + ch.dx, cur.y + ch.dy, 0);
      grid.set(ch.nx, ch.ny, 0);
      stack.push({x:ch.nx, y:ch.ny});
      yield {type:"carve", from:{...cur}, to:{x:ch.nx, y:ch.ny}};
    }else{
      const popped = stack.pop();
      if(stack.length){
        yield {type:"backtrack", from:{...popped}, to:{...stack[stack.length-1]}};
      }
    }
  }

  // ensure start/goal
  grid.set(1,1,0);
  grid.set(w-2,h-2,0);
  grid.start = {x:1,y:1};
  grid.goal = {x:w-2,y:h-2};
  yield {type:"done"};
}

/* Generator: Randomized Prim - yields steps */
export function* genPrim(grid, seed=42) {
  const r = rng(seed);
  const w = grid.w, h = grid.h;
  grid.fill(1);

  const startX = (randInt(r,1,w-2)|1);
  const startY = (randInt(r,1,h-2)|1);
  grid.set(startX,startY,0);

  const walls = [];
  const addWalls = (x,y)=>{
    for(const d of DIRS){
      const nx = x + d.dx*2, ny = y + d.dy*2;
      if(nx>0 && ny>0 && nx<w-1 && ny<h-1){
        walls.push({cx:x, cy:y, nx, ny, dx:d.dx, dy:d.dy});
      }
    }
  };
  addWalls(startX,startY);
  yield {type:"init", x:startX, y:startY};

  while(walls.length){
    const idx = randInt(r,0,walls.length-1);
    const wobj = walls[idx];
    walls.splice(idx,1);

    if(grid.get(wobj.ny, wobj.nx) !== undefined && grid.get(wobj.nx, wobj.ny) === undefined){
      // guard no-op; use standard indexing
    }

    if(grid.get(wobj.nx, wobj.ny) === 1){
      grid.set(wobj.cx + wobj.dx, wobj.cy + wobj.dy, 0);
      grid.set(wobj.nx, wobj.ny, 0);
      addWalls(wobj.nx, wobj.ny);
      yield {type:"carve", from:{x:wobj.cx,y:wobj.cy}, to:{x:wobj.nx,y:wobj.ny}};
    }
  }

  grid.set(1,1,0);
  grid.set(w-2,h-2,0);
  grid.start = {x:1,y:1};
  grid.goal = {x:w-2,y:h-2};
  yield {type:"done"};
}

/* Solver generators: BFS, DFS, A* (uniform cost) - yield exploration and path reveal */
export function* solveBFS(grid){
  const start = grid.start, goal = grid.goal;
  const q = [start];
  const came = new Map();
  const key = (p)=> `${p.x},${p.y}`;
  came.set(key(start), null);
  yield {type:"visit", p:start};

  while(q.length){
    const cur = q.shift();
    if(cur.x===goal.x && cur.y===goal.y) break;

    for(const d of DIRS){
      const nx = cur.x + d.dx, ny = cur.y + d.dy;
      if(!grid.isOpen(nx,ny)) continue;
      const k = `${nx},${ny}`;
      if(!came.has(k)){
        came.set(k, cur);
        q.push({x:nx,y:ny});
        yield {type:"visit", p:{x:nx,y:ny}};
      }
    }
  }
  // path
  const path = [];
  let cur = goal;
  while(cur){
    path.push(cur);
    cur = came.get(key(cur));
  }
  path.reverse();
  for(const p of path){
    yield {type:"path", p};
  }
  yield {type:"solve_done", found: path.length>0, cost: Math.max(0,path.length-1)};
}

export function* solveDFS(grid){
  const start = grid.start, goal = grid.goal;
  const st = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  const parent = new Map();
  yield {type:"visit", p:start};

  while(st.length){
    const cur = st.pop();
    if(cur.x===goal.x && cur.y===goal.y) break;
    for(const d of DIRS){
      const nx = cur.x + d.dx, ny = cur.y + d.dy;
      if(!grid.isOpen(nx,ny)) continue;
      const k = `${nx},${ny}`;
      if(!seen.has(k)){
        seen.add(k);
        parent.set(k, cur);
        st.push({x:nx,y:ny});
        yield {type:"visit", p:{x:nx,y:ny}};
      }
    }
  }
  // build path
  const path = [];
  let cur = goal;
  const key = (p)=> `${p.x},${p.y}`;
  while(cur){
    path.push(cur);
    cur = parent.get(key(cur));
  }
  path.reverse();
  for(const p of path){
    yield {type:"path", p};
  }
  yield {type:"solve_done", found: path.length>0, cost: Math.max(0,path.length-1)};
}

export function* solveAStar(grid){
  const start = grid.start, goal = grid.goal;
  const h = (a,b)=> Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const open = [{p:start, f:h(start,goal)}];
  const gScore = new Map([[`${start.x},${start.y}`,0]]);
  const came = new Map();
  const key = (p)=> `${p.x},${p.y}`;
  yield {type:"visit", p:start};

  while(open.length){
    open.sort((a,b)=> a.f-b.f);
    const cur = open.shift().p;
    if(cur.x===goal.x && cur.y===goal.y) break;

    for(const d of DIRS){
      const nx = cur.x + d.dx, ny = cur.y + d.dy;
      if(!grid.isOpen(nx,ny)) continue;
      const nk = `${nx},${ny}`;
      const tg = (gScore.get(key(cur)) ?? 0) + 1;
      if(tg < (gScore.get(nk) ?? Infinity)){
        came.set(nk, cur);
        gScore.set(nk, tg);
        const f = tg + h({x:nx,y:ny}, goal);
        open.push({p:{x:nx,y:ny}, f});
        yield {type:"visit", p:{x:nx,y:ny}};
      }
    }
  }
  const path = [];
  let cur = goal;
  while(cur){
    path.push(cur);
    cur = came.get(key(cur));
  }
  path.reverse();
  for(const p of path){
    yield {type:"path", p};
  }
  yield {type:"solve_done", found: path.length>0, cost: Math.max(0,path.length-1)};
}

/* Batch canvas rendering */
export function drawGrid(ctx, grid, cell, palette, showGrid=false){
  const {wall, pass, start, goal} = palette;
  ctx.fillStyle = wall;
  ctx.fillRect(0,0,grid.w*cell, grid.h*cell);
  // draw passages
  ctx.fillStyle = pass;
  for(let y=0;y<grid.h;y++){
    for(let x=0;x<grid.w;x++){
      if(grid.get(x,y)===0){
        ctx.fillRect(x*cell,y*cell,cell,cell);
      }
    }
  }
  // start/goal
  ctx.fillStyle = start;
  ctx.fillRect(grid.start.x*cell, grid.start.y*cell, cell, cell);
  ctx.fillStyle = goal;
  ctx.fillRect(grid.goal.x*cell, grid.goal.y*cell, cell, cell);

  if(showGrid){
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let x=0;x<=grid.w;x++){ ctx.moveTo(x*cell+.5, 0); ctx.lineTo(x*cell+.5, grid.h*cell); }
    for(let y=0;y<=grid.h;y++){ ctx.moveTo(0, y*cell+.5); ctx.lineTo(grid.w*cell, y*cell+.5); }
    ctx.stroke();
  }
}

export function drawVisited(ctx, points, cell, color){
  ctx.fillStyle = color;
  for(const p of points){
    ctx.fillRect(p.x*cell, p.y*cell, cell, cell);
  }
}

export function drawPathGlow(ctx, path, cell, colorOuter, colorInner){
  // glow trail using two passes
  ctx.save();
  for(let i=0;i<path.length;i++){
    const p = path[i];
    // outer blur
    ctx.shadowColor = colorOuter;
    ctx.shadowBlur = cell*0.9;
    ctx.fillStyle = colorOuter;
    ctx.fillRect(p.x*cell, p.y*cell, cell, cell);
    // inner bright
    ctx.shadowBlur = 0;
    ctx.fillStyle = colorInner;
    ctx.fillRect(p.x*cell+cell*0.15, p.y*cell+cell*0.15, cell*0.7, cell*0.7);
  }
  ctx.restore();
}