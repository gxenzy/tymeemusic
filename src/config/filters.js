export const filters = {
	// === GENRE-BASED FILTERS ===
	"pop": [
		{ band: 0, gain: -0.25 }, { band: 1, gain: 0.48 }, { band: 2, gain: 0.59 },
		{ band: 3, gain: 0.72 }, { band: 4, gain: 0.56 }, { band: 5, gain: 0.15 },
		{ band: 6, gain: -0.24 }, { band: 7, gain: -0.24 }, { band: 8, gain: -0.16 },
		{ band: 9, gain: -0.16 }, { band: 10, gain: 0 }, { band: 11, gain: 0 },
		{ band: 12, gain: 0 }, { band: 13, gain: 0 }
	],

	"rock": [
		{ band: 0, gain: 0.3 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.2 },
		{ band: 3, gain: 0.1 }, { band: 4, gain: 0.05 }, { band: 5, gain: -0.05 },
		{ band: 6, gain: -0.15 }, { band: 7, gain: -0.2 }, { band: 8, gain: -0.1 },
		{ band: 9, gain: -0.05 }, { band: 10, gain: 0.05 }, { band: 11, gain: 0.1 },
		{ band: 12, gain: 0.2 }, { band: 13, gain: 0.25 }
	],

	"electronic": [
		{ band: 0, gain: 0.6 }, { band: 1, gain: 0.5 }, { band: 2, gain: 0.1 },
		{ band: 3, gain: -0.1 }, { band: 4, gain: -0.2 }, { band: 5, gain: 0.1 },
		{ band: 6, gain: 0.2 }, { band: 7, gain: 0.5 }, { band: 8, gain: 0.6 },
		{ band: 9, gain: 0.5 }, { band: 10, gain: 0.2 }, { band: 11, gain: 0.1 },
		{ band: 12, gain: 0.1 }, { band: 13, gain: 0.0 }
	],

	"jazz": [
		{ band: 0, gain: 0.1 }, { band: 1, gain: 0.1 }, { band: 2, gain: 0.1 },
		{ band: 3, gain: 0.1 }, { band: 4, gain: 0.1 }, { band: 5, gain: 0.1 },
		{ band: 6, gain: 0.0 }, { band: 7, gain: 0.1 }, { band: 8, gain: 0.1 },
		{ band: 9, gain: 0.1 }, { band: 10, gain: 0.0 }, { band: 11, gain: 0.0 },
		{ band: 12, gain: 0.1 }, { band: 13, gain: 0.1 }
	],

	"classical": [
		{ band: 0, gain: 0.0 }, { band: 1, gain: 0.0 }, { band: 2, gain: 0.0 },
		{ band: 3, gain: 0.0 }, { band: 4, gain: 0.0 }, { band: 5, gain: 0.0 },
		{ band: 6, gain: -0.2 }, { band: 7, gain: -0.2 }, { band: 8, gain: -0.2 },
		{ band: 9, gain: -0.2 }, { band: 10, gain: -0.2 }, { band: 11, gain: -0.2 },
		{ band: 12, gain: -0.2 }, { band: 13, gain: -0.2 }
	],

	"hiphop": [
		{ band: 0, gain: 0.5 }, { band: 1, gain: 0.4 }, { band: 2, gain: 0.2 },
		{ band: 3, gain: 0.1 }, { band: 4, gain: -0.1 }, { band: 5, gain: -0.1 },
		{ band: 6, gain: 0.0 }, { band: 7, gain: 0.0 }, { band: 8, gain: 0.1 },
		{ band: 9, gain: 0.1 }, { band: 10, gain: 0.2 }, { band: 11, gain: 0.2 },
		{ band: 12, gain: 0.3 }, { band: 13, gain: 0.3 }
	],

	"reggae": [
		{ band: 0, gain: 0.0 }, { band: 1, gain: 0.0 }, { band: 2, gain: 0.0 },
		{ band: 3, gain: -0.2 }, { band: 4, gain: -0.1 }, { band: 5, gain: 0.1 },
		{ band: 6, gain: 0.2 }, { band: 7, gain: 0.0 }, { band: 8, gain: 0.0 },
		{ band: 9, gain: 0.0 }, { band: 10, gain: 0.0 }, { band: 11, gain: 0.0 },
		{ band: 12, gain: 0.0 }, { band: 13, gain: 0.0 }
	],

	// === BASS FOCUSED FILTERS ===
	"bassboost": [
		{ band: 0, gain: 1.0 }, { band: 1, gain: 0.8 }, { band: 2, gain: 0.6 },
		{ band: 3, gain: 0.4 }, { band: 4, gain: 0 }, { band: 5, gain: 0 },
		{ band: 6, gain: 0 }, { band: 7, gain: 0 }, { band: 8, gain: 0 },
		{ band: 9, gain: 0 }, { band: 10, gain: 0 }, { band: 11, gain: 0 },
		{ band: 12, gain: 0 }, { band: 13, gain: 0 }
	],

	"superbass": [
		{ band: 0, gain: 1.2 }, { band: 1, gain: 1.0 }, { band: 2, gain: 0.8 },
		{ band: 3, gain: 0.5 }, { band: 4, gain: 0.2 }, { band: 5, gain: 0 },
		{ band: 6, gain: -0.1 }, { band: 7, gain: 0 }, { band: 8, gain: 0 },
		{ band: 9, gain: 0 }, { band: 10, gain: 0 }, { band: 11, gain: 0 },
		{ band: 12, gain: 0 }, { band: 13, gain: 0 }
	],

	"deepbass": [
		{ band: 0, gain: 1.0 }, { band: 1, gain: 0.8 }, { band: 2, gain: 0.6 },
		{ band: 3, gain: 0.4 }, { band: 4, gain: 0 }, { band: 5, gain: 0 },
		{ band: 6, gain: 0 }, { band: 7, gain: 0 }, { band: 8, gain: 0 },
		{ band: 9, gain: 0 }, { band: 10, gain: 0 }, { band: 11, gain: 0 },
		{ band: 12, gain: 0 }, { band: 13, gain: 0 }
	],

	// === VOCAL FOCUSED FILTERS ===
	"vocals": [
		{ band: 0, gain: -0.2 }, { band: 1, gain: -0.3 }, { band: 2, gain: -0.3 },
		{ band: 3, gain: 0.1 }, { band: 4, gain: 0.5 }, { band: 5, gain: 0.6 },
		{ band: 6, gain: 0.8 }, { band: 7, gain: 0.8 }, { band: 8, gain: 0.6 },
		{ band: 9, gain: 0.4 }, { band: 10, gain: 0.2 }, { band: 11, gain: 0.1 },
		{ band: 12, gain: 0.0 }, { band: 13, gain: 0.0 }
	],

	// === TREBLE FOCUSED FILTERS ===
	"treble": [
		{ band: 0, gain: -0.3 }, { band: 1, gain: -0.3 }, { band: 2, gain: -0.3 },
		{ band: 3, gain: -0.2 }, { band: 4, gain: 0.2 }, { band: 5, gain: 0.5 },
		{ band: 6, gain: 0.8 }, { band: 7, gain: 1.0 }, { band: 8, gain: 1.0 },
		{ band: 9, gain: 0.8 }, { band: 10, gain: 0.8 }, { band: 11, gain: 0.8 },
		{ band: 12, gain: 0.8 }, { band: 13, gain: 0.8 }
	],

	"bright": [
		{ band: 0, gain: -0.2 }, { band: 1, gain: -0.1 }, { band: 2, gain: 0.0 },
		{ band: 3, gain: 0.1 }, { band: 4, gain: 0.2 }, { band: 5, gain: 0.4 },
		{ band: 6, gain: 0.6 }, { band: 7, gain: 0.7 }, { band: 8, gain: 0.8 },
		{ band: 9, gain: 0.7 }, { band: 10, gain: 0.6 }, { band: 11, gain: 0.5 },
		{ band: 12, gain: 0.4 }, { band: 13, gain: 0.3 }
	],

	// === GAMING/SPECIAL FILTERS ===
	"gaming": [
		{ band: 0, gain: 0.3 }, { band: 1, gain: 0.3 }, { band: 2, gain: 0.2 },
		{ band: 3, gain: 0.2 }, { band: 4, gain: 0.2 }, { band: 5, gain: 0.3 },
		{ band: 6, gain: 0.4 }, { band: 7, gain: 0.4 }, { band: 8, gain: 0.4 },
		{ band: 9, gain: 0.3 }, { band: 10, gain: 0.2 }, { band: 11, gain: 0.2 },
		{ band: 12, gain: 0.2 }, { band: 13, gain: 0.1 }
	],

	"nightcore": {
		timescale: { rate: 1.35 }
	},

	"vaporwave": {
		timescale: { rate: 0.8 }
	},

	// === AUDIO ENHANCEMENT FILTERS ===
	"boost": [
		{ band: 0, gain: 0.3 }, { band: 1, gain: 0.3 }, { band: 2, gain: 0.4 },
		{ band: 3, gain: 0.4 }, { band: 4, gain: 0.4 }, { band: 5, gain: 0.4 },
		{ band: 6, gain: 0.3 }, { band: 7, gain: 0.3 }, { band: 8, gain: 0.3 },
		{ band: 9, gain: 0.2 }, { band: 10, gain: 0.2 }, { band: 11, gain: 0.2 },
		{ band: 12, gain: 0.2 }, { band: 13, gain: 0.2 }
	],

	"soft": [
		{ band: 0, gain: 0.1 }, { band: 1, gain: 0.1 }, { band: 2, gain: 0.1 },
		{ band: 3, gain: 0.1 }, { band: 4, gain: 0.1 }, { band: 5, gain: 0.1 },
		{ band: 6, gain: 0.0 }, { band: 7, gain: 0.0 }, { band: 8, gain: -0.1 },
		{ band: 9, gain: -0.1 }, { band: 10, gain: -0.1 }, { band: 11, gain: 0.0 },
		{ band: 12, gain: 0.0 }, { band: 13, gain: 0.0 }
	],

	"flat": [
		{ band: 0, gain: 0.0 }, { band: 1, gain: 0.0 }, { band: 2, gain: 0.0 },
		{ band: 3, gain: 0.0 }, { band: 4, gain: 0.0 }, { band: 5, gain: 0.0 },
		{ band: 6, gain: 0.0 }, { band: 7, gain: 0.0 }, { band: 8, gain: 0.0 },
		{ band: 9, gain: 0.0 }, { band: 10, gain: 0.0 }, { band: 11, gain: 0.0 },
		{ band: 12, gain: 0.0 }, { band: 13, gain: 0.0 }
	],

	// === EXPERIMENTAL FILTERS ===
	"warm": [
		{ band: 0, gain: 0.3 }, { band: 1, gain: 0.3 }, { band: 2, gain: 0.2 },
		{ band: 3, gain: 0.2 }, { band: 4, gain: 0.3 }, { band: 5, gain: 0.3 },
		{ band: 6, gain: 0.2 }, { band: 7, gain: 0.1 }, { band: 8, gain: -0.1 },
		{ band: 9, gain: -0.1 }, { band: 10, gain: -0.1 }, { band: 11, gain: 0.0 },
		{ band: 12, gain: 0.0 }, { band: 13, gain: 0.0 }
	],

	"metal": [
		{ band: 0, gain: 0.5 }, { band: 1, gain: 0.4 }, { band: 2, gain: 0.3 },
		{ band: 3, gain: 0.0 }, { band: 4, gain: 0.0 }, { band: 5, gain: 0.2 },
		{ band: 6, gain: 0.5 }, { band: 7, gain: 0.6 }, { band: 8, gain: 0.7 },
		{ band: 9, gain: 0.6 }, { band: 10, gain: 0.5 }, { band: 11, gain: 0.4 },
		{ band: 12, gain: 0.3 }, { band: 13, gain: 0.2 }
	],

	"oldschool": [
		{ band: 0, gain: 0.2 }, { band: 1, gain: 0.2 }, { band: 2, gain: 0.1 },
		{ band: 3, gain: 0.0 }, { band: 4, gain: 0.0 }, { band: 5, gain: -0.1 },
		{ band: 6, gain: -0.2 }, { band: 7, gain: -0.3 }, { band: 8, gain: -0.4 },
		{ band: 9, gain: -0.5 }, { band: 10, gain: -0.6 }, { band: 11, gain: -0.7 },
		{ band: 12, gain: -0.8 }, { band: 13, gain: -0.9 }
	],

	get(name, fallback = null) {
		return this[name] || fallback;
	},

	getNames() {
		return Object.keys(this).filter(key => typeof this[key] !== 'function');
	},


	getGenreFilters() {
		return ['pop', 'rock', 'electronic', 'jazz', 'classical', 'hiphop', 'reggae'];
	},

	getBassFilters() {
		return ['bassboost', 'superbass', 'deepbass'];
	},

	getVocalFilters() {
		return ['vocals'];
	},

	getTrebleFilters() {
		return ['treble', 'bright'];
	},

	getSpecialFilters() {
		return ['gaming', 'nightcore', 'vaporwave', 'boost', 'soft', 'flat', 'warm', 'metal', 'oldschool'];
	}
};

export default filters;