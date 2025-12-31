import mongoose from 'mongoose';

const EmojiMappingSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    botName: {
        type: String,
        required: true,
        index: true
    },
    discordName: {
        type: String,
        required: false
    },
    emojiId: {
        type: String,
        required: false,
        default: null
    },
    emojiUrl: {
        type: String,
        required: false
    },
    isAnimated: {
        type: Boolean,
        default: false
    },
    isAvailable: {
        type: Boolean,
        default: true
    },
    fallback: {
        type: String,
        default: null
    },
    category: {
        type: String,
        required: false,
        default: 'general'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

EmojiMappingSchema.index({ guildId: 1, botName: 1 }, { unique: true });
EmojiMappingSchema.index({ guildId: 1, category: 1 });

EmojiMappingSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

EmojiMappingSchema.statics.getByGuildAndName = async function(guildId, botName) {
    return this.findOne({ guildId, botName });
};

EmojiMappingSchema.statics.getByCategory = async function(guildId, category) {
    return this.find({ guildId, category });
};

EmojiMappingSchema.statics.getAllByGuild = async function(guildId) {
    return this.find({ guildId });
};

EmojiMappingSchema.statics.upsertMapping = async function(guildId, botName, data) {
    return this.findOneAndUpdate(
        { guildId, botName },
        { ...data, guildId, botName, updatedAt: new Date() },
        { upsert: true, new: true }
    );
};

EmojiMappingSchema.statics.deleteByEmojiId = async function(guildId, emojiId) {
    return this.deleteOne({ guildId, emojiId });
};

EmojiMappingSchema.statics.deleteByBotName = async function(guildId, botName) {
    return this.deleteOne({ guildId, botName });
};

EmojiMappingSchema.statics.resetGuildEmojis = async function(guildId) {
    return this.deleteMany({ guildId });
};

const EmojiMapping = mongoose.model('EmojiMapping', EmojiMappingSchema);

export default EmojiMapping;
