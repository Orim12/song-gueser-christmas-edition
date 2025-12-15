<script lang="ts">
  // Improved Svelte client for Kahoot-like WS server
  // FIX: Host can now see player guesses during review
    import Snowfall from '$lib/components/snowfall.svelte';
    import { PUBLIC_WS_URL } from '$env/static/public';

  let ws: WebSocket;
  // Load WS URL from SvelteKit public env with fallback
  const wsUrl: string = PUBLIC_WS_URL || 'ws://localhost:8787';
  console.log('🔌 WebSocket URL:', wsUrl);

  let name = '';
  let roomCode = '';
  let songCount = 5;

  let playerId: string | null = null;
  let room: { roomCode: any; phase: string; currentSongIndex: number; songCount: any; players: any; hostId: any; } | null = null;
  let errorMsg = '';
  let titleGuess = '';
  let artistGuess = '';

  function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    ws = new WebSocket(wsUrl);

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'welcome') {
        playerId = msg.payload.playerId;
        roomCode = msg.payload.roomCode;
      }
      if (msg.type === 'room_state') {
        room = msg.payload;
      }
      if (msg.type === 'error') {
        errorMsg = msg.payload.message;
      }
    };

    ws.onclose = () => {
      room = null;
      playerId = null;
    };
  }

  function send(type: string, payload = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, payload }));
  }

  function createRoom() {
    connect();
    send('create_room', { name, songCount });
  }

  function joinRoom() {
    connect();
    send('join_room', { name, roomCode });
  }

  function startGame() {
    send('start_game', { roomCode });
  }

  function submitGuess(titleGuess: any, artistGuess: any) {
    send('submit_guess', { roomCode, playerId, titleGuess, artistGuess });
  }

  function nextSong() {
    send('next_song', { roomCode });
  }

  function openReview() {
    send('open_review', { roomCode });
  }

  function markPlayer(pid: any, correct: boolean) {
    send('mark_player', { roomCode, playerId: pid, correct });
  }

  function restart() {
    send('restart', { roomCode });
  }
</script>

<div class="page">
    <Snowfall />
  <h1>🎄 Kerst Muziek Quiz 🎶</h1>

  {#if errorMsg}
    <div class="error">{errorMsg}</div>
  {/if}

  {#if !room}
    <div class="card">
      <input placeholder="Je naam" bind:value={name} />

      <div class="row">
        <button on:click={createRoom}>🎅 Room maken</button>
        <input placeholder="Room code" bind:value={roomCode} />
        <button on:click={joinRoom}>🎁 Join</button>
      </div>

      <input type="number" min="1" max="50" bind:value={songCount} />
    </div>
  {:else}
    <div class="card">
      <h2>🎄 Room {room.roomCode}</h2>
      <p>Fase: <b>{room.phase}</b></p>
      <p>Ronde: {room.currentSongIndex + 1} / {room.songCount}</p>

      <ul class="players">
        {#each room.players as p}
          <li class="player">
            <div class="info">
              <strong>{p.name}</strong> — ⭐ {p.score}
              {#if room.phase === 'review'}
                <div class="guesses">
                  <div><b>Titel:</b> {p.titleGuess || '—'}</div>
                  <div><b>Artiest:</b> {p.artistGuess || '—'}</div>
                </div>
              {/if}
            </div>

            {#if room.phase === 'review' && room.hostId === playerId}
              <div class="actions">
                <button on:click={() => markPlayer(p.id, true)}>✔</button>
                <button on:click={() => markPlayer(p.id, false)}>✖</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>

      {#if room.phase === 'playing' && room.hostId !== playerId}
        <div class="guess-input">
          <input placeholder="Titel" bind:value={titleGuess} />
          <input placeholder="Artiest" bind:value={artistGuess} />
          <button on:click={() => submitGuess(titleGuess, artistGuess)}>📤 Verstuur</button>
        </div>
      {/if}

      {#if room.hostId === playerId}
        <div class="host">
          {#if room.phase === 'lobby'}
            <button on:click={startGame}>▶ Start</button>
          {/if}
          {#if room.phase === 'playing'}
            <button on:click={openReview}>👀 Review</button>
          {/if}
          {#if room.phase === 'review'}
            <button on:click={nextSong}>➡ Volgende</button>
          {/if}
          {#if room.phase === 'results'}
            <button on:click={restart}>🔄 Opnieuw</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  :root {
  --gold: #ffdf6c;
  --red-1: #c1121f;
  --red-2: #780000;
  --glass: rgba(255, 255, 255, 0.12);
  --glass-strong: rgba(255, 255, 255, 0.2);
  --ink: #ffffff;
  --bg-1: #0b3d2e;
  --bg-2: #021b14;
}

/* Global reset */
:global(body) {
  margin: 0;
  font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif;
  background: radial-gradient(1200px 600px at 50% -100px, var(--bg-1), var(--bg-2));
  color: var(--ink);
}

:global(*),
:global(*::before),
:global(*::after) {
  box-sizing: border-box;
}

/* Page layout */
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: clamp(1rem, 2vw + 0.5rem, 2.5rem);
  position: relative;
  overflow: hidden;
}

/* Keep UI above snow */
.page > *:not(.snow) {
  position: relative;
  z-index: 1;
}

/* Headings */
h1 {
  color: var(--gold);
  text-shadow: 0 0 12px rgba(255, 223, 108, 0.55);
  margin-bottom: 1rem;
}

/* Cards */
.card {
  background: var(--glass);
  backdrop-filter: blur(8px) saturate(110%);
  -webkit-backdrop-filter: blur(8px) saturate(110%);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 18px;
  padding: 1.25rem;
  width: 100%;
  max-width: 560px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.35);
}

/* Inputs & buttons */
.row {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  gap: 0.5rem;
  align-items: center;
}

input {
  width: 100%;
  padding: 0.7rem 0.85rem;
  margin: 0.4rem 0;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.08);
  color: var(--ink);
  outline: none;
}

input:focus-visible {
  border-color: var(--gold);
  background: rgba(255,255,255,0.12);
  box-shadow: 0 0 0 3px rgba(255, 223, 108, 0.25);
}

button {
  background: linear-gradient(135deg, var(--red-1), var(--red-2));
  color: white;
  border: none;
  border-radius: 12px;
  padding: 0.6rem 0.95rem;
  cursor: pointer;
  font-weight: 700;
  box-shadow: 0 6px 16px rgba(0,0,0,0.25);
}

button:hover { transform: translateY(-1px); }
button:active { transform: translateY(0); }

/* Players */
.players {
  list-style: none;
  padding: 0;
  margin-top: 0.75rem;
}

.player {
  background: rgba(0,0,0,0.28);
  margin: 0.5rem 0;
  padding: 0.75rem;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.guesses {
  font-size: 0.9rem;
  margin-top: 0.35rem;
  color: var(--gold);
}

/* Error */
.error {
  background: rgba(193, 18, 31, 0.85);
  padding: 0.6rem 1rem;
  border-radius: 10px;
  margin-bottom: 1rem;
}

/* Responsive */
@media (max-width: 520px) {
  .row { grid-template-columns: 1fr; }
}

</style>
