const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 5e6 // 5MB for camera frames
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Room Management ────────────────────────────────────────────────────────
const rooms = new Map();

function createRoom(roomId) {
  return {
    id: roomId,
    players: new Map(),
    hostId: null,
    gameState: null,     // shared puzzle state
    started: false,
    mode: 'competitive', // 'cooperative' | 'competitive' | 'race'
    chat: []
  };
}

function getRoomInfo(room) {
  return {
    id: room.id,
    playerCount: room.players.size,
    started: room.started,
    mode: room.mode,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      score: p.score,
      color: p.color,
      ready: p.ready
    }))
  };
}

// ─── Socket Events ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Client connected: ${socket.id}`);

  // ── Create Room ──────────────────────────────────────────────────────────
  socket.on('create_room', ({ playerName, mode }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = createRoom(roomId);
    room.mode = mode || 'competitive';
    room.hostId = socket.id;

    const player = {
      id: socket.id,
      name: playerName || 'Player 1',
      score: 0,
      color: randomColor(),
      ready: false,
      roomId
    };
    room.players.set(socket.id, player);
    rooms.set(roomId, room);

    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('room_created', { roomId, player, room: getRoomInfo(room) });
    console.log(`[Room] Created: ${roomId} by ${player.name}`);
  });

  // ── Join Room ─────────────────────────────────────────────────────────────
  socket.on('join_room', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found! Check the code.' });
      return;
    }
    if (room.players.size >= 4) {
      socket.emit('error', { message: 'Room is full (max 4 players).' });
      return;
    }

    const player = {
      id: socket.id,
      name: playerName || `Player ${room.players.size + 1}`,
      score: 0,
      color: randomColor(),
      ready: false,
      roomId
    };
    room.players.set(socket.id, player);
    socket.join(roomId);
    socket.roomId = roomId;

    socket.emit('room_joined', { player, room: getRoomInfo(room), gameState: room.gameState });
    io.to(roomId).emit('player_joined', { player, room: getRoomInfo(room) });
    console.log(`[Room] ${player.name} joined: ${roomId}`);
  });

  // ── Player Ready ──────────────────────────────────────────────────────────
  socket.on('player_ready', ({ ready }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) player.ready = ready;
    io.to(socket.roomId).emit('room_update', getRoomInfo(room));
  });

  // ── Start Game ────────────────────────────────────────────────────────────
  socket.on('start_game', ({ puzzleConfig }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;

    room.started = true;
    room.gameState = {
      pieces: puzzleConfig.pieces,  // initial positions from host
      cols: puzzleConfig.cols,
      rows: puzzleConfig.rows,
      startTime: Date.now()
    };

    io.to(socket.roomId).emit('game_started', {
      gameState: room.gameState,
      mode: room.mode
    });
    console.log(`[Room] Game started in ${socket.roomId}`);
  });

  // ── Piece Moved (sync) ────────────────────────────────────────────────────
  socket.on('piece_moved', ({ pieceId, x, y, snapped }) => {
    const room = rooms.get(socket.roomId);
    if (!room || !room.gameState) return;

    const piece = room.gameState.pieces.find(p => p.id === pieceId);
    if (piece) { piece.x = x; piece.y = y; piece.snapped = snapped; }

    // Broadcast to others in same room
    socket.to(socket.roomId).emit('piece_moved', {
      pieceId, x, y, snapped,
      playerId: socket.id,
      playerColor: room.players.get(socket.id)?.color
    });
  });

  // ── Piece Grabbed / Released ──────────────────────────────────────────────
  socket.on('piece_grabbed', ({ pieceId }) => {
    socket.to(socket.roomId).emit('piece_grabbed', {
      pieceId, playerId: socket.id,
      playerColor: rooms.get(socket.roomId)?.players.get(socket.id)?.color
    });
  });
  socket.on('piece_released', ({ pieceId }) => {
    socket.to(socket.roomId).emit('piece_released', { pieceId, playerId: socket.id });
  });

  // ── Score Update ──────────────────────────────────────────────────────────
  socket.on('score_update', ({ score }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) player.score = score;
    io.to(socket.roomId).emit('scores_update', {
      players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, color: p.color }))
    });
  });

  // ── Puzzle Complete ───────────────────────────────────────────────────────
  socket.on('puzzle_complete', ({ time, score }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    io.to(socket.roomId).emit('player_finished', {
      playerId: socket.id,
      playerName: room.players.get(socket.id)?.name,
      time, score
    });
  });

  // ── Camera Frame (low-res thumbnail for others) ───────────────────────────
  socket.on('camera_frame', ({ frame }) => {
    socket.to(socket.roomId).emit('player_camera', {
      playerId: socket.id,
      frame
    });
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
  socket.on('chat_message', ({ message }) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    const msg = {
      id: Date.now(),
      playerId: socket.id,
      playerName: player?.name || 'Unknown',
      playerColor: player?.color || '#fff',
      message: message.substring(0, 200),
      time: new Date().toLocaleTimeString()
    };
    room.chat.push(msg);
    if (room.chat.length > 100) room.chat.shift();
    io.to(socket.roomId).emit('chat_message', msg);
  });

  // ── Emoji Reaction ────────────────────────────────────────────────────────
  socket.on('emoji_reaction', ({ emoji }) => {
    io.to(socket.roomId).emit('emoji_reaction', {
      playerId: socket.id,
      playerName: rooms.get(socket.roomId)?.players.get(socket.id)?.name,
      emoji
    });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    const player = room.players.get(socket.id);
    room.players.delete(socket.id);

    if (room.players.size === 0) {
      rooms.delete(socket.roomId);
      console.log(`[Room] Deleted empty room: ${socket.roomId}`);
    } else {
      if (room.hostId === socket.id) {
        room.hostId = room.players.keys().next().value;
        io.to(socket.roomId).emit('host_changed', { newHostId: room.hostId });
      }
      io.to(socket.roomId).emit('player_left', {
        playerId: socket.id,
        playerName: player?.name,
        room: getRoomInfo(room)
      });
    }
    console.log(`[-] Client disconnected: ${socket.id}`);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randomColor() {
  const colors = ['#ff6b9d','#ffd93d','#6bcb77','#4d96ff','#ff6b6b','#c77dff','#ff9a3c','#00d2d3'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🍒 CherryLive Puzzle Server running!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://<your-ip>:${PORT}  (for LAN multiplayer)\n`);
});
