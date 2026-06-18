// ═══════════════════════════════════════════════
//   CHERRY LIVE PUZZLE — APP CONTROLLER
// ═══════════════════════════════════════════════
const App = (function () {
  // ─── State ───────────────────────────────────
  let currentScreen = 'menu';
  let mode = 'solo';          // 'solo' | 'multiplayer'
  let source = 'camera';      // 'camera' | 'upload'
  let difficulty = '4x4';
  let timerMode = 'countup';
  let mpMode = 'competitive';
  let mpTab_ = 'create';
  let stream = null;
  let uploadedImage = null;
  let timerInterval = null;
  let elapsedSeconds = 0;
  let countdownSeconds = 5 * 60;
  let ghostVisible = false;
  let isPaused = false;
  let isMultiplayer = false;
  let cameraFrameInterval = null;
  let snapshotCanvas = null;

  // ─── Screen Nav ───────────────────────────────
  function goTo(screen) {
    document.querySelectorAll('.screen').forEach(s => {
      s.classList.remove('active');
      s.style.display = '';
    });
    const el = document.getElementById(`screen-${screen}`);
    if (el) {
      el.style.display = 'flex';
      el.classList.add('active');
    }
    currentScreen = screen;
    if (screen !== 'menu') window.ParticleSystem?.stop();
    else window.ParticleSystem?.start();
  }

  function goToSetup(m) {
    mode = m;
    isMultiplayer = m === 'multiplayer';
    goTo('setup');
    document.getElementById('mp-setup').style.display = isMultiplayer ? 'block' : 'none';
    initCamera();
  }

  // ─── Camera ───────────────────────────────────
  async function initCamera() {
    const video = document.getElementById('setup-video');
    const noMsg = document.getElementById('no-camera-msg');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      video.srcObject = stream;
      noMsg.style.display = 'none';
      video.style.display = 'block';
    } catch (e) {
      console.warn('Camera error:', e);
      noMsg.style.display = 'flex';
      video.style.display = 'none';
    }
  }

  function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  // ─── Setup Controls ───────────────────────────
  function setDifficulty(btn, val) {
    document.querySelectorAll('#difficulty-group .pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    difficulty = val;
  }

  function setSource(btn, val) {
    btn.closest('.pill-group').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    source = val;
    if (val === 'upload') document.getElementById('img-upload').click();
  }

  function onImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => { uploadedImage = img; toast('Image loaded! ✓', 'success'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    source = 'upload';
  }

  function takeSnapshot() {
    const video = document.getElementById('setup-video');
    if (!video.srcObject) { toast('Camera not available', 'error'); return; }
    const c = document.createElement('canvas');
    c.width = video.videoWidth || 640;
    c.height = video.videoHeight || 480;
    const cx = c.getContext('2d');
    const mirror = document.getElementById('fx-mirror').checked;
    if (mirror) { cx.translate(c.width, 0); cx.scale(-1, 1); }
    cx.drawImage(video, 0, 0);
    snapshotCanvas = c;
    source = 'snapshot';
    // Show preview
    const setupCanvas = document.getElementById('setup-canvas');
    setupCanvas.width = c.width;
    setupCanvas.height = c.height;
    setupCanvas.getContext('2d').drawImage(c, 0, 0);
    toast('Snapshot taken! 📸', 'success');
  }

  function setTimer(btn, val) {
    btn.closest('.pill-group').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    timerMode = val;
    document.getElementById('countdown-input').style.display = val === 'countdown' ? 'block' : 'none';
  }

  function setMpMode(btn, val) {
    btn.closest('.pill-group').querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    mpMode = val;
  }

  function mpTab(tab) {
    mpTab_ = tab;
    document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById('mp-create').style.display = tab === 'create' ? 'block' : 'none';
    document.getElementById('mp-join').style.display = tab === 'join' ? 'block' : 'none';
  }

  // ─── Start Game ───────────────────────────────
  async function startGame() {
    const [c, r] = difficulty.split('x').map(Number);

    if (isMultiplayer) {
      // Multiplayer flow
      const name = (document.getElementById(mpTab_ === 'create' ? 'mp-name' : 'mp-join-name').value.trim()) || 'Player';
      Network.connect();
      setupNetworkHandlers();

      if (mpTab_ === 'create') {
        Network.createRoom(name, mpMode);
      } else {
        const code = document.getElementById('mp-room-code').value.trim().toUpperCase();
        if (!code) { toast('Enter a room code!', 'error'); return; }
        Network.joinRoom(code, name);
      }
      return; // lobby handles rest
    }

    // Solo flow
    await launchGame(c, r);
  }

  async function launchGame(cols, rows) {
    goTo('game');

    // Setup game video (live or snapshot)
    const gameVideo = document.getElementById('game-video');
    if (source === 'camera' && stream) {
      gameVideo.srcObject = stream;
      gameVideo.style.display = 'block';
    } else {
      gameVideo.style.display = 'none';
    }

    const settings = {
      cols, rows,
      mirror: document.getElementById('fx-mirror').checked,
      scrambleAnim: document.getElementById('fx-scramble').checked,
      celebration: document.getElementById('fx-celebrate').checked,
      rotation: document.getElementById('fx-rotation').checked,
    };

    PuzzleEngine.init(settings);

    // Load image source
    if (source === 'camera' && stream) {
      await PuzzleEngine.loadImage(document.getElementById('setup-video'));
    } else if (source === 'snapshot' && snapshotCanvas) {
      await PuzzleEngine.loadImage(snapshotCanvas);
    } else if (source === 'upload' && uploadedImage) {
      await PuzzleEngine.loadImage(uploadedImage);
    } else if (stream) {
      await PuzzleEngine.loadImage(document.getElementById('setup-video'));
    } else {
      toast('No image source! Using placeholder.', 'info');
      const c = document.createElement('canvas');
      c.width = 640; c.height = 480;
      const cx = c.getContext('2d');
      const grad = cx.createLinearGradient(0, 0, 640, 480);
      grad.addColorStop(0, '#ff3c6e'); grad.addColorStop(1, '#4d96ff');
      cx.fillStyle = grad; cx.fillRect(0, 0, 640, 480);
      cx.fillStyle = '#fff'; cx.font = 'bold 48px Orbitron, sans-serif'; cx.textAlign = 'center';
      cx.fillText('🍒 CherryLive', 320, 240);
      await PuzzleEngine.loadImage(c);
    }

    // HUD
    updateHUD();
    PuzzleEngine.onSnap((piece, count, score) => {
      updateHUD();
      onSnapCb();
    });
    PuzzleEngine.onComplete((score) => {
      onPuzzleComplete(score);
    });

    // Multiplayer scoreboard
    document.getElementById('mp-scoreboard').style.display = isMultiplayer ? 'flex' : 'none';
    if (isMultiplayer && Network.isHost()) {
      // Share initial piece positions with other players
      const pieces = PuzzleEngine.getPieceData();
      Network.startGame({ cols, rows, pieces });
    }

    startTimer();
    PuzzleEngine.startLoop();

    // Live camera frame broadcast for multiplayer
    if (isMultiplayer && source === 'camera') {
      const fv = document.getElementById('setup-video');
      const fc = document.createElement('canvas');
      fc.width = 80; fc.height = 60;
      const fctx = fc.getContext('2d');
      cameraFrameInterval = setInterval(() => {
        fctx.drawImage(fv, 0, 0, 80, 60);
        Network.sendCamera(fc.toDataURL('image/jpeg', 0.3));
      }, 500);
    }
  }

  // ─── Timer ───────────────────────────────────
  function startTimer() {
    elapsedSeconds = 0;
    countdownSeconds = (parseInt(document.getElementById('countdown-minutes')?.value) || 5) * 60;
    clearInterval(timerInterval);
    if (timerMode === 'none') { document.getElementById('hud-timer').textContent = '--:--'; return; }
    timerInterval = setInterval(() => {
      if (isPaused) return;
      elapsedSeconds++;
      if (timerMode === 'countdown') {
        const rem = countdownSeconds - elapsedSeconds;
        if (rem <= 0) { clearInterval(timerInterval); onPuzzleComplete(PuzzleEngine.getScore()); }
        document.getElementById('hud-timer').textContent = fmtTime(rem);
        if (rem <= 30) document.getElementById('hud-timer').style.color = '#ff3c6e';
      } else {
        document.getElementById('hud-timer').textContent = fmtTime(elapsedSeconds);
      }
    }, 1000);
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function stopTimer() { clearInterval(timerInterval); }

  // ─── HUD ─────────────────────────────────────
  function updateHUD() {
    const snapped = PuzzleEngine.getSnappedCount();
    const total = PuzzleEngine.getTotalPieces();
    const score = PuzzleEngine.getScore();
    document.getElementById('hud-score').textContent = score;
    document.getElementById('hud-progress-text').textContent = `${snapped} / ${total} pieces`;
    const pct = total > 0 ? (snapped / total) * 100 : 0;
    document.getElementById('hud-progress-bar').style.width = pct + '%';
  }

  function onSnapCb() {
    updateHUD();
    if (isMultiplayer) Network.emit('score_update', { score: PuzzleEngine.getScore() });
  }

  // ─── Ghost ───────────────────────────────────
  function toggleGhost() {
    ghostVisible = !ghostVisible;
    PuzzleEngine.setGhostVisible(ghostVisible);
    document.getElementById('btn-ghost').classList.toggle('active', ghostVisible);
  }

  // ─── Shuffle ─────────────────────────────────
  function shufflePieces() {
    PuzzleEngine.shufflePieces();
    toast('Pieces shuffled! 🔀');
  }

  // ─── Pause ───────────────────────────────────
  function pauseGame() {
    isPaused = true;
    document.getElementById('pause-overlay').style.display = 'flex';
  }
  function resumeGame() {
    isPaused = false;
    document.getElementById('pause-overlay').style.display = 'none';
  }

  // ─── Quit ────────────────────────────────────
  function quitGame() {
    stopTimer();
    PuzzleEngine.stopLoop();
    if (cameraFrameInterval) { clearInterval(cameraFrameInterval); cameraFrameInterval = null; }
    Network.disconnect();
    isMultiplayer = false;
    goTo('menu');
  }

  // ─── Complete ─────────────────────────────────
  function onPuzzleComplete(score) {
    stopTimer();
    PuzzleEngine.stopLoop();
    clearInterval(cameraFrameInterval);

    if (isMultiplayer) {
      Network.emit('puzzle_complete', { time: elapsedSeconds, score });
    }

    const winCanvas = document.getElementById('win-preview');
    const src = PuzzleEngine.getSourceCanvas();
    if (src) {
      winCanvas.width = 320;
      winCanvas.height = Math.round(320 * (src.height || src.videoHeight || 480) / (src.width || src.videoWidth || 640));
      winCanvas.getContext('2d').drawImage(src, 0, 0, winCanvas.width, winCanvas.height);
    }

    document.getElementById('win-time').textContent = fmtTime(elapsedSeconds);
    document.getElementById('win-score').textContent = score;
    document.getElementById('win-pieces').textContent = PuzzleEngine.getTotalPieces();
    document.getElementById('win-mp-scores').style.display = 'none';
    document.getElementById('win-emoji').textContent = score > 500 ? '🏆' : score > 200 ? '🎉' : '🍒';
    document.getElementById('win-title').textContent = timerMode === 'countdown' && elapsedSeconds >= countdownSeconds ? 'Time\'s Up!' : 'Puzzle Complete!';

    goTo('win');

    const settings_ = document.getElementById('fx-celebrate')?.checked !== false;
    if (settings_) startConfetti();
  }

  // ─── Win Screen Actions ───────────────────────
  function playAgain() {
    stopConfetti();
    goToSetup(mode);
    setTimeout(() => initCamera(), 100);
  }

  function saveWinPhoto() {
    const c = document.getElementById('win-preview');
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `cherry-puzzle-${Date.now()}.png`;
    a.click();
    toast('Photo saved! 📸', 'success');
  }

  // ─── Multiplayer ─────────────────────────────
  function setupNetworkHandlers() {
    Network.on('room_created', ({ roomId, player, room }) => {
      goTo('lobby');
      document.getElementById('lobby-room-code').textContent = roomId;
      document.getElementById('lobby-mode').textContent = room.mode;
      document.getElementById('lobby-start-wrap').style.display = 'flex';
      document.getElementById('lobby-waiting-msg').style.display = 'none';
      updateLobbyPlayers(room.players);
      toast(`Room created: ${roomId}`, 'success');
    });

    Network.on('room_joined', ({ player, room }) => {
      goTo('lobby');
      document.getElementById('lobby-room-code').textContent = room.id;
      document.getElementById('lobby-mode').textContent = room.mode;
      document.getElementById('lobby-start-wrap').style.display = 'none';
      document.getElementById('lobby-waiting-msg').style.display = 'block';
      updateLobbyPlayers(room.players);
    });

    Network.on('player_joined', ({ player, room }) => {
      updateLobbyPlayers(room.players);
      toast(`${player.name} joined! 🎉`);
    });

    Network.on('player_left', ({ playerName, room }) => {
      updateLobbyPlayers(room.players);
      toast(`${playerName} left.`);
    });

    Network.on('host_changed', ({ newHostId }) => {
      if (newHostId === Network.getSocketId()) {
        document.getElementById('lobby-start-wrap').style.display = 'flex';
        document.getElementById('lobby-waiting-msg').style.display = 'none';
      }
    });

    Network.on('game_started', async ({ gameState, mode: gMode }) => {
      const [c, r] = difficulty.split('x').map(Number);
      await launchGame(c, r);
      if (!Network.isHost() && gameState) {
        PuzzleEngine.applyInitialState(gameState.pieces);
      }
    });

    Network.on('scores_update', ({ players }) => {
      updateMpScoreboard(players);
    });

    Network.on('player_finished', ({ playerName, time, score }) => {
      toast(`${playerName} finished in ${fmtTime(time)}! 🏁`);
    });

    Network.on('chat_message', (msg) => {
      appendChat(msg);
    });

    Network.on('emoji_reaction', ({ playerName, emoji }) => {
      spawnFloatingEmoji(emoji);
      toast(`${playerName}: ${emoji}`);
    });

    Network.on('error', ({ message }) => {
      toast(message, 'error');
    });
  }

  function hostStartGame() {
    if (!Network.isHost()) return;
    const [c, r] = difficulty.split('x').map(Number);
    Network.emit('start_game', { puzzleConfig: { cols: c, rows: r, pieces: [] } });
    launchGame(c, r);
  }

  function updateLobbyPlayers(players) {
    const container = document.getElementById('lobby-players');
    const emojis = ['😸', '🐼', '🦊', '🐸', '🦁', '🐯', '🐨', '🐺'];
    container.innerHTML = players.map((p, i) => `
      <div class="lobby-player-card ${p.ready ? 'ready' : ''}" style="border-color: ${p.color}20">
        <div class="lobby-player-avatar">${emojis[i % emojis.length]}</div>
        <div class="lobby-player-name" style="color:${p.color}">${p.name}</div>
        <div class="lobby-player-status">${p.ready ? '✅ Ready' : '⏳ Waiting'}</div>
      </div>
    `).join('');
  }

  function updateMpScoreboard(players) {
    const list = document.getElementById('mp-score-list');
    const sorted = [...players].sort((a, b) => b.score - a.score);
    list.innerHTML = sorted.map(p => `
      <div class="mp-score-item">
        <div class="mp-score-dot" style="background:${p.color}"></div>
        <span class="mp-score-name">${p.name}</span>
        <span class="mp-score-val">${p.score}</span>
      </div>
    `).join('');
  }

  function copyRoomCode() {
    const code = document.getElementById('lobby-room-code').textContent;
    navigator.clipboard.writeText(code).then(() => toast('Code copied! 📋', 'success'));
  }

  function sendChat() {
    const input = document.getElementById('mp-chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    Network.emit('chat_message', { message: msg });
    input.value = '';
  }

  function sendEmoji(emoji) {
    Network.emit('emoji_reaction', { emoji });
    spawnFloatingEmoji(emoji);
  }

  function appendChat(msg) {
    const log = document.getElementById('mp-chat-log');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="chat-name" style="color:${msg.playerColor}">${msg.playerName}:</span> ${escapeHtml(msg.message)}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  function spawnFloatingEmoji(emoji) {
    const layer = document.getElementById('emoji-float-layer');
    const el = document.createElement('div');
    el.className = 'emoji-float';
    el.textContent = emoji;
    el.style.left = (20 + Math.random() * 60) + '%';
    el.style.top = (30 + Math.random() * 40) + '%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2100);
  }

  // ─── Confetti ─────────────────────────────────
  let confettiCtx, confettiParticles = [], confettiRaf;
  function startConfetti() {
    const c = document.getElementById('confetti-canvas');
    c.width = window.innerWidth; c.height = window.innerHeight;
    confettiCtx = c.getContext('2d');
    confettiParticles = [];
    const colors = ['#ff3c6e', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9a3c'];
    for (let i = 0; i < 180; i++) {
      confettiParticles.push({
        x: Math.random() * c.width,
        y: Math.random() * c.height - c.height,
        w: Math.random() * 12 + 6,
        h: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        vy: Math.random() * 3 + 2,
        vx: (Math.random() - 0.5) * 2,
        rot: Math.random() * 360,
        rotV: (Math.random() - 0.5) * 5
      });
    }
    animConfetti();
  }
  function animConfetti() {
    const c = document.getElementById('confetti-canvas');
    confettiCtx.clearRect(0, 0, c.width, c.height);
    confettiParticles.forEach(p => {
      p.y += p.vy; p.x += p.vx; p.rot += p.rotV;
      if (p.y > c.height) { p.y = -20; p.x = Math.random() * c.width; }
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot * Math.PI / 180);
      confettiCtx.fillStyle = p.color;
      confettiCtx.globalAlpha = 0.9;
      confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      confettiCtx.restore();
    });
    confettiRaf = requestAnimationFrame(animConfetti);
  }
  function stopConfetti() {
    if (confettiRaf) { cancelAnimationFrame(confettiRaf); confettiRaf = null; }
    const c = document.getElementById('confetti-canvas');
    if (c) confettiCtx?.clearRect(0, 0, c.width, c.height);
  }

  // ─── Toast ───────────────────────────────────
  function toast(msg, type = '') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3100);
  }

  // ─── How To ───────────────────────────────────
  function showHowTo() { document.getElementById('modal-howto').style.display = 'flex'; }
  function closeModal(id) { document.getElementById(`modal-${id}`).style.display = 'none'; }

  // ─── Helpers ─────────────────────────────────
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  // ─── Init ────────────────────────────────────
  function init() {
    goTo('menu');
  }

  document.addEventListener('DOMContentLoaded', init);

  // ─── Public ──────────────────────────────────
  return {
    goTo, goToSetup,
    setDifficulty, setSource, setTimer, setMpMode, mpTab,
    onImageUpload, takeSnapshot,
    startGame, pauseGame, resumeGame, quitGame,
    hostStartGame, copyRoomCode,
    toggleGhost, shufflePieces,
    sendChat, sendEmoji,
    playAgain, saveWinPhoto,
    showHowTo, closeModal,
    toast,
    // Expose for HTML onclick
    initCamera
  };
})();
