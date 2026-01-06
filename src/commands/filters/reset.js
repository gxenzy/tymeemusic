import {
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";

import { config } from "#config/config";
import { Command } from "#structures/classes/Command";
import emoji from "#config/emoji";
class ResetFilterCommand extends Command {
	constructor() {
		super({
			name: "reset",
			description: "Reset all audio filters to default",
			usage: "reset",
			aliases: ["clear-filter", "resetfilter"],
			category: "music",
			examples: ["reset", "clear"],
			cooldown: 2,
			voiceRequired: true,
			sameVoiceRequired: true,
			playerRequired: true,
			enabledSlash: true,
			playingRequired: true,
			slashData: {
				name: "reset",
				description: "Reset all audio filters to default",
			},
		});
	}

	async execute({ message, pm }) {
		return this._handleResetFilter(message, pm);
	}

	async slashExecute({ interaction, pm }) {
		return this._handleResetFilter(interaction, pm);
	}

	async _handleResetFilter(context, pm) {
		try {
			// Super Nuclear Reset: Wipe every piece of internal state
			if (pm.player.filterManager) {
				const fm = pm.player.filterManager;
				const props = ['equalizer', 'timescale', 'karaoke', 'tremolo', 'vibrato', 'distortion', 'rotation', 'channelMix', 'lowPass'];
				props.forEach(p => {
					try {
						if (p === 'equalizer') fm[p] = [];
						else fm[p] = null;
					} catch (e) { }
				});
				if (fm.data) fm.data = {};
				// THIS IS THE KEY FIX: Clear the separate equalizerBands array!
				if (fm.equalizerBands) fm.equalizerBands = [];

				if (fm.setSpeed) await fm.setSpeed(1.0);
				if (fm.setPitch) await fm.setPitch(1.0);
				if (fm.setRate) await fm.setRate(1.0);
			}

			// Send clear packet to Lavalink
			if (typeof pm.player.setFilters === "function") {
				await pm.player.setFilters({});
			} else if (pm.player.filterManager) {
				await pm.player.filterManager.resetFilters();
			}

			pm.player.lastFilterName = null;

			return this._reply(context, this._createSuccessContainer());
		} catch (error) {
			return this._reply(
				context,
				this._createErrorContainer("Could not reset the audio filters."),
			);
		}
	}

	_createSuccessContainer() {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("reset")} **Filters Reset**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Reset Information**\n\n` +
			`├─ **${emoji.get("music")} Filters:** All filters cleared\n` +
			`├─ **${emoji.get("check")} Status:** Reset successfully\n` +
			`└─ **${emoji.get("info")} Effect:** Audio back to original quality\n\n` +
			`*All audio filters have been removed*`;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						config.assets?.defaultThumbnail ||
						config.assets?.defaultTrackArtwork,
					),
				),
		);

		return container;
	}

	_createErrorContainer(message) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(`${emoji.get("cross")} **Error**`),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Something went wrong**\n\n` +
			`├─ **${emoji.get("info")} Issue:** ${message}\n` +
			`└─ **${emoji.get("reset")} Action:** Try again or contact support\n\n` +
			`*Please check your input and try again*`;

		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
				.setThumbnailAccessory(
					new ThumbnailBuilder().setURL(
						config.assets?.defaultThumbnail ||
						config.assets?.defaultTrackArtwork,
					),
				),
		);

		return container;
	}

	async _reply(context, container) {
		const payload = {
			components: [container],
			flags: MessageFlags.IsComponentsV2,
		};
		if (context.reply) {
			return context.reply(payload);
		}
		return context.channel.send(payload);
	}
}
export default new ResetFilterCommand();