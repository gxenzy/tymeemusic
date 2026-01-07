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

class VaporwaveFilterCommand extends Command {
	constructor() {
		super({
			name: "vaporwave",
			description: "Apply vaporwave equalizer preset to the music",
			usage: "vaporwave",
			aliases: [],
			category: "music",
			examples: ["vaporwave"],
			cooldown: 2,
			voiceRequired: true,
			sameVoiceRequired: true,
			playerRequired: true,
			playingRequired: true,
			enabledSlash: true,
			slashData: {
				name: ["filter", "vaporwave"],
				description: "Apply vaporwave equalizer preset to the music",
			},
		});
	}

	async execute({ message, pm }) {
		return this._handleFilter(message, pm);
	}

	async slashExecute({ interaction, pm }) {
		return this._handleFilter(interaction, pm);
	}

	async _handleFilter(context, pm) {
		try {
			// Super Nuclear Reset before applying new timescale
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
			}

			if (typeof pm.player.setFilters === "function") {
				await pm.player.setFilters({});
			}

			if (pm.player.filterManager && pm.player.filterManager.setRate) {
				await pm.player.filterManager.setRate(0.8);
			}

			return this._reply(context, this._createSuccessContainer("Vaporwave"));
		} catch (error) {
			return this._reply(
				context,
				this._createErrorContainer("Could not apply the vaporwave filter."),
			);
		}
	}

	_createSuccessContainer(filterName) {
		const container = new ContainerBuilder();

		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`${emoji.get("music")} **Filter Applied**`,
			),
		);

		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
		);

		const content =
			`**Filter Information**\n\n` +
			`├─ **${emoji.get("music")} Filter:** ${filterName} Equalizer\n` +
			`├─ **${emoji.get("check")} Status:** Applied successfully\n` +
			`└─ **${emoji.get("info")} Effect:** Enhanced for vaporwave music\n\n` +
			`*Filter has been applied to the current playback*`;

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

export default new VaporwaveFilterCommand();