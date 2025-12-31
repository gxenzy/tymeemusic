# Changelog

## Unreleased

### Changed
- Refactor: Extracted interaction button and select logic into `src/events/discord/music/PlayerbuttonsHandler.js` to improve maintainability and resolve import-time syntax errors.

### Added
- Tests: `tests/player_interactions.test.js` — covers filter apply/reset, effects toggle/clear, move select, similar song search/add, and favorites flow.

### Fixed
- Resolved `SyntaxError: Unexpected token 'catch'` in `Playerbuttons.js` by reworking legacy handlers and delegating to new handler module.


---
