# PR Draft: Extract Player Button Handling & Add Tests

## Summary

This PR refactors the music interaction code by extracting button/select logic from `Playerbuttons.js` into `PlayerbuttonsHandler.js`, adds unit tests for the new branches, and fixes import/parse issues that previously prevented the test suite from running.

## Changes

- Refactor: `src/events/discord/music/Playerbuttons.js`
  - Delegate button and select handling to `PlayerbuttonsHandler.js` via dynamic imports.
  - Export `updatePlayerMessageEmbed` and `updateSelectMenuOptions` as thin wrappers for compatibility.
- New: `src/events/discord/music/PlayerbuttonsHandler.js`
  - Exports `handleButtonInteraction` and `handleSelectMenuInteraction` plus helpers `updatePlayerMessageEmbed` and `updateSelectMenuOptions`.
- Tests: `tests/player_interactions.test.js`
  - Added/updated tests for filters, effects, move select, similar-songs search/add, and favorites playlist saving.

## Testing performed

- Ran local test suite for `tymeemusic`: `node --test tests/player_interactions.test.js` (passed).
- Ran `lavalink-music-bot` test suites (passed).
- Ran simulation script `tests/simulate_player_interactions.js` to validate flows.

## Follow-ups / TODO

- Deploy branch to a dev guild and perform manual QA (embeds, emojis, requester mentions).
- Add more edge-case tests for playlist error handling and similar-songs failures.
- Open PR for review and include screenshot of MusicCard (# visual regression tests).

## Commit message

chore(refactor): extract player button/select logic to handler; add tests and changelog


---
*Add any screenshots or extra notes before opening the PR.*