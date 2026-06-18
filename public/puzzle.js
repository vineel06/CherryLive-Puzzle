// ═══════════════════════════════════════════════
//   CHERRY LIVE PUZZLE — PUZZLE ENGINE
// ═══════════════════════════════════════════════
const PuzzleEngine = (function () {
  // ─── State ───────────────────────────────────
  let canvas, ctx, ghostCanvas, ghostCtx;
  let sourceImage = null;  // ImageBitmap or canvas
  let pieces = [];
  let cols = 4, rows = 4;
  let PIECE_W, PIECE_H;
  let boardX, boardY, boardW, boardH;
  let dragPiece = null, dragOffX = 0, dragOffY = 0;
  let snappedCount = 0;
  let totalPieces = 0;
  let score = 0;
  let settings = {};
  let onSnapCb = null, onCompleteCb = null, onScoreCb = null;
  let animFrame = null;
  let snapSound = null;
  let isRunning = false;
  let externalPieceColors = {}; // pieceId -> playerColor (multiplayer)
  let lockedPieces = new Set(); // pieces grabbed by others

  // ─── Jigsaw tab geometry ────────────────────
  const TAB_SIZE = 0.25;  // fraction of piece size

  function getTabPath(piece, cw, ch) {
    const { col, row, tabs } = piece;
    const x = 0, y = 0;
    const w = cw, h = ch;
    const tx = cw * TAB_SIZE, ty = ch * TAB_SIZE;
    const tr = Math.min(tx, ty) * 0.4; // tab bump radius

    const path = new Path2D();
    path.moveTo(x, y);

    // Top edge
    const topTab = tabs.top;
    path.lineTo(x + w * 0.35, y);
    if (topTab !== 0) {
      const dir = topTab;
      path.bezierCurveTo(
        x + w * 0.35, y + dir * ty * 0.5,
        x + w * 0.5 - tx * 0.5, y + dir * ty,
        x + w * 0.5, y + dir * ty
      );
      path.bezierCurveTo(
        x + w * 0.5 + tx * 0.5, y + dir * ty,
        x + w * 0.65, y + dir * ty * 0.5,
        x + w * 0.65, y
      );
    }
    path.lineTo(x + w, y);

    // Right edge
    const rightTab = tabs.right;
    path.lineTo(x + w, y + h * 0.35);
    if (rightTab !== 0) {
      const dir = rightTab;
      path.bezierCurveTo(
        x + w + dir * tx * 0.5, y + h * 0.35,
        x + w + dir * tx, y + h * 0.5 - ty * 0.5,
        x + w + dir * tx, y + h * 0.5
      );
      path.bezierCurveTo(
        x + w + dir * tx, y + h * 0.5 + ty * 0.5,
        x + w + dir * tx * 0.5, y + h * 0.65,
        x + w, y + h * 0.65
      );
    }
    path.lineTo(x + w, y + h);

    // Bottom edge
    const bottomTab = tabs.bottom;
    path.lineTo(x + w * 0.65, y + h);
    if (bottomTab !== 0) {
      const dir = bottomTab;
      path.bezierCurveTo(
        x + w * 0.65, y + h - dir * ty * 0.5,
        x + w * 0.5 + tx * 0.5, y + h - dir * ty,
        x + w * 0.5, y + h - dir * ty
      );
      path.bezierCurveTo(
        x + w * 0.5 - tx * 0.5, y + h - dir * ty,
        x + w * 0.35, y + h - dir * ty * 0.5,
        x + w * 0.35, y + h
      );
    }
    path.lineTo(x, y + h);

    // Left edge
    const leftTab = tabs.left;
    path.lineTo(x, y + h * 0.65);
    if (leftTab !== 0) {
      const dir = leftTab;
      path.bezierCurveTo(
        x - dir * tx * 0.5, y + h * 0.65,
        x - dir * tx, y + h * 0.5 + ty * 0.5,
        x - dir * tx, y + h * 0.5
      );
      path.bezierCurveTo(
        x - dir * tx, y + h * 0.5 - ty * 0.5,
        x - dir * tx * 0.5, y + h * 0.35,
        x, y + h * 0.35
      );
    }
    path.lineTo(x, y);
    path.closePath();
    return path;
  }

  // ─── Init ────────────────────────────────────
  function init(cfg) {
    canvas = document.getElementById('puzzle-canvas');
    ctx = canvas.getContext('2d');
    ghostCanvas = document.getElementById('ghost-canvas');
    ghostCtx = ghostCanvas.getContext('2d');
    settings = cfg;

    cols = parseInt(cfg.cols) || 4;
    rows = parseInt(cfg.rows) || 4;
    totalPieces = cols * rows;
    snappedCount = 0;
    score = 0;
    pieces = [];
    externalPieceColors = {};
    lockedPieces = new Set();

    resize();
    window.addEventListener('resize', resize);
    bindEvents();
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ghostCanvas.width = canvas.width;
    ghostCanvas.height = canvas.height;

    // Board occupies center area (leave room for HUD and scoreboard)
    const mp = Network.isConnected() ? 220 : 0;
    const marginTop = 60, marginBottom = 20, marginSide = 20;
    boardW = canvas.width - marginSide * 2 - mp;
    boardH = canvas.height - marginTop - marginBottom;
    boardX = marginSide;
    boardY = marginTop;

    // Fit pieces to board
    PIECE_W = Math.floor(boardW / cols);
    PIECE_H = Math.floor(boardH / rows);

    // Snap positions for all pieces
    if (pieces.length > 0) {
      pieces.forEach(p => {
        if (p.snapped) {
          p.x = boardX + p.col * PIECE_W;
          p.y = boardY + p.row * PIECE_H;
        }
      });
    }
    drawGhost();
  }

  // ─── Load image and build pieces ────────────────
  async function loadImage(imgSource) {
    if (imgSource instanceof HTMLVideoElement) {
      // Capture frame
      const tmp = document.createElement('canvas');
      tmp.width = imgSource.videoWidth || 640;
      tmp.height = imgSource.videoHeight || 480;
      const tc = tmp.getContext('2d');
      if (settings.mirror) {
        tc.translate(tmp.width, 0); tc.scale(-1, 1);
      }
      tc.drawImage(imgSource, 0, 0);
      sourceImage = tmp;
    } else if (imgSource instanceof HTMLCanvasElement) {
      sourceImage = imgSource;
    } else if (imgSource instanceof HTMLImageElement) {
      sourceImage = imgSource;
    }
    drawGhost();
    buildPieces();
    if (settings.scrambleAnim) await scrambleAnimation();
  }

  function drawGhost() {
    if (!sourceImage || !ghostCtx) return;
    ghostCtx.clearRect(0, 0, ghostCanvas.width, ghostCanvas.height);
    // Draw image scaled to board area
    ghostCtx.drawImage(sourceImage, boardX, boardY, boardW, boardH);
  }

  function buildPieces() {
    pieces = [];
    // Pre-compute tabs: each edge shared between two pieces must be mirrored
    const hTabs = []; // hTabs[row][col] = tab between (row-1,col) and (row,col): 1=down knob, -1=up knob
    const vTabs = []; // vTabs[row][col] = tab between (row,col-1) and (row,col)

    for (let r = 0; r <= rows; r++) {
      hTabs[r] = [];
      for (let c = 0; c < cols; c++) {
        hTabs[r][c] = (r === 0 || r === rows) ? 0 : (Math.random() < 0.5 ? 1 : -1);
      }
    }
    for (let r = 0; r < rows; r++) {
      vTabs[r] = [];
      for (let c = 0; c <= cols; c++) {
        vTabs[r][c] = (c === 0 || c === cols) ? 0 : (Math.random() < 0.5 ? 1 : -1);
      }
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tabs = {
          top:    hTabs[r][c],
          bottom: -hTabs[r + 1][c],  // shared edge, mirrored
          left:   vTabs[r][c],
          right:  -vTabs[r][c + 1]
        };

        const snapX = boardX + c * PIECE_W;
        const snapY = boardY + r * PIECE_H;

        // Random scatter position (outside the board area, in the margins)
        let sx, sy;
        if (Math.random() < 0.5) {
          sx = Math.random() * (canvas.width - PIECE_W);
          sy = Math.random() < 0.5 ? Math.random() * 50 : canvas.height - PIECE_H - Math.random() * 50;
        } else {
          sy = Math.random() * (canvas.height - PIECE_H);
          sx = Math.random() < 0.5 ? Math.random() * 50 : canvas.width - PIECE_W - 50 - (Network.isConnected() ? 220 : 0);
        }

        pieces.push({
          id: `${r}-${c}`,
          col: c, row: r,
          x: sx, y: sy,
          snapX, snapY,
          tabs,
          snapped: false,
          rotation: settings.rotation ? (Math.floor(Math.random() * 4) * 90) : 0,
          zIndex: r * cols + c,
          highlightAlpha: 0, // for snap flash
        });
      }
    }
    totalPieces = pieces.length;
  }

  async function scrambleAnimation() {
    return new Promise(resolve => {
      let t = 0;
      const dur = 60;
      function animStep() {
        t++;
        pieces.forEach((p, i) => {
          const phase = (t / dur) + (i / pieces.length) * 0.5;
          p.x = boardX + p.col * PIECE_W + Math.sin(phase * 5) * 30 * (1 - t / dur);
          p.y = boardY + p.row * PIECE_H + Math.cos(phase * 5) * 30 * (1 - t / dur);
        });
        render();
        if (t < dur) requestAnimationFrame(animStep);
        else {
          // scatter after
          buildPieces();
          render();
          resolve();
        }
      }
      // First show assembled
      pieces.forEach(p => { p.x = boardX + p.col * PIECE_W; p.y = boardY + p.row * PIECE_H; });
      render();
      setTimeout(() => requestAnimationFrame(animStep), 500);
    });
  }

  // ─── Render ──────────────────────────────────
  function render() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBoardOutline();

    // Sort by zIndex
    const sorted = [...pieces].sort((a, b) => a.zIndex - b.zIndex);
    sorted.forEach(p => drawPiece(p));
  }

  function drawBoardOutline() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,60,110,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(boardX, boardY, cols * PIECE_W, rows * PIECE_H);
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawPiece(piece) {
    if (!sourceImage) return;
    const { x, y, col, row, snapped, tabs, highlightAlpha } = piece;
    const pw = PIECE_W, ph = PIECE_H;
    const ext = pw * TAB_SIZE; // extra space for tabs

    ctx.save();
    ctx.translate(x, y);

    // Clipping path
    const path = getTabPath(piece, pw, ph);
    ctx.save();
    ctx.clip(path);

    // Draw image slice
    ctx.drawImage(
      sourceImage,
      col * (sourceImage.naturalWidth || sourceImage.width) / cols - ext,
      row * (sourceImage.naturalHeight || sourceImage.height) / rows - ext,
      pw + ext * 2,
      ph + ext * 2,
      -ext, -ext,
      pw + ext * 2,
      ph + ext * 2
    );

    // Snap highlight flash
    if (highlightAlpha > 0) {
      ctx.fillStyle = `rgba(255, 217, 61, ${highlightAlpha})`;
      ctx.fillRect(-ext, -ext, pw + ext * 2, ph + ext * 2);
    }

    // Multiplayer: tint if grabbed by another player
    if (lockedPieces.has(piece.id)) {
      const col = externalPieceColors[piece.id] || '#ff6b9d';
      ctx.fillStyle = hexToRgba(col, 0.3);
      ctx.fillRect(-ext, -ext, pw + ext * 2, ph + ext * 2);
    }

    ctx.restore();

    // Stroke
    ctx.strokeStyle = snapped
      ? 'rgba(255,217,61,0.5)'
      : (externalPieceColors[piece.id] || 'rgba(255,60,110,0.4)');
    ctx.lineWidth = snapped ? 1 : 1.5;
    ctx.stroke(path);

    // Dragging glow
    if (piece === dragPiece) {
      ctx.shadowColor = '#ff3c6e';
      ctx.shadowBlur = 20;
      ctx.strokeStyle = '#ff6b9d';
      ctx.lineWidth = 2;
      ctx.stroke(path);
    }

    ctx.restore();
  }

  // ─── Event Handlers ──────────────────────────
  function bindEvents() {
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
  }

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onDown(e) {
    if (!isRunning) return;
    const pos = getPos(e);
    const piece = getPieceAt(pos.x, pos.y);
    if (!piece || piece.snapped || lockedPieces.has(piece.id)) return;
    dragPiece = piece;
    dragOffX = pos.x - piece.x;
    dragOffY = pos.y - piece.y;
    // Bring to top
    const maxZ = Math.max(...pieces.map(p => p.zIndex));
    piece.zIndex = maxZ + 1;
    canvas.classList.add('grabbing');
    Network.emit('piece_grabbed', { pieceId: piece.id });
  }

  function onMove(e) {
    if (!dragPiece) return;
    const pos = getPos(e);
    dragPiece.x = pos.x - dragOffX;
    dragPiece.y = pos.y - dragOffY;
    Network.emit('piece_moved', { pieceId: dragPiece.id, x: dragPiece.x, y: dragPiece.y, snapped: false });
  }

  function onUp() {
    if (!dragPiece) return;
    trySnap(dragPiece);
    Network.emit('piece_released', { pieceId: dragPiece.id });
    dragPiece = null;
    canvas.classList.remove('grabbing');
  }

  // Touch
  function onTouchStart(e) { e.preventDefault(); if (e.touches.length) onDown(e.touches[0]); }
  function onTouchMove(e) { e.preventDefault(); if (e.touches.length) onMove(e.touches[0]); }
  function onTouchEnd() { onUp(); }

  // ─── Snap Logic ──────────────────────────────
  function trySnap(piece) {
    const snapThreshold = Math.min(PIECE_W, PIECE_H) * 0.35;
    const dx = piece.x - piece.snapX;
    const dy = piece.y - piece.snapY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < snapThreshold) {
      piece.x = piece.snapX;
      piece.y = piece.snapY;
      piece.snapped = true;
      snappedCount++;
      score += Math.max(10, Math.floor(100 - dist));
      flashPiece(piece);
      if (onSnapCb) onSnapCb(piece, snappedCount, score);
      Network.emit('piece_moved', { pieceId: piece.id, x: piece.x, y: piece.y, snapped: true });
      Network.emit('score_update', { score });
      if (snappedCount === totalPieces) {
        setTimeout(() => { if (onCompleteCb) onCompleteCb(score); }, 300);
      }
    }
  }

  function getPieceAt(x, y) {
    const sorted = [...pieces].sort((a, b) => b.zIndex - a.zIndex);
    for (const p of sorted) {
      if (x >= p.x && x <= p.x + PIECE_W && y >= p.y && y <= p.y + PIECE_H) return p;
    }
    return null;
  }

  function flashPiece(piece) {
    piece.highlightAlpha = 1;
    const fade = () => {
      piece.highlightAlpha -= 0.05;
      if (piece.highlightAlpha > 0) requestAnimationFrame(fade);
      else piece.highlightAlpha = 0;
    };
    requestAnimationFrame(fade);
  }

  // ─── Game Loop ────────────────────────────────
  function startLoop() {
    isRunning = true;
    function loop() {
      render();
      animFrame = requestAnimationFrame(loop);
    }
    loop();
  }

  function stopLoop() {
    isRunning = false;
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  }

  // ─── External piece sync (multiplayer) ────────
  function applyRemotePieceMove(pieceId, x, y, snapped, playerColor) {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece || piece.snapped) return;
    piece.x = x; piece.y = y;
    externalPieceColors[pieceId] = playerColor;
    if (snapped && !piece.snapped) {
      piece.snapped = true; piece.x = piece.snapX; piece.y = piece.snapY;
      snappedCount++;
      flashPiece(piece);
    }
  }

  function setRemoteGrab(pieceId, playerColor) {
    lockedPieces.add(pieceId);
    externalPieceColors[pieceId] = playerColor;
  }
  function clearRemoteGrab(pieceId) { lockedPieces.delete(pieceId); }

  // ─── Ghost Preview ────────────────────────────
  function setGhostVisible(v) {
    ghostCanvas.classList.toggle('visible', v);
  }

  // ─── Shuffle ──────────────────────────────────
  function shufflePieces() {
    pieces.forEach(p => {
      if (p.snapped) return;
      p.x = Math.random() * (canvas.width - PIECE_W - (Network.isConnected() ? 220 : 0));
      p.y = Math.random() * (canvas.height - PIECE_H);
    });
  }

  // ─── Serialize for multiplayer ────────────────
  function getPieceData() {
    return pieces.map(p => ({ id: p.id, x: p.x, y: p.y, snapped: p.snapped }));
  }

  function applyInitialState(piecesData) {
    piecesData.forEach(pd => {
      const p = pieces.find(pp => pp.id === pd.id);
      if (p) { p.x = pd.x; p.y = pd.y; if (pd.snapped) { p.snapped = true; p.x = p.snapX; p.y = p.snapY; snappedCount++; } }
    });
  }

  // ─── Helpers ─────────────────────────────────
  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  // ─── Public API ──────────────────────────────
  return {
    init,
    loadImage,
    startLoop,
    stopLoop,
    shufflePieces,
    setGhostVisible,
    getPieceData,
    applyInitialState,
    applyRemotePieceMove,
    setRemoteGrab,
    clearRemoteGrab,
    getSnappedCount: () => snappedCount,
    getTotalPieces: () => totalPieces,
    getScore: () => score,
    onSnap(cb) { onSnapCb = cb; },
    onComplete(cb) { onCompleteCb = cb; },
    getSourceCanvas: () => sourceImage,
    resize,
    get cols() { return cols; },
    get rows() { return rows; }
  };
})();
