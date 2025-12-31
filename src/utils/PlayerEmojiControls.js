import { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder 
} from 'discord.js';

class PlayerEmojiControls {
    constructor(bot) {
        this.bot = bot;
    }

    async createPlayerEmbed(guildId, track, status = 'playing') {
        const emojiManager = this.bot.emojiManager;
        
        const [playing, volumeUp, volumeDown, music] = await Promise.all([
            emojiManager.resolveEmoji(guildId, 'playing'),
            emojiManager.resolveEmoji(guildId, 'volume_up'),
            emojiManager.resolveEmoji(guildId, 'volume_down'),
            emojiManager.resolveEmoji(guildId, 'music')
        ]);

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`${playing} Now Playing`)
            .setDescription(`**${track.title}**`)
            .addFields(
                { name: 'Artist', value: track.author || 'Unknown', inline: true },
                { name: 'Duration', value: this.formatDuration(track.duration), inline: true },
                { name: 'Source', value: track.source || 'Unknown', inline: true }
            )
            .setThumbnail(track.thumbnail || 'https://cdn.discordapp.com/attachments/1234567890/1234567890/music.png')
            .setFooter({ 
                text: `Requested by ${track.requester?.tag || 'Unknown'}`,
                iconURL: track.requester?.displayAvatarURL() 
            })
            .setTimestamp();

        if (track.url) {
            embed.setURL(track.url);
        }

        return embed;
    }

    async createPlayerControls(guildId, options = {}) {
        const {
            isPlaying = true,
            isPaused = false,
            loop = 'none',
            shuffle = false,
            volume = 50
        } = options;

        const emojiManager = this.bot.emojiManager;
        
        const [play, pause, stop, skip, previous, shuffleEmoji, loopEmoji, queue] = await Promise.all([
            emojiManager.resolveEmoji(guildId, 'play'),
            emojiManager.resolveEmoji(guildId, 'pause'),
            emojiManager.resolveEmoji(guildId, 'stop'),
            emojiManager.resolveEmoji(guildId, 'skip'),
            emojiManager.resolveEmoji(guildId, 'previous'),
            emojiManager.resolveEmoji(guildId, 'shuffle'),
            emojiManager.resolveEmoji(guildId, loop === 'track' ? 'loop_track' : 'loop'),
            emojiManager.resolveEmoji(guildId, 'queue')
        ]);

        const mainRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('player:previous')
                .setEmoji(previous)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Previous'),
            new ButtonBuilder()
                .setCustomId(isPaused ? 'player:play' : (isPlaying ? 'player:pause' : 'player:play'))
                .setEmoji(isPaused ? play : pause)
                .setStyle(ButtonStyle.Primary)
                .setLabel(isPaused ? 'Play' : (isPlaying ? 'Pause' : 'Play')),
            new ButtonBuilder()
                .setCustomId('player:stop')
                .setEmoji(stop)
                .setStyle(ButtonStyle.Danger)
                .setLabel('Stop'),
            new ButtonBuilder()
                .setCustomId('player:skip')
                .setEmoji(skip)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Skip'),
            new ButtonBuilder()
                .setCustomId('player:shuffle')
                .setEmoji(shuffleEmoji)
                .setStyle(shuffle ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setLabel('Shuffle')
        );

        const secondaryRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('player:loop')
                .setEmoji(loopEmoji)
                .setStyle(loop !== 'none' ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setLabel('Loop'),
            new ButtonBuilder()
                .setCustomId('player:queue')
                .setEmoji(queue)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Queue'),
            new ButtonBuilder()
                .setCustomId('player:rewind')
                .setEmoji('⏪')
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Rewind'),
            new ButtonBuilder()
                .setCustomId('player:forward')
                .setEmoji('⏩')
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Forward'),
            new ButtonBuilder()
                .setCustomId('player:volume')
                .setEmoji(volume > 50 ? '🔊' : '🔉')
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Volume')
        );

        return [mainRow, secondaryRow];
    }

    async createVolumeControl(guildId, volume = 50) {
        const emojiManager = this.bot.emojiManager;
        
        const [volumeDown, volumeUp, volumeMute] = await Promise.all([
            emojiManager.resolveEmoji(guildId, 'volume_down'),
            emojiManager.resolveEmoji(guildId, 'volume_up'),
            emojiManager.resolveEmoji(guildId, 'volume_mute')
        ]);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('volume:decrease')
                .setEmoji(volumeDown)
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('volume:increase')
                .setEmoji(volumeUp)
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('volume:mute')
                .setEmoji(volumeMute)
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('volume:reset')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Reset')
        );

        return row;
    }

    async createQueueEmbed(guildId, queue, page = 1, itemsPerPage = 10) {
        const emojiManager = this.bot.emojiManager;
        
        const [queueEmoji, playing] = await Promise.all([
            emojiManager.resolveEmoji(guildId, 'queue'),
            emojiManager.resolveEmoji(guildId, 'playing')
        ]);

        const totalPages = Math.ceil(queue.length / itemsPerPage);
        const startIndex = (page - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, queue.length);
        const queuePage = queue.slice(startIndex, endIndex);

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`${queueEmoji} Queue`)
            .setDescription(
                queuePage.length > 0 
                    ? queuePage.map((track, index) => 
                        `${startIndex + index + 1}. **${track.title}** - ${this.formatDuration(track.duration || 0)}`
                    ).join('\n')
                    : 'Queue is empty'
            )
            .setFooter({ text: `Page ${page}/${totalPages} | ${queue.length} tracks` })
            .setTimestamp();

        return { embed, page, totalPages };
    }

    async createQueueControls(guildId) {
        const emojiManager = this.bot.emojiManager;
        
        const [shuffle, clear, remove] = await Promise.all([
            emojiManager.resolveEmoji(guildId, 'shuffle'),
            emojiManager.resolveEmoji(guildId, 'stop'),
            emojiManager.resolveEmoji(guildId, 'remove')
        ]);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('queue:shuffle')
                .setEmoji(shuffle)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Shuffle'),
            new ButtonBuilder()
                .setCustomId('queue:clear')
                .setEmoji(clear)
                .setStyle(ButtonStyle.Danger)
                .setLabel('Clear'),
            new ButtonBuilder()
                .setCustomId('queue:bump')
                .setEmoji('⬆️')
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Bump')
        );

        return row;
    }

    async createFilterControls(guildId, activeFilters = {}) {
        const emojiManager = this.bot.emojiManager;
        
        const filterEmojis = {};
        const filterNames = [
            'bassboost', 'equalizer', 'boost', 'soft', 'bass', 'deepbass', 'superbass',
            'flat', 'warm', 'metal', 'oldschool', 'classical', 'electronic',
            'hiphop', 'jazz', 'pop', 'reggae', 'rock', 'gaming', 'nightcore',
            'vaporwave', 'vocals', 'bright', 'treble', 'reset'
        ];

        for (const name of filterNames) {
            filterEmojis[name] = await emojiManager.resolveEmoji(guildId, name);
        }

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('filters:select')
                .setPlaceholder('Select a filter...')
                .addOptions([
                    { label: 'Bass Boost', value: 'bassboost', emoji: filterEmojis.bassboost },
                    { label: 'Boost', value: 'boost', emoji: filterEmojis.boost },
                    { label: 'Soft', value: 'soft', emoji: filterEmojis.soft },
                    { label: 'Flat', value: 'flat', emoji: filterEmojis.flat },
                    { label: 'Warm', value: 'warm', emoji: filterEmojis.warm },
                    { label: 'Nightcore', value: 'nightcore', emoji: filterEmojis.nightcore },
                    { label: 'Vaporwave', value: 'vaporwave', emoji: filterEmojis.vaporwave },
                    { label: 'Metal', value: 'metal', emoji: filterEmojis.metal },
                    { label: 'Old School', value: 'oldschool', emoji: filterEmojis.oldschool },
                    { label: 'Reset Filters', value: 'reset', emoji: filterEmojis.reset }
                ])
        );

        const statusRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('filters:reset')
                .setEmoji(filterEmojis.reset)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Reset All')
        );

        return [row, statusRow];
    }

    async createPlaylistControls(guildId) {
        const emojiManager = this.bot.emojiManager;
        
        const [add, remove, save, load, list] = await Promise.all([
            emojiManager.resolveEmoji(guildId, 'add'),
            emojiManager.resolveEmoji(guildId, 'remove'),
            emojiManager.resolveEmoji(guildId, 'save'),
            emojiManager.resolveEmoji(guildId, 'add'),
            emojiManager.resolveEmoji(guildId, 'playlist')
        ]);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('playlist:list')
                .setEmoji(list)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('My Playlists'),
            new ButtonBuilder()
                .setCustomId('playlist:create')
                .setEmoji(add)
                .setStyle(ButtonStyle.Primary)
                .setLabel('Create'),
            new ButtonBuilder()
                .setCustomId('playlist:load')
                .setEmoji(load)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Load')
        );

        return row;
    }

    async createNowPlayingMessage(guildId, track, status = 'playing') {
        const embed = await this.createPlayerEmbed(guildId, track, status);
        const controls = await this.createPlayerControls(guildId, {
            isPlaying: status === 'playing',
            isPaused: status === 'paused'
        });

        return { embeds: [embed], components: controls };
    }

    async createStatusEmbed(guildId, player) {
        const emojiManager = this.bot.emojiManager;
        
        const [playing, loading, error, success] = await Promise.all([
            emojiManager.resolveEmoji(guildId, 'playing'),
            emojiManager.resolveEmoji(guildId, 'loading'),
            emojiManager.resolveEmoji(guildId, 'error'),
            emojiManager.resolveEmoji(guildId, 'success')
        ]);

        const embed = new EmbedBuilder()
            .setColor(player.playing ? '#00FF00' : (player.paused ? '#FFFF00' : '#FF0000'))
            .setTitle(`${player.playing ? playing : (player.paused ? loading : error)} Player Status`)
            .addFields(
                { name: 'Status', value: player.playing ? 'Playing' : (player.paused ? 'Paused' : 'Stopped'), inline: true },
                { name: 'Volume', value: `${player.volume}%`, inline: true },
                { name: 'Queue Size', value: `${player.queue.length} tracks`, inline: true },
                { name: 'Loop', value: player.repeat.charAt(0).toUpperCase() + player.repeat.slice(1), inline: true },
                { name: 'Shuffle', value: player.shuffle ? success : 'Disabled', inline: true },
                { name: 'Connected Channel', value: player.voiceChannelId ? `<#${player.voiceChannelId}>` : 'None', inline: true }
            )
            .setTimestamp();

        if (player.current) {
            embed.addFields({ 
                name: 'Current Track', 
                value: `**${player.current.title}**\n${this.formatDuration(player.position || 0)} / ${this.formatDuration(player.current.duration || 0)}`,
                inline: false 
            });
        }

        return embed;
    }

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

export default PlayerEmojiControls;
