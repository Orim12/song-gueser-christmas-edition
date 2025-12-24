<script lang="ts">
  import Snowfall from '$lib/components/snowfall.svelte';
  import { PUBLIC_WS_URL } from '$env/static/public';

  let ws: WebSocket;
  const wsUrl: string = PUBLIC_WS_URL || 'ws://localhost:8787';
  console.log('🔌 WebSocket URL:', wsUrl);

  let name = '';
  let roomCode = '';

  let playerId: string | null = null;
  let room: { roomCode: any; phase: string; currentSongIndex: number; songCount: any; players: any; hostId: any; } | null = null;
  let errorMsg = '';
  let titleGuess = '';
  let artistGuess = '';
  let isLoading = false;
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 5;
  let shouldReconnect = false;

  $: hostPlayer = room?.players?.find((p: any) => p.id === room?.hostId);
  $: nonHostPlayers = room?.players?.filter((p: any) => p.id !== room?.hostId) ?? [];

  async function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        reconnectAttempts = 0;
        shouldReconnect = true;
        resolve();
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Connection failed'));
      };
    });

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'ping') {
        send('pong');
        return;
      }
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
      if (shouldReconnect && reconnectAttempts < maxReconnectAttempts && room) {
        reconnectAttempts++;
        console.log(`Reconnecting... attempt ${reconnectAttempts}`);
        const savedPlayerId = playerId; // Save playerId before reconnecting
        setTimeout(() => {
          connect().then(() => {
            if (name && roomCode) {
              send('join_room', { name, roomCode, playerId: savedPlayerId });
            }
          }).catch(err => {
            console.error('Reconnection failed:', err);
          });
        }, 1000 * reconnectAttempts);
      } else {
        room = null;
        playerId = null;
        shouldReconnect = false;
      }
    };
  }

  function send(type: string, payload = {}) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, payload }));
  }

  async function joinRoom() {
    isLoading = true;
    shouldReconnect = false;
    reconnectAttempts = 0;
    try {
      await connect();
      send('join_room', { name, roomCode });
    } catch (err) {
      errorMsg = 'Kan geen verbinding maken. Probeer het opnieuw.';
    } finally {
      isLoading = false;
    }
  }

  function submitGuess(titleGuess: any, artistGuess: any) {
    send('submit_guess', { roomCode, playerId, titleGuess, artistGuess });
  }
</script>

<div class="page">
  <Snowfall />
  <h1>🎄 Kerst Muziek Quiz - Speler 🎶</h1>

  {#if errorMsg}
    <div class="error">{errorMsg}</div>
  {/if}

  {#if !room}
    <div class="card">
      <input placeholder="Je naam" bind:value={name} disabled={isLoading} />
      <input placeholder="Room code" bind:value={roomCode} disabled={isLoading} />
      <button on:click={joinRoom} disabled={isLoading}>
        {#if isLoading}
          <span class="spinner"></span> Verbinden...
        {:else}
          🎁 Join
        {/if}
      </button>
    </div>
  {:else}
    <div class="card">
      <h2>🎄 Room {room.roomCode}</h2>
      <p>Fase: <b>{room.phase}</b></p>
      <p>Ronde: {room.currentSongIndex + 1} / {room.songCount}</p>

      {#if hostPlayer}
        <div class="host-info">
          <div class="row">
            <strong>{hostPlayer.name}</strong> — ⭐ {hostPlayer.score}
            <span class="badge badge-host">Host</span>
          </div>
        </div>
      {/if}

      <ul class="players">
        {#each nonHostPlayers as p}
          <li class="player">
            <div class="info">
              <div class="row">
                <strong>{p.name}</strong> — ⭐ {p.score}
                <span class={`badge ${p.titleGuess || p.artistGuess ? 'badge-answered' : 'badge-pending'}`}>
                  {p.titleGuess || p.artistGuess ? 'Ingestuurd' : 'Nog niet' }
                </span>
              </div>
            </div>
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

input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
  margin-right: 0.5rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

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

.host-info {
  background: rgba(0,0,0,0.35);
  padding: 0.75rem;
  border-radius: 12px;
  margin-top: 0.5rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.badge {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
}

.badge-host {
  background: rgba(255, 223, 108, 0.25);
  color: var(--gold);
  border: 1px solid rgba(255, 223, 108, 0.45);
}

.badge-answered {
  background: rgba(0, 128, 0, 0.2);
  color: #9aff9a;
  border: 1px solid rgba(0, 128, 0, 0.35);
}

.badge-pending {
  background: rgba(193, 18, 31, 0.2);
  color: #ffc4c4;
  border: 1px solid rgba(193, 18, 31, 0.35);
}

/* Input styling */
.guess-input {
  margin-top: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.guess-input button {
  width: 100%;
}

</style>
