/*
 Kahoot-like WebSocket game server
 - Multiple rooms
 - 6-digit room codes
 - Host leaves → room deleted
 - No persistence
*/

import { WebSocketServer } from 'ws';
import { randomBytes } from 'crypto';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const wss = new WebSocketServer({ port: PORT });

/** roomCode -> room */
const rooms = new Map();

/** ws -> { roomCode, playerId } */
const clientMeta = new WeakMap();

const phases = {
  lobby: 'lobby',
  playing: 'playing',
  review: 'review',
  results: 'results'
};

/* =====================
   HELPERS
===================== */

function genId(len = 6) {
  return randomBytes(len).toString('hex');
}

function genRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function error(ws, message) {
  send(ws, { type: 'error', payload: { message } });
}

function broadcastRoom(room) {
  wss.clients.forEach((client) => {
    const meta = clientMeta.get(client);
    if (meta?.roomCode === room.roomCode && client.readyState === client.OPEN) {
      send(client, { type: 'room_state', payload: room });
    }
  });
}

function assertHost(ws, room) {
  const meta = clientMeta.get(ws);
  if (meta?.playerId !== room.hostId) {
    error(ws, 'Only host can perform this action');
    return false;
  }
  return true;
}

/* =====================
   ROOM HANDLERS
===================== */

function handleCreateRoom(ws, payload) {
  const name = payload?.name?.trim();
  const songCount = Number(payload?.songCount);

  if (!name) return error(ws, 'Name required');
  if (!songCount) return error(ws, 'songCount required');

  let roomCode;
  do {
    roomCode = genRoomCode();
  } while (rooms.has(roomCode));

  const hostId = genId();

  const room = {
    roomCode,
    songCount,
    phase: phases.lobby,
    currentSongIndex: 0,
    hostId,
    players: [{
      id: hostId,
      name,
      score: 0,
      titleGuess: '',
      artistGuess: '',
      submitted: false,
      isCorrect: undefined
    }],
    createdAt: Date.now()
  };

  rooms.set(roomCode, room);
  clientMeta.set(ws, { roomCode, playerId: hostId });

  send(ws, { type: 'welcome', payload: { roomCode, playerId: hostId } });
  broadcastRoom(room);
}

function handleJoinRoom(ws, payload) {
  const name = payload?.name?.trim();
  const roomCode = payload?.roomCode?.trim();

  if (!name || !roomCode) {
    return error(ws, 'Name and room code required');
  }

  const room = rooms.get(roomCode);
  if (!room) return error(ws, 'Room not found');

  const playerId = genId();

  room.players.push({
    id: playerId,
    name,
    score: 0,
    titleGuess: '',
    artistGuess: '',
    submitted: false,
    isCorrect: undefined
  });

  clientMeta.set(ws, { roomCode, playerId });
  send(ws, { type: 'welcome', payload: { roomCode, playerId } });
  broadcastRoom(room);
}

function handleStartGame(ws, payload) {
  const room = rooms.get(payload?.roomCode);
  if (!room) return error(ws, 'Room not found');
  if (!assertHost(ws, room)) return;

  room.phase = phases.playing;
  room.currentSongIndex = 0;
  room.players = room.players.map(p => ({
    ...p,
    score: 0,
    titleGuess: '',
    artistGuess: '',
    submitted: false,
    isCorrect: undefined
  }));

  broadcastRoom(room);
}

function handleSubmitGuess(ws, payload) {
  const room = rooms.get(payload?.roomCode);
  if (!room || room.phase !== phases.playing) return;

  const player = room.players.find(p => p.id === payload?.playerId);
  if (!player) return;

  player.titleGuess = (payload?.titleGuess || '').trim();
  player.artistGuess = (payload?.artistGuess || '').trim();
  player.submitted = true;

  broadcastRoom(room);
}

function handleOpenReview(ws, payload) {
  const room = rooms.get(payload?.roomCode);
  if (!room) return error(ws, 'Room not found');
  if (!assertHost(ws, room)) return;

  room.phase = phases.review;
  broadcastRoom(room);
}

function handleMarkPlayer(ws, payload) {
  const room = rooms.get(payload?.roomCode);
  if (!room) return error(ws, 'Room not found');
  if (!assertHost(ws, room)) return;

  const player = room.players.find(p => p.id === payload?.playerId);
  if (!player) return;

  const correct = !!payload.correct;
  if (correct && !player.isCorrect) player.score++;
  if (!correct && player.isCorrect) player.score = Math.max(0, player.score - 1);

  player.isCorrect = correct;
  broadcastRoom(room);
}

function handleNextSong(ws, payload) {
  const room = rooms.get(payload?.roomCode);
  if (!room) return error(ws, 'Room not found');
  if (!assertHost(ws, room)) return;

  if (room.currentSongIndex < room.songCount - 1) {
    room.currentSongIndex++;
    room.phase = phases.playing;
    room.players = room.players.map(p => ({
      ...p,
      titleGuess: '',
      artistGuess: '',
      submitted: false,
      isCorrect: undefined
    }));
  } else {
    room.phase = phases.results;
  }

  broadcastRoom(room);
}

function handleRestart(ws, payload) {
  const room = rooms.get(payload?.roomCode);
  if (!room) return error(ws, 'Room not found');
  if (!assertHost(ws, room)) return;

  room.phase = phases.lobby;
  room.currentSongIndex = 0;
  room.players = room.players.map(p => ({
    ...p,
    score: 0,
    titleGuess: '',
    artistGuess: '',
    submitted: false,
    isCorrect: undefined
  }));

  broadcastRoom(room);
}

/* =====================
   WS EVENTS
===================== */

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return error(ws, 'Invalid JSON');
    }

    const { type, payload } = msg;

    switch (type) {
      case 'create_room': return handleCreateRoom(ws, payload);
      case 'join_room': return handleJoinRoom(ws, payload);
      case 'start_game': return handleStartGame(ws, payload);
      case 'submit_guess': return handleSubmitGuess(ws, payload);
      case 'open_review': return handleOpenReview(ws, payload);
      case 'mark_player': return handleMarkPlayer(ws, payload);
      case 'next_song': return handleNextSong(ws, payload);
      case 'restart': return handleRestart(ws, payload);
      default: return error(ws, 'Unknown message type');
    }
  });

  ws.on('close', () => {
    const meta = clientMeta.get(ws);
    if (!meta) return;

    const room = rooms.get(meta.roomCode);
    if (!room) return;

    // 👑 Host leaves → delete room immediately
    if (room.hostId === meta.playerId) {
      rooms.delete(room.roomCode);
      return;
    }

    // Remove player
    room.players = room.players.filter(p => p.id !== meta.playerId);

    // Delete room if empty
    if (room.players.length === 0) {
      rooms.delete(room.roomCode);
      return;
    }

    broadcastRoom(room);
  });
});

console.log(`WS server running on ws://localhost:${PORT}`);
