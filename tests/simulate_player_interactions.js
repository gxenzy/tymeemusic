import PlayerHandler from '../src/events/discord/music/Playerbuttons.sim.js';
import filters from '../src/config/filters.js';

// Minimal mock implementations to exercise handlers
function createMockPlayer(guildId = 'g1') {
  const store = new Map();
  const tracks = [
    { info: { title: 'Song A', author: 'Artist A', identifier: 'a', duration: 180000 } },
    { info: { title: 'Song B', author: 'Artist B', identifier: 'b', duration: 210000 } },
    { info: { title: 'Song C', author: 'Artist C', identifier: 'c', duration: 200000 } },
  ];

  const player = {
    guildId,
    queue: {
      tracks,
      current: tracks[0],
      previous: [],
      utils: { save: async () => {} },
    },
    position: 5000,
    volume: 50,
    repeatMode: 'off',
    paused: false,
    playing: true,
    filterManager: {
      setEQ: async (bands) => { store.set('eq', bands); },
      clearEQ: async () => { store.delete('eq'); },
    },
    filter: async (name) => {
      // simulate plugin filters
      store.set('effect', name);
    },
    set: (k, v) => store.set(k, v),
    get: (k) => store.get(k),
    // a minimal player container used in pm.player.get/set
    player: {
      get: (k) => store.get(k),
      set: (k, v) => store.set(k, v),
    },
    setVolume: async (v) => { player.volume = v; },
    seek: async (p) => { player.position = p; },
    skip: async () => { tracks.shift(); player.queue.current = tracks[0]; },
    addTracks: async (t) => tracks.push(t),
    moveTrack: async (from, to) => {
      const item = tracks.splice(from, 1)[0];
      tracks.splice(to, 0, item);
      player.queue.current = tracks[0];
    },
    shuffleQueue: async () => {
      tracks.sort(() => Math.random() - 0.5);
      player.queue.current = tracks[0];
    },
    playPrevious: async () => {
      if (!player.queue.previous.length) return false;
      const item = player.queue.previous.pop();
      tracks.unshift(item);
      player.queue.current = tracks[0];
      return true;
    },
    get queueSize() { return tracks.length; },
    get currentTrack() { return player.queue.current; },
    hasCurrentTrack: !!tracks.length,
    _store: store,
    getState: () => ({ queueSize: tracks.length, volume: player.volume, position: player.position, store: Array.from(store.entries()) })
  };

  return player;
}

function createMockClient(player) {
  return {
    music: {
      getPlayer: () => player,
    },
    guilds: { cache: new Map([['g1', { emojis: { cache: new Map() }, channels: { cache: new Map() } }]]) },
    webServer: null,
  };
}

function makeInteraction({ customId, isButton = true, isStringMenu = false, guildId = 'g1', user = { id: 'u1' }, values = [] }) {
  let replied = null;
  let followed = [];
  return {
    customId,
    guild: { id: guildId },
    member: { voice: { channelId: 'vc1' } },
    user,
    values,
    isButton: () => isButton,
    isStringSelectMenu: () => isStringMenu,
    deferReply: async (opts) => {},
    editReply: async (payload) => { replied = payload; return replied; },
    reply: async (payload) => { replied = payload; return replied; },
    followUp: async (payload) => { followed.push(payload); return payload; },
    fetchReply: async () => replied,
    // helpers for tests
    getFollowed: () => followed,
    getReplied: () => replied,
  };
} 

async function run() {
  console.log('Running simulated interactions...');

  const player = createMockPlayer();
  const client = createMockClient(player);
  const handler = PlayerHandler;

  // Simulate music_shuffle button
  let inter = makeInteraction({ customId: 'music_shuffle', isButton: true });
  await handler.execute(inter, client);
  console.log('Shuffle simulated -> replied:', inter.getReplied(), 'followed:', inter.getFollowed(), 'playerState:', player.getState());

  // Simulate music_move flow: press move to open select
  inter = makeInteraction({ customId: 'music_move', isButton: true });
  await handler.execute(inter, client);
  console.log('Move button opened -> replied:', inter.getReplied(), 'followed:', inter.getFollowed(), 'playerState:', player.getState());

  // Now simulate selecting 2nd track (index 1)
  let select = makeInteraction({ customId: 'music_move_select', isButton: false, isStringMenu: true, values: ['move_idx_1'] });
  await handler.execute(select, client);
  console.log('Move select -> replied:', select.getReplied(), 'followed:', select.getFollowed(), 'playerState:', player.getState());

  // Simulate filter flow: open filter menu (button)
  inter = makeInteraction({ customId: 'music_filter', isButton: true });
  await handler.execute(inter, client);
  console.log('Filter button opened -> replied:', inter.getReplied(), 'followed:', inter.getFollowed(), 'playerState:', player.getState());

  // Simulate applying bassboost via select
  select = makeInteraction({ customId: 'music_filters_select', isButton: false, isStringMenu: true, values: ['bassboost'] });
  await handler.execute(select, client);
  console.log('Filter applied -> replied:', select.getReplied(), 'followed:', select.getFollowed(), 'playerState:', player.getState());

  // Simulate effects: open menu then apply 8D
  inter = makeInteraction({ customId: 'music_effects', isButton: true });
  await handler.execute(inter, client);
  console.log('Effects opened -> replied:', inter.getReplied(), 'followed:', inter.getFollowed(), 'playerState:', player.getState());

  select = makeInteraction({ customId: 'music_effects_select', isButton: false, isStringMenu: true, values: ['eightD'] });
  await handler.execute(select, client);
  console.log('Effect applied -> replied:', select.getReplied(), 'followed:', select.getFollowed(), 'playerState:', player.getState());

  console.log('\nSimulation complete.');
}

run().catch(err => console.error('Simulation error:', err));
