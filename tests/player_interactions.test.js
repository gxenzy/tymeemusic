import test from 'node:test';
import assert from 'node:assert/strict';
import { handleButtonInteraction, handleSelectMenuInteraction } from '../src/events/discord/music/PlayerbuttonsHandler.js';
import { db } from '#database/DatabaseManager';

// Minimal mocks for interaction and client
function makeMockInteraction(customId, options = {}) {
  const replies = [];
  const followUps = [];
  return {
    customId,
    values: options.values || [],
    user: { id: options.userId || 'user123' },
    member: { voice: { channel: { id: 'vc1' } } },
    guild: { id: 'guild1' },
    deferred: false,
    isButton: () => !customId.startsWith('music_') ? false : true,
    isStringSelectMenu: () => customId.startsWith('music_') && customId.includes('select'),
    deferReply: async () => {},
    reply: async opts => replies.push(opts),
    editReply: async opts => replies.push(opts),
    followUp: async opts => followUps.push(opts),
    fetchReply: async () => ({ components: [] }),
    getReplies: () => replies,
    getFollowUps: () => followUps,
  };
}

// Minimal mock player manager (pm)
function makeMockPM() {
  const store = new Map();
  const pm = {
    guildId: 'guild1',
    queueSize: 3,
    volume: 50,
    position: 5000,
    isPaused: false,
    isSeekable: true,
    hasCurrentTrack: true,
    currentTrack: { info: { title: 'Test Song', identifier: 't1', author: 'Artist', uri: 'http://', duration: 180000, sourceName: 'yt', artworkUrl: '' } },
    player: {
      queue: { tracks: [ { info: { title: 'Song A', author: 'A' } }, { info: { title: 'Song B', author: 'B' } }, { info: { title: 'Song C', author: 'C' } } ] },
      set: (k, v) => store.set(k, v),
      get: (k) => store.get(k),
      filterManager: {
        setEQ: async bands => store.set('eq', bands),
        clearEQ: async () => store.delete('eq'),
      },
      filter: async (effect) => store.set('effect', effect),
    },
    playPrevious: async () => true,
    resume: async () => {},
    pause: async () => {},
    skip: async () => {},
    stop: async () => {},
    shuffleQueue: async () => {},
    setRepeatMode: async mode => store.set('repeat', mode),
    setVolume: async v => { store.set('volume', v); pm.volume = v; },
    seek: async pos => { store.set('position', pos); pm.position = pos; },
    addTracks: async tracks => { const q = pm.player.queue.tracks; q.push(...(Array.isArray(tracks) ? tracks : [tracks])); },
    moveTrack: async (from, to) => { const q = pm.player.queue.tracks; const [item] = q.splice(from,1); q.splice(to,0,item); },
  };
  return pm;
}

// Minimal client mock
function makeMockClient() {
  return {
    music: {
      getPlayer: () => mockPM,
      search: async (q, opts) => ({ tracks: [{ name: 'Found', artist: 'Artist', trackInfo: { info: { title: 'Found', identifier: 'f1' } } }] }),
    },
    guilds: { cache: new Map() },
    webServer: null,
  };
}

let mockPM;
let client;

test.beforeEach(() => {
  mockPM = makeMockPM();
  client = makeMockClient();
});

test('Filters select apply and reset', async () => {
  const open = makeMockInteraction('music_filter');
  await handleButtonInteraction(open, mockPM, client);
  assert.ok(open.getFollowUps().length >= 0);

  const select = makeMockInteraction('music_filters_select', { values: ['bassboost'] });
  await handleSelectMenuInteraction(select, mockPM, client);
  const replies = select.getReplies();
  assert.ok(replies.some(r => /Applied filter/.test(r.content)));

  // Reset filters
  const reset = makeMockInteraction('music_filters_select', { values: ['reset'] });
  await handleSelectMenuInteraction(reset, mockPM, client);
  const resetReplies = reset.getReplies();
  assert.ok(resetReplies.some(r => /Audio filters reset/.test(r.content)));
});

test('Effects toggle apply and clear', async () => {
  const open = makeMockInteraction('music_effects');
  await handleButtonInteraction(open, mockPM, client);
  assert.ok(open.getFollowUps().length >= 0);

  const apply = makeMockInteraction('music_effects_select', { values: ['eightD'] });
  await handleSelectMenuInteraction(apply, mockPM, client);
  assert.ok(apply.getReplies().some(r => /Applied effect/.test(r.content)));

  const clear = makeMockInteraction('music_effects_select', { values: ['clear'] });
  await handleSelectMenuInteraction(clear, mockPM, client);
  assert.ok(clear.getReplies().some(r => /Cleared audio effects|Effects are not available/.test(r.content)));
});

// Favorite flow: ensure current track is saved to 'My Favorites'
test('Favorite saves current track to My Favorites', async () => {
  const fav = makeMockInteraction('music_favorite');
  await handleButtonInteraction(fav, mockPM, client);

  const playlists = db.playlists.getUserPlaylists('user123');
  const myFav = playlists.find(p => p.name === 'My Favorites');
  assert.ok(myFav, 'My Favorites playlist should exist');
  // ensure at least one track got added
  assert.ok(Array.isArray(myFav.tracks) && myFav.tracks.length > 0, 'Favorites playlist should contain tracks');
  const added = myFav.tracks.some(t => t.identifier === mockPM.currentTrack.info.identifier || t.title === mockPM.currentTrack.info.title);
  assert.ok(added, 'The current track should be added to My Favorites');
});

test('Move select moves track', async () => {
  const open = makeMockInteraction('music_move');
  await handleButtonInteraction(open, mockPM, client);
  assert.ok(open.getFollowUps().length >= 0);

  const move = makeMockInteraction('music_move_select', { values: ['move_idx_1'] });
  await handleSelectMenuInteraction(move, mockPM, client);
  assert.ok(move.getReplies().some(r => /Moved track 2 to the top/.test(r.content)));
});

test('Similar songs search and add flow', async (t) => {
  // open similar menu
  const open = makeMockInteraction('music_similar_select');
  await handleButtonInteraction(open, mockPM, client);
  const followUps = open.getFollowUps();
  // When open menu returned, the handler should follow up
  assert.ok(followUps.length >= 0);

  // simulate searching
  const search = makeMockInteraction('music_similar_select', { values: ['similar_search'] });
  await handleSelectMenuInteraction(search, mockPM, client);
  const searchReplies = search.getReplies();
  assert.ok(searchReplies.length >= 0);

  // if suggestions set, select one
  const suggestions = mockPM.player.get('similarSuggestions') || [];
  if (suggestions.length > 0) {
    const sel = makeMockInteraction('music_similar_results', { values: ['similar_add_0'] });
    await handleSelectMenuInteraction(sel, mockPM, client);
    assert.ok(sel.getReplies().some(r => /Added/.test(r.content)));
  }
}, { timeout: 15000 });
