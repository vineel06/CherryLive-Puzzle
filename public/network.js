// ═══════════════════════════════════════════════
//   CHERRY LIVE PUZZLE — NETWORK LAYER
// ═══════════════════════════════════════════════
const Network = (function () {
  let socket = null;
  let connected = false;
  let myPlayer = null;
  let roomInfo = null;
  let isHost = false;
  let callbacks = {};

  function on(event, cb) { callbacks[event] = cb; }
  function fire(event, data) { if (callbacks[event]) callbacks[event](data); }

  function connect() {
    if (socket) return;
    socket = io(); // connects to same origin
    connected = true;

    socket.on('connect', () => {
      console.log('[Net] Connected:', socket.id);
      fire('connected', { id: socket.id });
    });

    socket.on('disconnect', () => {
      console.log('[Net] Disconnected');
      connected = false;
      fire('disconnected', {});
    });

    socket.on('error', ({ message }) => {
      fire('error', { message });
      App.toast(message, 'error');
    });

    // ── Room events ──────────────────────────
    socket.on('room_created', ({ roomId, player, room }) => {
      myPlayer = player; roomInfo = room; isHost = true;
      fire('room_created', { roomId, player, room });
    });

    socket.on('room_joined', ({ player, room, gameState }) => {
      myPlayer = player; roomInfo = room; isHost = false;
      fire('room_joined', { player, room, gameState });
    });

    socket.on('player_joined', ({ player, room }) => {
      roomInfo = room;
      fire('player_joined', { player, room });
    });

    socket.on('player_left', ({ playerId, playerName, room }) => {
      roomInfo = room;
      fire('player_left', { playerId, playerName, room });
    });

    socket.on('host_changed', ({ newHostId }) => {
      if (myPlayer && socket.id === newHostId) {
        isHost = true;
        App.toast('You are now the host!', 'info');
      }
      fire('host_changed', { newHostId });
    });

    socket.on('room_update', (room) => {
      roomInfo = room;
      fire('room_update', room);
    });

    // ── Game events ──────────────────────────
    socket.on('game_started', ({ gameState, mode }) => {
      fire('game_started', { gameState, mode });
    });

    socket.on('piece_moved', ({ pieceId, x, y, snapped, playerId, playerColor }) => {
      if (playerId !== socket.id) {
        PuzzleEngine.applyRemotePieceMove(pieceId, x, y, snapped, playerColor);
      }
    });

    socket.on('piece_grabbed', ({ pieceId, playerId, playerColor }) => {
      if (playerId !== socket.id) PuzzleEngine.setRemoteGrab(pieceId, playerColor);
    });

    socket.on('piece_released', ({ pieceId, playerId }) => {
      if (playerId !== socket.id) PuzzleEngine.clearRemoteGrab(pieceId);
    });

    socket.on('scores_update', ({ players }) => {
      fire('scores_update', { players });
    });

    socket.on('player_finished', (data) => {
      fire('player_finished', data);
    });

    // ── Chat / social ────────────────────────
    socket.on('chat_message', (msg) => {
      fire('chat_message', msg);
    });

    socket.on('emoji_reaction', (data) => {
      fire('emoji_reaction', data);
    });
  }

  function disconnect() {
    if (socket) { socket.disconnect(); socket = null; connected = false; }
  }

  function emit(event, data) {
    if (socket && socket.connected) socket.emit(event, data);
  }

  function createRoom(playerName, mode) {
    if (!socket) connect();
    socket.emit('create_room', { playerName, mode });
  }

  function joinRoom(roomId, playerName) {
    if (!socket) connect();
    socket.emit('join_room', { roomId: roomId.toUpperCase(), playerName });
  }

  function setReady(ready) { emit('player_ready', { ready }); }

  function startGame(puzzleConfig) {
    emit('start_game', { puzzleConfig });
  }

  function sendCamera(frame) {
    emit('camera_frame', { frame });
  }

  return {
    connect, disconnect, emit, on,
    createRoom, joinRoom, setReady, startGame, sendCamera,
    isConnected: () => connected && socket && socket.connected,
    isHost: () => isHost,
    getMyPlayer: () => myPlayer,
    getRoomInfo: () => roomInfo,
    getSocketId: () => socket ? socket.id : null
  };
})();
