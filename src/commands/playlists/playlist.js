import { Command } from "#structures/classes/Command";
import {
    ApplicationCommandOptionType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from "discord.js";
import { logger } from "#utils/logger";
import emoji from "#config/emoji";

export class PlaylistCommand extends Command {
    constructor() {
        super({
            name: "playlist",
            description: "Manage your custom playlists (V2)",
            category: "playlists",
            enabledSlash: true,
            slashData: {
                name: "playlist",
                description: "Manage your custom playlists (V2)",
                options: [
                    {
                        name: "create",
                        description: "Create a new playlist",
                        type: ApplicationCommandOptionType.Subcommand,
                        options: [
                            { name: "name", description: "Name of the playlist", type: ApplicationCommandOptionType.String, required: true },
                            { name: "description", description: "Optional description", type: ApplicationCommandOptionType.String, required: false },
                            { name: "public", description: "Make it public?", type: ApplicationCommandOptionType.Boolean, required: false }
                        ]
                    },
                    {
                        name: "list",
                        description: "List your playlists",
                        type: ApplicationCommandOptionType.Subcommand,
                        options: [
                            { name: "user", description: "View another user's public playlists", type: ApplicationCommandOptionType.User, required: false }
                        ]
                    },
                    {
                        name: "play",
                        description: "Play a playlist",
                        type: ApplicationCommandOptionType.Subcommand,
                        options: [
                            { name: "id", description: "Playlist ID or name", type: ApplicationCommandOptionType.String, required: true, autocomplete: true },
                            { name: "shuffle", description: "Shuffle the tracks?", type: ApplicationCommandOptionType.Boolean, required: false }
                        ]
                    },
                    {
                        name: "add",
                        description: "Add current song or a search term to a playlist",
                        type: ApplicationCommandOptionType.Subcommand,
                        options: [
                            { name: "id", description: "Playlist ID or name", type: ApplicationCommandOptionType.String, required: true, autocomplete: true },
                            { name: "query", description: "Song URL or search term (leave empty for current song)", type: ApplicationCommandOptionType.String, required: false }
                        ]
                    },
                    {
                        name: "remove",
                        description: "Remove a track at a specific position",
                        type: ApplicationCommandOptionType.Subcommand,
                        options: [
                            { name: "id", description: "Playlist ID or name", type: ApplicationCommandOptionType.String, required: true, autocomplete: true },
                            { name: "position", description: "Track position (start from 1)", type: ApplicationCommandOptionType.Integer, required: true }
                        ]
                    },
                    {
                        name: "delete",
                        description: "Delete an entire playlist",
                        type: ApplicationCommandOptionType.Subcommand,
                        options: [
                            { name: "id", description: "Playlist ID or name", type: ApplicationCommandOptionType.String, required: true, autocomplete: true }
                        ]
                    }
                ]
            }
        });
    }

    async slashExecute({ client, interaction }) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        try {
            switch (subcommand) {
                case "create": return this.handleCreate(client, interaction, userId);
                case "list": return this.handleList(client, interaction, userId);
                case "play": return this.handlePlay(client, interaction, userId);
                case "add": return this.handleAdd(client, interaction, userId);
                case "remove": return this.handleRemove(client, interaction, userId);
                case "delete": return this.handleDelete(client, interaction, userId);
                default: return interaction.reply({ content: "Unknown subcommand", ephemeral: true });
            }
        } catch (error) {
            logger.error("PlaylistCommand", `Error in ${subcommand}: ${error.message}`, error);
            if (interaction.replied || interaction.deferred) {
                return interaction.editReply({ content: `${emoji.get("error")} | Error: ${error.message}` });
            }
            return interaction.reply({ content: `${emoji.get("error")} | Error: ${error.message}`, ephemeral: true });
        }
    }

    /**
     * Autocomplete handler for playlist ID/name
     */
    async autocomplete({ client, interaction }) {
        const focusedOption = interaction.options.getFocused(true);
        const userId = interaction.user.id;

        if (focusedOption.name === "id") {
            try {
                const playlists = await client.playlistManager.getUserPlaylists(userId);
                const query = focusedOption.value.toLowerCase();

                const filtered = playlists
                    .filter(p => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query))
                    .slice(0, 25) // Discord max is 25
                    .map(p => ({
                        name: `${p.name} (${p.track_count} tracks)`,
                        value: p.id
                    }));

                return interaction.respond(filtered);
            } catch (error) {
                logger.error("PlaylistCommand", `Autocomplete error: ${error.message}`);
                return interaction.respond([]);
            }
        }

        return interaction.respond([]);
    }

    async handleCreate(client, interaction, userId) {
        const name = interaction.options.getString("name");
        const description = interaction.options.getString("description") || "";
        const isPublic = interaction.options.getBoolean("public") || false;

        await interaction.deferReply({ ephemeral: true });

        const playlist = await client.playlistManager.createPlaylist(userId, { name, description, isPublic });

        const embed = new EmbedBuilder()
            .setTitle(`${emoji.get("success")} Playlist Created`)
            .setDescription(`**Name:** ${playlist.name}\n**ID:** \`${playlist.id}\`\n**Status:** ${playlist.is_public ? "Public" : "Private"}`)
            .setColor(client.config.embedColor || "#00ff00")
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    async handleList(client, interaction, userId) {
        const targetUser = interaction.options.getUser("user") || interaction.user;
        await interaction.deferReply({ ephemeral: targetUser.id === interaction.user.id });

        const isSelf = targetUser.id === interaction.user.id;
        const playlists = await client.playlistManager.getUserPlaylists(targetUser.id, {
            includePublic: !isSelf
        });

        if (!playlists.length) {
            return interaction.editReply({ content: `${emoji.get("info")} | ${isSelf ? "You have" : `${targetUser.username} has`} no playlists yet.` });
        }

        const embed = new EmbedBuilder()
            .setTitle(`${emoji.get("folder")} ${targetUser.username}'s Playlists`)
            .setColor(client.config.embedColor || "#0099ff")
            .setTimestamp();

        const description = playlists.map((p, i) =>
            `**${i + 1}. ${p.name}** (\`${p.id}\`)\n` +
            `└─ ${emoji.get("music")} ${p.track_count} tracks | ${p.is_public ? "🔓 Public" : "🔒 Private"}`
        ).join("\n\n");

        embed.setDescription(description.substring(0, 4096));

        return interaction.editReply({ embeds: [embed] });
    }

    async handlePlay(client, interaction, userId) {
        const id = interaction.options.getString("id");
        const shuffle = interaction.options.getBoolean("shuffle") || false;

        await interaction.deferReply();

        try {
            const result = await client.playlistManager.playPlaylist(id, interaction.guildId, {
                userId,
                shuffle,
                textChannelId: interaction.channelId
            });

            return interaction.editReply({
                content: `${emoji.get("play")} | Queued **${result.tracksQueued}** tracks from playlist **${result.playlist.name}**.`
            });
        } catch (e) {
            return interaction.editReply({ content: `${emoji.get("error")} | ${e.message}` });
        }
    }

    async handleAdd(client, interaction, userId) {
        const id = interaction.options.getString("id");
        const query = interaction.options.getString("query");

        await interaction.deferReply({ ephemeral: true });

        let trackToAdd;
        if (query) {
            const result = await client.music.search(query, { requester: interaction.user });
            if (!result || !result.tracks.length) throw new Error("No tracks found for that query.");
            trackToAdd = result.tracks[0];
        } else {
            const player = client.music.players.get(interaction.guildId);
            if (!player || !player.queue.current) throw new Error("Nothing is currently playing. Provide a query to add.");
            trackToAdd = player.queue.current;
        }

        const result = await client.playlistManager.addTracks(id, userId, [trackToAdd]);

        if (result.addedCount === 0) {
            return interaction.editReply({ content: `${emoji.get("warning")} | Track is already in this playlist.` });
        }

        return interaction.editReply({ content: `${emoji.get("success")} | Added **${trackToAdd.info.title}** to playlist **${result.playlist?.name || id}**.` });
    }

    async handleRemove(client, interaction, userId) {
        const id = interaction.options.getString("id");
        const position = interaction.options.getInteger("position");

        await interaction.deferReply({ ephemeral: true });

        await client.playlistManager.removeTrackAtPosition(id, userId, position - 1); // 0-based

        return interaction.editReply({ content: `${emoji.get("success")} | Removed track at position ${position}.` });
    }

    async handleDelete(client, interaction, userId) {
        const id = interaction.options.getString("id");

        await interaction.deferReply({ ephemeral: true });

        await client.playlistManager.deletePlaylist(id, userId);

        return interaction.editReply({ content: `${emoji.get("success")} | Playlist deleted.` });
    }
}

export default new PlaylistCommand();
