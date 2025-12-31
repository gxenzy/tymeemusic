const emojiConfig = {
    categories: [
        {
            name: 'playback',
            priority: 1,
            emojis: [
                { botName: 'play', discordName: 'play', fallback: '▶️', description: 'Play button' },
                { botName: 'pause', discordName: 'pause', fallback: '⏸️', description: 'Pause button' },
                { botName: 'stop', discordName: 'stop', fallback: '⏹️', description: 'Stop button' },
                { botName: 'skip', discordName: 'skip', fallback: '⏭️', description: 'Skip to next track' },
                { botName: 'previous', discordName: 'previous', fallback: '⏮️', description: 'Previous track' },
                { botName: 'shuffle', discordName: 'shuffle', fallback: '🔀', description: 'Shuffle queue' },
                { botName: 'loop', discordName: 'loop', fallback: '🔁', description: 'Loop queue/track' },
                { botName: 'loop_track', discordName: 'loop_track', fallback: '🔂', description: 'Loop single track' },
                { botName: 'queue', discordName: 'queue', fallback: '📋', description: 'Queue list' },
                { botName: 'now_playing', discordName: 'now_playing', fallback: '🎵', description: 'Now playing' }
            ]
        },
        {
            name: 'filters',
            priority: 2,
            emojis: [
                { botName: 'bassboost', discordName: 'bassboost', fallback: '🎸', description: 'Bass boost filter' },
                { botName: 'equalizer', discordName: 'equalizer', fallback: '🎚️', description: 'Equalizer' },
                { botName: 'boost', discordName: 'boost', fallback: '📈', description: 'Boost filter' },
                { botName: 'soft', discordName: 'soft', fallback: '🌊', description: 'Soft filter' },
                { botName: 'bass', discordName: 'bass', fallback: '🎧', description: 'Bass filter' },
                { botName: 'deepbass', discordName: 'deepbass', fallback: '💥', description: 'Deep bass filter' },
                { botName: 'superbass', discordName: 'superbass', fallback: '👾', description: 'Super bass filter' },
                { botName: 'flat', discordName: 'flat', fallback: '📐', description: 'Flat filter' },
                { botName: 'warm', discordName: 'warm', fallback: '🔥', description: 'Warm filter' },
                { botName: 'metal', discordName: 'metal', fallback: '🤘', description: 'Metal filter' },
                { botName: 'oldschool', discordName: 'oldschool', fallback: '📻', description: 'Old school filter' },
                { botName: 'classical', discordName: 'classical', fallback: '🎻', description: 'Classical filter' },
                { botName: 'electronic', discordName: 'electronic', fallback: '🎹', description: 'Electronic filter' },
                { botName: 'hiphop', discordName: 'hiphop', fallback: '🎤', description: 'Hip-hop filter' },
                { botName: 'jazz', discordName: 'jazz', fallback: '🎷', description: 'Jazz filter' },
                { botName: 'pop', discordName: 'pop', fallback: '⭐', description: 'Pop filter' },
                { botName: 'reggae', discordName: 'reggae', fallback: '☀️', description: 'Reggae filter' },
                { botName: 'rock', discordName: 'rock', fallback: '🎸', description: 'Rock filter' },
                { botName: 'gaming', discordName: 'gaming', fallback: '🎮', description: 'Gaming filter' },
                { botName: 'nightcore', discordName: 'nightcore', fallback: '🌙', description: 'Nightcore filter' },
                { botName: 'vaporwave', discordName: 'vaporwave', fallback: '🧉', description: 'Vaporwave filter' },
                { botName: 'vocals', discordName: 'vocals', fallback: '🎼', description: 'Vocals filter' },
                { botName: 'bright', discordName: 'bright', fallback: '💡', description: 'Bright filter' },
                { botName: 'treble', discordName: 'treble', fallback: '📶', description: 'Treble filter' },
                { botName: 'reset', discordName: 'reset', fallback: '🔄', description: 'Reset filters' }
            ]
        },
        {
            name: 'status',
            priority: 3,
            emojis: [
                { botName: 'playing', discordName: 'playing', fallback: '🎵', description: 'Currently playing' },
                { botName: 'loading', discordName: 'loading', fallback: '⏳', description: 'Loading' },
                { botName: 'error', discordName: 'error', fallback: '❌', description: 'Error' },
                { botName: 'success', discordName: 'success', fallback: '✅', description: 'Success' },
                { botName: 'warning', discordName: 'warning', fallback: '⚠️', description: 'Warning' },
                { botName: 'info', discordName: 'info', fallback: 'ℹ️', description: 'Information' },
                { botName: 'search', discordName: 'search', fallback: '🔍', description: 'Search' },
                { botName: 'music', discordName: 'music', fallback: '🎶', description: 'Music' },
                { botName: 'playlist', discordName: 'playlist', fallback: '📝', description: 'Playlist' },
                { botName: 'volume_up', discordName: 'volume_up', fallback: '🔊', description: 'Volume up' },
                { botName: 'volume_down', discordName: 'volume_down', fallback: '🔉', description: 'Volume down' },
                { botName: 'volume_mute', discordName: 'volume_mute', fallback: '🔇', description: 'Volume mute' },
                { botName: 'repeat_one', discordName: 'repeat_one', fallback: '🔂', description: 'Repeat one' },
                { botName: 'forward', discordName: 'forward', fallback: '⏩', description: 'Forward' },
                { botName: 'rewind', discordName: 'rewind', fallback: '⏪', description: 'Rewind' },
                { botName: 'seek', discordName: 'seek', fallback: '🎯', description: 'Seek' },
                { botName: 'replay', discordName: 'replay', fallback: '🔃', description: 'Replay' }
            ]
        },
        {
            name: 'navigation',
            priority: 4,
            emojis: [
                { botName: 'home', discordName: 'home', fallback: '🏠', description: 'Home' },
                { botName: 'back', discordName: 'back', fallback: '⬅️', description: 'Back' },
                { botName: 'forward_nav', discordName: 'forward', fallback: '➡️', description: 'Forward' },
                { botName: 'refresh', discordName: 'refresh', fallback: '🔄', description: 'Refresh' },
                { botName: 'settings', discordName: 'settings', fallback: '⚙️', description: 'Settings' },
                { botName: 'help', discordName: 'help', fallback: '❓', description: 'Help' }
            ]
        },
        {
            name: 'actions',
            priority: 5,
            emojis: [
                { botName: 'add', discordName: 'add', fallback: '➕', description: 'Add' },
                { botName: 'remove', discordName: 'remove', fallback: '➖', description: 'Remove' },
                { botName: 'delete', discordName: 'delete', fallback: '🗑️', description: 'Delete' },
                { botName: 'edit', discordName: 'edit', fallback: '✏️', description: 'Edit' },
                { botName: 'save', discordName: 'save', fallback: '💾', description: 'Save' },
                { botName: 'cancel', discordName: 'cancel', fallback: '🚫', description: 'Cancel' },
                { botName: 'confirm', discordName: 'confirm', fallback: '✔️', description: 'Confirm' },
                { botName: 'upload', discordName: 'upload', fallback: '📤', description: 'Upload' },
                { botName: 'download', discordName: 'download', fallback: '📥', description: 'Download' },
                { botName: 'search', discordName: 'search', fallback: '🔎', description: 'Search' },
                { botName: 'filter', discordName: 'filter', fallback: '🔣', description: 'Filter' },
                { botName: 'sort', discordName: 'sort', fallback: '📊', description: 'Sort' },
                { botName: 'move', discordName: 'move', fallback: '🔀', description: 'Move' },
                { botName: 'bump', discordName: 'bump', fallback: '⬆️', description: 'Bump' }
            ]
        }
    ]
};

export default emojiConfig;
