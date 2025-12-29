import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';
import { logger } from '#utils/logger';
import { db } from '#database/DatabaseManager';

export default class MusicCard {
	constructor() {
		this.registerFonts();
	}

	registerFonts() {
		try {
			const fontPaths = [
				{
					path: join(process.cwd(), '..', '..', 'fonts'),
					context: 'trackStart',
				},
				{
					path: join(process.cwd(), 'src', 'fonts'),
					context: 'command',
				},
				{ path: join(process.cwd(), 'fonts'), context: 'root' },
				{
					path: join(process.cwd(), 'assets', 'fonts'),
					context: 'assets',
				},
			];

			let fontsRegistered = false;

			for (const fontPath of fontPaths) {
				try {
					GlobalFonts.registerFromPath(
						join(fontPath.path, 'NotoSansJP-Bold.ttf'),
						'Noto Sans JP Bold',
					);
					GlobalFonts.registerFromPath(
						join(fontPath.path, 'NotoSansJP-Regular.ttf'),
						'Noto Sans JP',
					);
					GlobalFonts.registerFromPath(
						join(fontPath.path, 'Inter-Bold.ttf'),
						'Inter Bold',
					);
					GlobalFonts.registerFromPath(
						join(fontPath.path, 'Inter-SemiBold.ttf'),
						'Inter SemiBold',
					);
					GlobalFonts.registerFromPath(
						join(fontPath.path, 'Inter-Medium.ttf'),
						'Inter Medium',
					);
					GlobalFonts.registerFromPath(
						join(fontPath.path, 'Inter-Regular.ttf'),
						'Inter',
					);

					logger.success(
						'MusicCard',
						`Fonts registered successfully from: ${fontPath.path} (${fontPath.context})`,
					);
					fontsRegistered = true;
					break;
				} catch (e) {
					console.error(
						`Error while registering fonts from path: ${fontPath.path}: ${e}`,
					);
					continue;
				}
			}

			if (!fontsRegistered) {
				logger.warn(
					'MusicCard',
					'Could not register custom fonts from any path. Using system defaults.',
				);
			}
		} catch (e) {
			logger.error('MusicCard', 'Font registration error:', e);
		}
	}

	createFrostedGlass(ctx, x, y, width, height, radius = 15) {
		ctx.save();

		ctx.beginPath();
		ctx.roundRect(x, y, width, height, radius);
		ctx.clip();

		ctx.fillStyle = 'rgba(20, 25, 40, 0.4)';
		ctx.fillRect(x, y, width, height);

		for (let i = 0; i < 3; i++) {
			ctx.fillStyle = `rgba(100, 120, 160, ${0.05 - i * 0.015})`;
			ctx.filter = `blur(${2 + i}px)`;
			ctx.fillRect(x - 10, y - 10, width + 20, height + 20);
		}
		ctx.filter = 'none';

		const innerGlow = ctx.createRadialGradient(
			x + width / 2,
			y + height / 2,
			0,
			x + width / 2,
			y + height / 2,
			Math.max(width, height) / 2,
		);
		innerGlow.addColorStop(0, 'rgba(180, 200, 220, 0.08)');
		innerGlow.addColorStop(1, 'rgba(180, 200, 220, 0)');
		ctx.fillStyle = innerGlow;
		ctx.fillRect(x, y, width, height);

		ctx.strokeStyle = 'rgba(180, 200, 220, 0.3)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(x, y, width, height, radius);
		ctx.stroke();

		ctx.restore();
	}

	createFrostSnowflake(ctx, x, y, size, opacity = 0.3) {
		ctx.save();
		ctx.translate(x, y);

		ctx.shadowColor = `rgba(200, 220, 240, ${opacity * 0.4})`;
		ctx.shadowBlur = size * 0.8;

		ctx.fillStyle = `rgba(220, 230, 250, ${opacity})`;
		ctx.strokeStyle = `rgba(200, 220, 240, ${opacity * 0.8})`;
		ctx.lineWidth = size * 0.05;

		for (let i = 0; i < 6; i++) {
			ctx.rotate(Math.PI / 3);

			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(0, -size);
			ctx.stroke();

			ctx.beginPath();
			ctx.moveTo(0, -size * 0.7);
			ctx.lineTo(-size * 0.15, -size * 0.55);
			ctx.moveTo(0, -size * 0.7);
			ctx.lineTo(size * 0.15, -size * 0.55);
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(0, -size, size * 0.08, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.beginPath();
		ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2);
		ctx.fillStyle = `rgba(240, 245, 255, ${opacity})`;
		ctx.fill();

		ctx.restore();
	}

	createSnowflakeDecorations(ctx, width, height) {
		ctx.save();

		for (let i = 0; i < 4; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			const size = 20 + Math.random() * 15;
			const opacity = 0.1 + Math.random() * 0.15;
			this.createFrostSnowflake(ctx, x, y, size, opacity);
		}

		for (let i = 0; i < 8; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			const size = 10 + Math.random() * 10;
			const opacity = 0.15 + Math.random() * 0.2;
			this.createFrostSnowflake(ctx, x, y, size, opacity);
		}

		for (let i = 0; i < 15; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			const size = 1 + Math.random() * 2;

			ctx.fillStyle = `rgba(220, 230, 250, ${0.2 + Math.random() * 0.3})`;
			ctx.beginPath();
			ctx.arc(x, y, size, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.restore();
	}

	createFrostText(ctx, text, x, y, fontSize, fontFamily, isTitle = false) {
		ctx.save();

		ctx.font = `${fontSize}px "${fontFamily}"`;
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';

		ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
		ctx.fillText(text, x + 1, y + 1);

		if (isTitle) {
			ctx.fillStyle = '#ffffff';
			ctx.shadowColor = 'rgba(200, 220, 240, 0.4)';
			ctx.shadowBlur = 8;
		} else {
			ctx.fillStyle = '#e0e8f0';
		}

		ctx.fillText(text, x, y);

		ctx.restore();
	}

	createFrostedProgressBar(ctx, x, y, width, height, progress) {
		ctx.save();

		ctx.beginPath();
		ctx.roundRect(x, y, width, height, height / 2);
		ctx.clip();

		ctx.fillStyle = 'rgba(30, 40, 60, 0.3)';
		ctx.fillRect(x, y, width, height);

		for (let i = 0; i < 2; i++) {
			ctx.filter = `blur(${3 + i * 2}px)`;
			ctx.fillStyle = `rgba(100, 130, 180, ${0.1 - i * 0.04})`;
			ctx.fillRect(x - 5, y - 5, width + 10, height + 10);
		}
		ctx.filter = 'none';

		const innerHighlight = ctx.createLinearGradient(x, y, x, y + height);
		innerHighlight.addColorStop(0, 'rgba(200, 220, 240, 0.2)');
		innerHighlight.addColorStop(0.5, 'rgba(200, 220, 240, 0.05)');
		innerHighlight.addColorStop(1, 'rgba(200, 220, 240, 0.1)');
		ctx.fillStyle = innerHighlight;
		ctx.fillRect(x, y, width, height);

		if (progress > 0) {
			const progressWidth = width * progress;

			const progressGradient = ctx.createLinearGradient(
				x,
				y,
				x + progressWidth,
				y,
			);
			progressGradient.addColorStop(0, 'rgba(100, 180, 255, 0.7)');
			progressGradient.addColorStop(0.5, 'rgba(120, 190, 255, 0.8)');
			progressGradient.addColorStop(1, 'rgba(140, 200, 255, 0.7)');

			ctx.fillStyle = progressGradient;
			ctx.fillRect(x, y, progressWidth, height);

			const shine = ctx.createLinearGradient(x, y, x, y + height);
			shine.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
			shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
			shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
			ctx.fillStyle = shine;
			ctx.fillRect(x, y, progressWidth, height);
		}

		ctx.restore();

		ctx.strokeStyle = 'rgba(180, 200, 220, 0.4)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(x, y, width, height, height / 2);
		ctx.stroke();

		if (progress > 0) {
			ctx.save();
			ctx.shadowColor = 'rgba(140, 200, 255, 0.8)';
			ctx.shadowBlur = 12;
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(
				x + width * progress,
				y + height / 2,
				height / 2 + 2,
				0,
				Math.PI * 2,
			);
			ctx.fill();

			ctx.fillStyle = 'rgba(140, 200, 255, 0.9)';
			ctx.beginPath();
			ctx.arc(
				x + width * progress,
				y + height / 2,
				height / 2 - 1,
				0,
				Math.PI * 2,
			);
			ctx.fill();
			ctx.restore();
		}
	}

	async drawArtwork(ctx, track, x, y, size) {
		ctx.save();

		try {
			const artworkUrl =
				track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl;
			if (artworkUrl) {
				const artwork = await loadImage(artworkUrl);

				ctx.shadowColor = 'rgba(140, 180, 220, 0.3)';
				ctx.shadowBlur = 20;
				ctx.fillStyle = 'rgba(100, 140, 180, 0.1)';
				ctx.beginPath();
				ctx.roundRect(x, y, size, size, 18);
				ctx.fill();

				ctx.beginPath();
				ctx.roundRect(x, y, size, size, 18);
				ctx.clip();
				ctx.drawImage(artwork, x, y, size, size);

				const frostOverlay = ctx.createRadialGradient(
					x + size * 0.5,
					y + size * 0.5,
					0,
					x + size * 0.5,
					y + size * 0.5,
					size * 0.7,
				);
				frostOverlay.addColorStop(0, 'rgba(220, 230, 250, 0)');
				frostOverlay.addColorStop(0.7, 'rgba(180, 200, 220, 0.05)');
				frostOverlay.addColorStop(1, 'rgba(140, 180, 220, 0.1)');
				ctx.fillStyle = frostOverlay;
				ctx.fillRect(x, y, size, size);
			} else {
				throw new Error('No artwork URL available');
			}
		} catch (e) {
			// Modern placeholder design
			ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
			ctx.shadowBlur = 25;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 8;

			const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
			gradient.addColorStop(0, 'rgba(100, 150, 255, 0.2)');
			gradient.addColorStop(0.5, 'rgba(150, 100, 255, 0.2)');
			gradient.addColorStop(1, 'rgba(255, 100, 150, 0.2)');

			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.roundRect(x, y, size, size, 20);
			ctx.fill();

			// Music note icon
			ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
			ctx.font = `${size * 0.4}px "Inter"`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('♪', x + size / 2, y + size / 2);

			ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.roundRect(x + 1, y + 1, size - 2, size - 2, 19);
			ctx.stroke();
		}
		ctx.restore();

		ctx.save();
		ctx.strokeStyle = 'rgba(180, 200, 220, 0.4)';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.roundRect(x - 1, y - 1, size + 2, size + 2, 19);
		ctx.stroke();
		ctx.restore();
	}

	truncateText(ctx, text, maxWidth, font, ellipsis = '...') {
		ctx.font = font;
		if (ctx.measureText(text).width <= maxWidth) {
			return text;
		}

		let truncated = text;
		while (
			ctx.measureText(truncated + ellipsis).width > maxWidth &&
			truncated.length > 0
		) {
			truncated = truncated.slice(0, -1);
		}
		return truncated + ellipsis;
	}

	formatDuration(ms) {
		if (ms === null || ms === undefined || ms < 0) return '0:00';
		const seconds = Math.floor((ms / 1000) % 60)
			.toString()
			.padStart(2, '0');
		const minutes = Math.floor((ms / (1000 * 60)) % 60).toString();
		const hours = Math.floor(ms / (1000 * 60 * 60));
		if (hours > 0) {
			return `${hours}:${minutes.padStart(2, '0')}:${seconds}`;
		}
		return `${minutes}:${seconds}`;
	}

	applyDefaultBackground(ctx, width, height) {
		const bgGradient = ctx.createRadialGradient(
			width * 0.5,
			height * 0.5,
			0,
			width * 0.5,
			height * 0.5,
			width * 0.7,
		);
		bgGradient.addColorStop(0, '#1a1f35');
		bgGradient.addColorStop(0.4, '#161b2e');
		bgGradient.addColorStop(0.7, '#141825');
		bgGradient.addColorStop(1, '#0f1320');
		ctx.fillStyle = bgGradient;
		ctx.fillRect(0, 0, width, height);

		const overlayGradient = ctx.createLinearGradient(0, 0, width, height);
		overlayGradient.addColorStop(0, 'rgba(100, 130, 180, 0.05)');
		overlayGradient.addColorStop(0.5, 'rgba(80, 120, 160, 0.02)');
		overlayGradient.addColorStop(1, 'rgba(100, 130, 180, 0.05)');
		ctx.fillStyle = overlayGradient;
		ctx.fillRect(0, 0, width, height);
	}

	applyModernBackground(ctx, width, height) {
		// Create a modern gradient background
		const bgGradient = ctx.createLinearGradient(0, 0, width, height);
		bgGradient.addColorStop(0, '#0f0f23');
		bgGradient.addColorStop(0.3, '#1a1a2e');
		bgGradient.addColorStop(0.7, '#16213e');
		bgGradient.addColorStop(1, '#0f0f23');
		ctx.fillStyle = bgGradient;
		ctx.fillRect(0, 0, width, height);

		// Add subtle noise pattern
		ctx.save();
		ctx.globalAlpha = 0.03;
		for (let i = 0; i < 1000; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			const size = Math.random() * 2;
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(x, y, size, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	createModernDecorations(ctx, width, height) {
		ctx.save();

		// Subtle geometric patterns
		const patternSize = 40;
		ctx.globalAlpha = 0.02;

		for (let x = 0; x < width; x += patternSize) {
			for (let y = 0; y < height; y += patternSize) {
				if ((x + y) % (patternSize * 2) === 0) {
					ctx.fillStyle = '#ffffff';
					ctx.fillRect(x, y, patternSize / 4, patternSize / 4);
				}
			}
		}

		// Floating particles
		ctx.globalAlpha = 0.1;
		for (let i = 0; i < 50; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			const size = Math.random() * 3 + 1;

			const particleGradient = ctx.createRadialGradient(x, y, 0, x, y, size);
			particleGradient.addColorStop(0, 'rgba(100, 150, 255, 0.6)');
			particleGradient.addColorStop(1, 'rgba(100, 150, 255, 0)');

			ctx.fillStyle = particleGradient;
			ctx.beginPath();
			ctx.arc(x, y, size, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.restore();
	}

	async drawModernArtwork(ctx, track, x, y, size) {
		ctx.save();

		try {
			const artworkUrl =
				track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl;
			if (artworkUrl) {
				const artwork = await loadImage(artworkUrl);

				// Enhanced shadow for depth
				ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
				ctx.shadowBlur = 25;
				ctx.shadowOffsetX = 0;
				ctx.shadowOffsetY = 8;

				// Rounded corners with modern styling
				ctx.beginPath();
				ctx.roundRect(x, y, size, size, 20);
				ctx.clip();
				ctx.drawImage(artwork, x, y, size, size);

				// Subtle inner glow
				ctx.shadowColor = 'rgba(100, 150, 255, 0.3)';
				ctx.shadowBlur = 15;
				ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.roundRect(x + 1, y + 1, size - 2, size - 2, 19);
				ctx.stroke();
			} else {
				throw new Error('No artwork URL available');
			}
		} catch (e) {
			// Modern placeholder design
			ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
			ctx.shadowBlur = 25;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 8;

			const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
			gradient.addColorStop(0, 'rgba(100, 150, 255, 0.2)');
			gradient.addColorStop(0.5, 'rgba(150, 100, 255, 0.2)');
			gradient.addColorStop(1, 'rgba(255, 100, 150, 0.2)');

			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.roundRect(x, y, size, size, 20);
			ctx.fill();

			// Music note icon
			ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
			ctx.font = `${size * 0.4}px "Inter"`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('♪', x + size / 2, y + size / 2);

			ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.roundRect(x + 1, y + 1, size - 2, size - 2, 19);
			ctx.stroke();
		}

		ctx.restore();
	}

	createModernProgressBar(ctx, x, y, width, height, progress) {
		ctx.save();

		// Background track
		ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.beginPath();
		ctx.roundRect(x, y, width, height, height / 2);
		ctx.fill();

		// Progress fill with gradient
		if (progress > 0) {
			const progressWidth = width * progress;

			const progressGradient = ctx.createLinearGradient(x, y, x + progressWidth, y);
			progressGradient.addColorStop(0, '#3b82f6');
			progressGradient.addColorStop(0.5, '#6366f1');
			progressGradient.addColorStop(1, '#8b5cf6');

			ctx.fillStyle = progressGradient;
			ctx.beginPath();
			ctx.roundRect(x, y, progressWidth, height, height / 2);
			ctx.fill();

			// Shine effect
			const shineGradient = ctx.createLinearGradient(x, y, x, y + height);
			shineGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
			shineGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
			shineGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

			ctx.fillStyle = shineGradient;
			ctx.beginPath();
			ctx.roundRect(x, y, progressWidth, height, height / 2);
			ctx.fill();

			// Progress indicator dot
			const dotX = x + progressWidth;
			const dotY = y + height / 2;

			ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
			ctx.shadowBlur = 8;
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(dotX, dotY, height / 2 + 2, 0, Math.PI * 2);
			ctx.fill();

			ctx.shadowColor = 'none';
			ctx.fillStyle = '#3b82f6';
			ctx.beginPath();
			ctx.arc(dotX, dotY, height / 2, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.restore();
	}

	getGradientByName(name, ctx, width, height) {
		const gradients = {
			blue: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#1e3a8a');
				gradient.addColorStop(0.5, '#3b82f6');
				gradient.addColorStop(1, '#1e40af');
				return gradient;
			},
			purple: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#581c87');
				gradient.addColorStop(0.5, '#8b5cf6');
				gradient.addColorStop(1, '#6d28d9');
				return gradient;
			},
			sunset: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#dc2626');
				gradient.addColorStop(0.5, '#ea580c');
				gradient.addColorStop(1, '#b91c1c');
				return gradient;
			},
			forest: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#14532d');
				gradient.addColorStop(0.5, '#16a34a');
				gradient.addColorStop(1, '#166534');
				return gradient;
			},
			ocean: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#0c4a6e');
				gradient.addColorStop(0.5, '#0369a1');
				gradient.addColorStop(1, '#075985');
				return gradient;
			},
			fire: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#dc2626');
				gradient.addColorStop(0.5, '#ef4444');
				gradient.addColorStop(1, '#b91c1c');
				return gradient;
			},
			cosmic: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#1e1b4b');
				gradient.addColorStop(0.5, '#312e81');
				gradient.addColorStop(1, '#1e1b4b');
				return gradient;
			},
			aurora: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#0f172a');
				gradient.addColorStop(0.3, '#1e293b');
				gradient.addColorStop(0.7, '#334155');
				gradient.addColorStop(1, '#0f172a');
				return gradient;
			},
			rose: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#be185d');
				gradient.addColorStop(0.5, '#ec4899');
				gradient.addColorStop(1, '#db2777');
				return gradient;
			},
			gold: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#92400e');
				gradient.addColorStop(0.5, '#d97706');
				gradient.addColorStop(1, '#b45309');
				return gradient;
			},
			night: () => {
				const gradient = ctx.createLinearGradient(0, 0, width, height);
				gradient.addColorStop(0, '#1f2937');
				gradient.addColorStop(0.5, '#374151');
				gradient.addColorStop(1, '#111827');
				return gradient;
			}
		};

		return gradients[name] ? gradients[name]() : null;
	}

	applySpotifyBackground(ctx, width, height) {
		// Clean solid dark background like Spotify
		ctx.fillStyle = '#121212';
		ctx.fillRect(0, 0, width, height);
	}

	applyEnhancedModernBackground(ctx, width, height) {
		// Create a sophisticated multi-layered background
		const bgGradient = ctx.createRadialGradient(
			width * 0.3,
			height * 0.3,
			0,
			width * 0.7,
			height * 0.7,
			width * 0.8,
		);
		bgGradient.addColorStop(0, '#0a0a0f');
		bgGradient.addColorStop(0.3, '#1a1a2e');
		bgGradient.addColorStop(0.6, '#16213e');
		bgGradient.addColorStop(1, '#0f0f23');
		ctx.fillStyle = bgGradient;
		ctx.fillRect(0, 0, width, height);

		// Add subtle vignette effect
		const vignette = ctx.createRadialGradient(
			width / 2,
			height / 2,
			0,
			width / 2,
			height / 2,
			Math.max(width, height) / 2,
		);
		vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
		vignette.addColorStop(0.7, 'rgba(0, 0, 0, 0.1)');
		vignette.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
		ctx.fillStyle = vignette;
		ctx.fillRect(0, 0, width, height);

		// Add subtle noise pattern for texture
		ctx.save();
		ctx.globalAlpha = 0.02;
		for (let i = 0; i < 1500; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			const size = Math.random() * 1.5 + 0.5;
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(x, y, size, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	createEnhancedDecorations(ctx, width, height) {
		ctx.save();

		// Floating geometric shapes
		ctx.globalAlpha = 0.03;
		const shapes = ['circle', 'triangle', 'square'];
		for (let i = 0; i < 25; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			const size = Math.random() * 8 + 4;
			const shape = shapes[Math.floor(Math.random() * shapes.length)];

			ctx.fillStyle = `rgba(${100 + Math.random() * 100}, ${150 + Math.random() * 100}, ${200 + Math.random() * 100}, 0.1)`;

			switch (shape) {
				case 'circle':
					ctx.beginPath();
					ctx.arc(x, y, size, 0, Math.PI * 2);
					ctx.fill();
					break;
				case 'triangle':
					ctx.beginPath();
					ctx.moveTo(x, y - size);
					ctx.lineTo(x - size, y + size);
					ctx.lineTo(x + size, y + size);
					ctx.closePath();
					ctx.fill();
					break;
				case 'square':
					ctx.fillRect(x - size / 2, y - size / 2, size, size);
					break;
			}
		}

		// Animated light rays
		ctx.globalAlpha = 0.05;
		for (let i = 0; i < 8; i++) {
			const angle = (i * Math.PI * 2) / 8;
			const startX = width / 2;
			const startY = height / 2;
			const endX = startX + Math.cos(angle) * width * 0.8;
			const endY = startY + Math.sin(angle) * height * 0.8;

			const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
			gradient.addColorStop(0, 'rgba(100, 150, 255, 0.1)');
			gradient.addColorStop(0.5, 'rgba(150, 100, 255, 0.05)');
			gradient.addColorStop(1, 'rgba(255, 100, 150, 0)');

			ctx.strokeStyle = gradient;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(startX, startY);
			ctx.lineTo(endX, endY);
			ctx.stroke();
		}

		// Floating particles with glow
		ctx.globalAlpha = 0.08;
		for (let i = 0; i < 60; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			const size = Math.random() * 4 + 1;

			const particleGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 2);
			particleGradient.addColorStop(0, `rgba(${100 + Math.random() * 100}, ${150 + Math.random() * 100}, ${200 + Math.random() * 100}, 0.6)`);
			particleGradient.addColorStop(1, 'rgba(100, 150, 255, 0)');

			ctx.fillStyle = particleGradient;
			ctx.beginPath();
			ctx.arc(x, y, size * 2, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.restore();
	}

	async drawEnhancedModernArtwork(ctx, track, x, y, size) {
		ctx.save();

		try {
			const artworkUrl =
				track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl;
			if (artworkUrl) {
				const artwork = await loadImage(artworkUrl);

				// Enhanced shadow with multiple layers for depth
				ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
				ctx.shadowBlur = 35;
				ctx.shadowOffsetX = 0;
				ctx.shadowOffsetY = 12;

				// Outer glow effect
				ctx.save();
				ctx.shadowColor = 'rgba(100, 150, 255, 0.4)';
				ctx.shadowBlur = 50;
				ctx.strokeStyle = 'rgba(100, 150, 255, 0.1)';
				ctx.lineWidth = 4;
				ctx.beginPath();
				ctx.roundRect(x - 2, y - 2, size + 4, size + 4, 22);
				ctx.stroke();
				ctx.restore();

				// Main artwork with rounded corners
				ctx.beginPath();
				ctx.roundRect(x, y, size, size, 20);
				ctx.clip();
				ctx.drawImage(artwork, x, y, size, size);

				// Inner highlight overlay
				const highlight = ctx.createRadialGradient(
					x + size * 0.3,
					y + size * 0.3,
					0,
					x + size * 0.7,
					y + size * 0.7,
					size * 0.8,
				);
				highlight.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
				highlight.addColorStop(0.7, 'rgba(255, 255, 255, 0.05)');
				highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
				ctx.fillStyle = highlight;
				ctx.fillRect(x, y, size, size);

				// Subtle vignette on artwork
				const vignette = ctx.createRadialGradient(
					x + size / 2,
					y + size / 2,
					0,
					x + size / 2,
					y + size / 2,
					size / 2,
				);
				vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
				vignette.addColorStop(0.8, 'rgba(0, 0, 0, 0.1)');
				vignette.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
				ctx.fillStyle = vignette;
				ctx.fillRect(x, y, size, size);
			} else {
				throw new Error('No artwork URL available');
			}
		} catch (e) {
			// Enhanced placeholder with animated gradient
			ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
			ctx.shadowBlur = 35;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 12;

			const placeholderGradient = ctx.createLinearGradient(x, y, x + size, y + size);
			placeholderGradient.addColorStop(0, 'rgba(100, 150, 255, 0.3)');
			placeholderGradient.addColorStop(0.5, 'rgba(150, 100, 255, 0.3)');
			placeholderGradient.addColorStop(1, 'rgba(255, 100, 150, 0.3)');

			ctx.fillStyle = placeholderGradient;
			ctx.beginPath();
			ctx.roundRect(x, y, size, size, 20);
			ctx.fill();

			// Enhanced music note with glow
			ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
			ctx.shadowBlur = 15;
			ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
			ctx.font = `${size * 0.5}px "Inter", "Noto Sans JP"`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('♪', x + size / 2, y + size / 2);

			// Inner border
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.roundRect(x + 2, y + 2, size - 4, size - 4, 18);
			ctx.stroke();
		}

		ctx.restore();
	}

	createEnhancedFrostedProgressBar(ctx, x, y, width, height, progress) {
		ctx.save();

		// Background track with frosted glass effect
		ctx.beginPath();
		ctx.roundRect(x, y, width, height, height / 2);
		ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.fill();

		// Frosted glass overlay on background
		for (let i = 0; i < 2; i++) {
			ctx.filter = `blur(${2 + i}px)`;
			ctx.fillStyle = `rgba(100, 130, 180, ${0.05 - i * 0.02})`;
			ctx.fillRect(x - 5, y - 5, width + 10, height + 10);
		}
		ctx.filter = 'none';

		// Progress fill with enhanced gradient
		if (progress > 0) {
			const progressWidth = width * progress;

			const progressGradient = ctx.createLinearGradient(x, y, x + progressWidth, y);
			progressGradient.addColorStop(0, 'rgba(59, 130, 246, 0.9)');
			progressGradient.addColorStop(0.3, 'rgba(99, 102, 241, 0.95)');
			progressGradient.addColorStop(0.7, 'rgba(139, 92, 246, 0.9)');
			progressGradient.addColorStop(1, 'rgba(168, 85, 247, 0.85)');

			ctx.fillStyle = progressGradient;
			ctx.beginPath();
			ctx.roundRect(x, y, progressWidth, height, height / 2);
			ctx.fill();

			// Enhanced shine effect
			const shineGradient = ctx.createLinearGradient(x, y, x, y + height);
			shineGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
			shineGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
			shineGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

			ctx.fillStyle = shineGradient;
			ctx.beginPath();
			ctx.roundRect(x, y, progressWidth, height, height / 2);
			ctx.fill();

			// Animated progress indicator with glow
			const dotX = x + progressWidth;
			const dotY = y + height / 2;

			// Outer glow
			ctx.shadowColor = 'rgba(59, 130, 246, 0.8)';
			ctx.shadowBlur = 15;
			ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
			ctx.beginPath();
			ctx.arc(dotX, dotY, height / 2 + 3, 0, Math.PI * 2);
			ctx.fill();

			// Inner dot
			ctx.shadowColor = 'none';
			ctx.fillStyle = 'rgba(59, 130, 246, 1)';
			ctx.beginPath();
			ctx.arc(dotX, dotY, height / 2, 0, Math.PI * 2);
			ctx.fill();

			// Center highlight
			ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
			ctx.beginPath();
			ctx.arc(dotX - 1, dotY - 1, height / 4, 0, Math.PI * 2);
			ctx.fill();
		}

		// Subtle border
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(x, y, width, height, height / 2);
		ctx.stroke();

		ctx.restore();
	}

	async drawSpotifyArtwork(ctx, track, x, y, size) {
		ctx.save();

		try {
			const artworkUrl =
				track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl;
			if (artworkUrl) {
				const artwork = await loadImage(artworkUrl);

				// Clean rounded corners, no shadows or effects
				ctx.beginPath();
				ctx.roundRect(x, y, size, size, 12);
				ctx.clip();
				ctx.drawImage(artwork, x, y, size, size);
			} else {
				throw new Error('No artwork URL available');
			}
		} catch (e) {
			// Clean placeholder design
			ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
			ctx.beginPath();
			ctx.roundRect(x, y, size, size, 12);
			ctx.fill();

			// Music note icon
			ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
			ctx.font = `${size * 0.4}px "Inter", "Noto Sans JP"`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('♪', x + size / 2, y + size / 2);
		}

		ctx.restore();
	}

	createSpotifyProgressBar(ctx, x, y, width, height, progress) {
		ctx.save();

		// Background track - thin line
		ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
		ctx.fillRect(x, y, width, height);

		// Progress fill - solid white
		if (progress > 0) {
			const progressWidth = width * progress;
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(x, y, progressWidth, height);
		}

		ctx.restore();
	}

	// ═══════════════════════════════════════════════════════════
	// NEW MODERN UI METHODS
	// ═══════════════════════════════════════════════════════════

	applyCleanModernBackground(ctx, width, height) {
		// Clean dark base
		ctx.fillStyle = '#0a0a0a';
		ctx.fillRect(0, 0, width, height);

		// Subtle gradient overlay
		const gradient = ctx.createLinearGradient(0, 0, width, height);
		gradient.addColorStop(0, 'rgba(15, 15, 25, 1)');
		gradient.addColorStop(0.5, 'rgba(10, 10, 18, 1)');
		gradient.addColorStop(1, 'rgba(8, 8, 15, 1)');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);

		// Accent glow (top-left) - very subtle
		const glow1 = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.7);
		glow1.addColorStop(0, 'rgba(99, 102, 241, 0.08)');
		glow1.addColorStop(0.5, 'rgba(99, 102, 241, 0.02)');
		glow1.addColorStop(1, 'transparent');
		ctx.fillStyle = glow1;
		ctx.fillRect(0, 0, width, height);

		// Accent glow (bottom-right)
		const glow2 = ctx.createRadialGradient(width, height, 0, width, height, width * 0.5);
		glow2.addColorStop(0, 'rgba(139, 92, 246, 0.06)');
		glow2.addColorStop(1, 'transparent');
		ctx.fillStyle = glow2;
		ctx.fillRect(0, 0, width, height);

		// Subtle noise texture
		ctx.save();
		ctx.globalAlpha = 0.015;
		for (let i = 0; i < 800; i++) {
			const x = Math.random() * width;
			const y = Math.random() * height;
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(x, y, 1, 1);
		}
		ctx.restore();
	}

	async drawCleanModernArtwork(ctx, track, x, y, size) {
		ctx.save();
		const radius = 16;

		try {
			const artworkUrl =
				track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl;

			if (artworkUrl) {
				const artwork = await loadImage(artworkUrl);

				// Multi-layer shadow for depth
				ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
				ctx.shadowBlur = 40;
				ctx.shadowOffsetY = 15;

				// Background shape for shadow
				ctx.fillStyle = '#1a1a1a';
				ctx.beginPath();
				ctx.roundRect(x, y, size, size, radius);
				ctx.fill();

				// Reset shadow for image
				ctx.shadowColor = 'transparent';

				// Clip and draw artwork
				ctx.beginPath();
				ctx.roundRect(x, y, size, size, radius);
				ctx.clip();
				ctx.drawImage(artwork, x, y, size, size);

				// Subtle glass reflection overlay
				const reflection = ctx.createLinearGradient(x, y, x, y + size * 0.5);
				reflection.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
				reflection.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
				reflection.addColorStop(1, 'transparent');
				ctx.fillStyle = reflection;
				ctx.fillRect(x, y, size, size);
			} else {
				throw new Error('No artwork');
			}
		} catch (e) {
			// Modern placeholder
			const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
			gradient.addColorStop(0, '#1e1e2e');
			gradient.addColorStop(1, '#151520');

			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.roundRect(x, y, size, size, radius);
			ctx.fill();

			// Subtle border
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
			ctx.lineWidth = 1;
			ctx.stroke();

			// Music icon
			ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
			ctx.font = `${size * 0.3}px "Inter"`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('♫', x + size / 2, y + size / 2);
		}

		ctx.restore();

		// Subtle outer glow ring
		ctx.save();
		ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.roundRect(x - 1, y - 1, size + 2, size + 2, radius + 1);
		ctx.stroke();
		ctx.restore();
	}

	drawCleanProgressBar(ctx, x, y, width, height, progress, isLive = false) {
		ctx.save();
		const radius = height / 2;

		// Background track
		ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
		ctx.beginPath();
		ctx.roundRect(x, y, width, height, radius);
		ctx.fill();

		if (progress > 0) {
			const progressWidth = Math.max(width * progress, height);

			// Progress gradient
			const gradient = ctx.createLinearGradient(x, y, x + width, y);
			if (isLive) {
				gradient.addColorStop(0, '#ef4444');
				gradient.addColorStop(1, '#dc2626');
			} else {
				gradient.addColorStop(0, '#6366f1');
				gradient.addColorStop(0.5, '#8b5cf6');
				gradient.addColorStop(1, '#a855f7');
			}

			// Draw progress
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.roundRect(x, y, progressWidth, height, radius);
			ctx.fill();

			// Glow effect
			ctx.shadowColor = isLive ? '#ef4444' : '#8b5cf6';
			ctx.shadowBlur = 12;
			ctx.beginPath();
			ctx.roundRect(x, y, progressWidth, height, radius);
			ctx.fill();
			ctx.shadowBlur = 0;

			// Progress knob
			const knobX = x + progressWidth;
			const knobY = y + height / 2;
			const knobSize = height + 4;

			// Knob glow
			ctx.shadowColor = isLive ? '#ef4444' : '#a855f7';
			ctx.shadowBlur = 10;

			// Knob outer
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(knobX, knobY, knobSize / 2, 0, Math.PI * 2);
			ctx.fill();

			// Knob inner accent
			ctx.shadowBlur = 0;
			ctx.fillStyle = isLive ? '#ef4444' : '#8b5cf6';
			ctx.beginPath();
			ctx.arc(knobX, knobY, knobSize / 4, 0, Math.PI * 2);
			ctx.fill();
		}

		ctx.restore();
	}

	drawSourceBadge(ctx, source, x, y) {
		ctx.save();

		const sourceConfig = {
			youtube: { color: '#FF0000', icon: '▶' },
			spotify: { color: '#1DB954', icon: '●' },
			soundcloud: { color: '#FF5500', icon: '☁' },
			deezer: { color: '#FEAA2D', icon: '♪' },
			apple: { color: '#FA57C1', icon: '♫' },
			twitch: { color: '#9146FF', icon: '◆' },
			default: { color: '#6366f1', icon: '♫' },
		};

		const config = sourceConfig[source?.toLowerCase()] || sourceConfig.default;
		const text = source?.toUpperCase() || 'UNKNOWN';

		ctx.font = '10px "Inter SemiBold"';
		const textWidth = ctx.measureText(text).width;
		const iconWidth = 12;
		const padding = 10;
		const gap = 6;
		const badgeWidth = iconWidth + gap + textWidth + padding * 2;
		const badgeHeight = 24;
		const radius = 6;

		// Badge background with subtle gradient
		const bgGradient = ctx.createLinearGradient(x, y, x, y + badgeHeight);
		bgGradient.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
		bgGradient.addColorStop(1, 'rgba(255, 255, 255, 0.04)');

		ctx.fillStyle = bgGradient;
		ctx.beginPath();
		ctx.roundRect(x, y, badgeWidth, badgeHeight, radius);
		ctx.fill();

		// Subtle border
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
		ctx.lineWidth = 1;
		ctx.stroke();

		// Icon with platform color
		ctx.fillStyle = config.color;
		ctx.font = '10px "Inter"';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(config.icon, x + padding, y + badgeHeight / 2);

		// Text
		ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
		ctx.font = '10px "Inter SemiBold"';
		ctx.fillText(text, x + padding + iconWidth + gap, y + badgeHeight / 2);

		ctx.restore();
		return badgeWidth;
	}

	drawLiveIndicator(ctx, x, y) {
		ctx.save();

		const dotSize = 6;
		const padding = 8;
		const text = 'LIVE';
		ctx.font = '11px "Inter Bold"';
		const textWidth = ctx.measureText(text).width;
		const badgeWidth = dotSize + 6 + textWidth + padding * 2;
		const badgeHeight = 22;

		// Background
		ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
		ctx.beginPath();
		ctx.roundRect(x, y, badgeWidth, badgeHeight, 6);
		ctx.fill();

		// Border
		ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
		ctx.lineWidth = 1;
		ctx.stroke();

		// Pulsing dot
		ctx.fillStyle = '#ef4444';
		ctx.shadowColor = '#ef4444';
		ctx.shadowBlur = 6;
		ctx.beginPath();
		ctx.arc(
			x + padding + dotSize / 2,
			y + badgeHeight / 2,
			dotSize / 2,
			0,
			Math.PI * 2,
		);
		ctx.fill();

		// Text
		ctx.shadowBlur = 0;
		ctx.fillStyle = '#ef4444';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, x + padding + dotSize + 6, y + badgeHeight / 2);

		ctx.restore();
		return badgeWidth;
	}

	// ═══════════════════════════════════════════════════════════
	// MAIN RENDER METHOD - MODIFIED FOR MODERN UI
	// ═══════════════════════════════════════════════════════════

	async createMusicCard(track, position = 0, guildId = null) {
		const width = 900;
		const height = 280;
		const padding = 32;
		const artworkSize = 200;

		const canvas = createCanvas(width, height);
		const ctx = canvas.getContext('2d');

		// Layout calculations
		const artworkX = padding;
		const artworkY = (height - artworkSize) / 2;
		const contentX = artworkX + artworkSize + 40;
		const contentWidth = width - contentX - padding;

		// Get custom background settings
		let backgroundApplied = false;
		if (guildId) {
			try {
				const backgroundSettings = db.guild.getMusicCardSettings(guildId);
				if (backgroundSettings) {
					const { type, value } = backgroundSettings;

					if (type === 'color' && value) {
						ctx.fillStyle = value;
						ctx.fillRect(0, 0, width, height);
						// Add subtle overlay for readability
						ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
						ctx.fillRect(0, 0, width, height);
						backgroundApplied = true;
					} else if (type === 'gradient' && value) {
						const gradient = this.getGradientByName(value, ctx, width, height);
						if (gradient) {
							ctx.fillStyle = gradient;
							ctx.fillRect(0, 0, width, height);
							ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
							ctx.fillRect(0, 0, width, height);
							backgroundApplied = true;
						}
					} else if (type === 'image' && value) {
						try {
							const image = await loadImage(value);
							ctx.drawImage(image, 0, 0, width, height);
							// Dark overlay for text readability
							ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
							ctx.fillRect(0, 0, width, height);
							backgroundApplied = true;
						} catch (error) {
							logger.warn(
								'MusicCard',
								`Failed to load background image: ${value}`,
								error,
							);
						}
					}
				}
			} catch (error) {
				logger.warn(
					'MusicCard',
					`Failed to get background settings for guild ${guildId}:`,
					error,
				);
			}
		}

		// Apply default modern background if no custom background
		if (!backgroundApplied) {
			this.applyCleanModernBackground(ctx, width, height);
		}

		// Draw artwork with new clean modern style
		await this.drawCleanModernArtwork(ctx, track, artworkX, artworkY, artworkSize);

		// ═══════════════════════════════════════════════════════════
		// TEXT CONTENT
		// ═══════════════════════════════════════════════════════════

		// Title
		const titleY = artworkY + 40;
		const title = track?.info?.title || 'Unknown Title';
		const displayTitle = this.truncateText(
			ctx,
			title,
			contentWidth,
			'bold 28px "Inter Bold", "Noto Sans JP Bold"',
		);

		ctx.font = 'bold 28px "Inter Bold", "Noto Sans JP Bold"';
		ctx.fillStyle = '#ffffff';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		ctx.fillText(displayTitle, contentX, titleY);

		// Artist
		const artistY = titleY + 30;
		const artist = track?.info?.author || 'Unknown Artist';
		const displayArtist = this.truncateText(
			ctx,
			artist,
			contentWidth,
			'16px "Inter Medium", "Noto Sans JP"',
		);

		ctx.font = '16px "Inter Medium", "Noto Sans JP"';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
		ctx.fillText(displayArtist, contentX, artistY);

		// Source badge with platform colors
		const source = track?.info?.sourceName || 'Unknown';
		const badgeY = artistY + 16;
		this.drawSourceBadge(ctx, source, contentX, badgeY);

		// ═══════════════════════════════════════════════════════════
		// PROGRESS SECTION
		// ═══════════════════════════════════════════════════════════

		const isLive = !track?.info?.duration || track.info.duration <= 0;
		const progress = isLive ? 1 : Math.min(position / track.info.duration, 1);

		// Progress bar with new clean style
		const progressBarY = height - padding - 40;
		const progressBarHeight = 5;

		this.drawCleanProgressBar(
			ctx,
			contentX,
			progressBarY,
			contentWidth,
			progressBarHeight,
			progress,
			isLive,
		);

		// Time labels
		const timeY = progressBarY + 22;
		ctx.font = '13px "Inter Medium"';

		// Current time
		ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
		ctx.textAlign = 'left';
		ctx.fillText(this.formatDuration(position), contentX, timeY);

		// Total time / Live indicator
		ctx.textAlign = 'right';
		if (isLive) {
			// Draw live indicator inline
			ctx.fillStyle = '#ef4444';
			ctx.fillText('● LIVE', contentX + contentWidth, timeY);
		} else {
			ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
			ctx.fillText(
				this.formatDuration(track?.info?.duration || 0),
				contentX + contentWidth,
				timeY,
			);
		}

		// ═══════════════════════════════════════════════════════════
		// BRANDING (subtle)
		// ═══════════════════════════════════════════════════════════

		ctx.font = '11px "Inter Medium"';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
		ctx.textAlign = 'right';
		ctx.textBaseline = 'bottom';
		ctx.fillText('TymeeMusic', width - padding, height - 10);

		return canvas.toBuffer('image/png');
	}
}