import { Command } from "#structures/classes/Command";
import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
    MessageFlags,
    SeparatorBuilder,
    SeparatorSpacingSize
} from "discord.js";
import { PlayerManager } from "#managers/PlayerManager";
import { config } from "#config/config";
import emoji from "#config/emoji";

class RadioCommand extends Command {
    constructor() {
        super({
            name: "radio",
            description: "Start a themed radio station or genre-based music stream",
            usage: "radio [genre]",
            category: "music",
            enabledSlash: true,
            voiceRequired: true,
            slashData: {
                name: ["music", "radio"],
                description: "Play themed radio stations",
                options: [
                    {
                        name: "station",
                        description: "The radio station/genre to play",
                        type: 3,
                        required: false,
                        choices: [
                            { name: "☕ Lofi/Chill", value: "lofi" },
                            { name: "🎸 Rock Classic", value: "rock" },
                            { name: "💃 Pop Hits", value: "pop" },
                            { name: "🎧 Electronic/EDM", value: "edm" },
                            { name: "🎹 Jazz/Study", value: "jazz" },
                            { name: "🔥 Hip Hop", value: "hiphop" },
                            { name: "🎮 Gaming/Phonk", value: "gaming" },
                            { name: "🌈 K-Pop", value: "kpop" }
                        ]
                    }
                ]
            }
        });

        this.stations = {
            lofi: "https://www.youtube.com/watch?v=jfKfPfyJRdk", // Lofi Girl
            rock: "https://www.youtube.com/watch?v=hTWKbfoikeg", // Classic Rock Mix
            pop: "https://www.youtube.com/playlist?list=PLMC9KNkIncKvYin_USF1qoJQnIyMAfRxl", // Pop Hits
            edm: "https://www.youtube.com/watch?v=mAKsZ26SabQ", // EDM Mix
            jazz: "https://www.youtube.com/watch?v=f_mS3W3606M", // Coffee Shop Jazz
            hiphop: "https://www.youtube.com/watch?v=MWN-P6_4-iY", // Hip Hop Gold
            gaming: "https://www.youtube.com/watch?v=BTYAsjAVa3I", // Phonk/Gaming
            kpop: "https://www.youtube.com/playlist?list=PL4fGSI1pDJn6jWqs706AuE3k58W_LToGO" // K-Pop Hits
        };
    }

    async execute({ client, message, args }) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) return message.reply("❌ You must be in a voice channel.");

        const genre = args[0]?.toLowerCase();
        if (genre && this.stations[genre]) {
            return this._startRadio(client, message, this.stations[genre], genre);
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId("music_radio_select")
            .setPlaceholder("Select a radio station")
            .addOptions([
                { label: "Lofi / Chill", value: "radio_lofi", emoji: "☕" },
                { label: "Rock Classic", value: "radio_rock", emoji: "🎸" },
                { label: "Pop Hits", value: "radio_pop", emoji: "💃" },
                { label: "EDM / Dance", value: "radio_edm", emoji: "🎧" },
                { label: "Jazz / Study", value: "radio_jazz", emoji: "🎹" },
                { label: "Hip Hop", value: "radio_hiphop", emoji: "🔥" },
                { label: "Gaming / Phonk", value: "radio_gaming", emoji: "🎮" },
                { label: "K-Pop", value: "radio_kpop", emoji: "🌈" }
            ]);

        const row = new ActionRowBuilder().addComponents(select);
        await message.reply({ content: "🎶 **Choose a radio station to start:**", components: [row] });
    }

    async slashExecute({ client, interaction }) {
        const station = interaction.options.getString("station");
        if (station && this.stations[station]) {
            await interaction.deferReply();
            return this._startRadio(client, interaction, this.stations[station], station);
        }

        const select = new StringSelectMenuBuilder()
            .setCustomId("music_radio_select")
            .setPlaceholder("Select a radio station")
            .addOptions([
                { label: "Lofi / Chill", value: "radio_lofi", emoji: "☕" },
                { label: "Rock Classic", value: "radio_rock", emoji: "🎸" },
                { label: "Pop Hits", value: "radio_pop", emoji: "💃" },
                { label: "EDM / Dance", value: "radio_edm", emoji: "🎧" },
                { label: "Jazz / Study", value: "radio_jazz", emoji: "🎹" },
                { label: "Hip Hop", value: "radio_hiphop", emoji: "🔥" },
                { label: "Gaming / Phonk", value: "radio_gaming", emoji: "🎮" },
                { label: "K-Pop", value: "radio_kpop", emoji: "🌈" }
            ]);

        const row = new ActionRowBuilder().addComponents(select);
        await interaction.reply({ content: "🎶 **Choose a radio station to start:**", components: [row], ephemeral: true });
    }

    async _startRadio(client, context, url, name) {
        const guildId = context.guild.id;
        const voiceChannelId = context.member.voice.channel.id;

        const player = client.music.getPlayer(guildId) || await client.music.createPlayer({
            guildId,
            voiceChannelId,
            textChannelId: context.channel.id
        });

        const pm = new PlayerManager(player);
        if (!pm.isConnected) await pm.connect();

        const result = await client.music.search(url, { requester: (context.user || context.author) });
        if (!result || !result.tracks.length) {
            const msg = "❌ Could not load radio station.";
            return context.editReply ? context.editReply(msg) : context.reply(msg);
        }

        await pm.addTracks(result.tracks);
        if (!pm.isPlaying) await pm.play();

        const title = name.charAt(0).toUpperCase() + name.slice(1);
        const content = `📻 **Radio Started:** ${title} station is now playing!`;

        if (context.editReply) {
            await context.editReply({ content });
        } else {
            await context.reply({ content });
        }
    }
}

export default RadioCommand;
