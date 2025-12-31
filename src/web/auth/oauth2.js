import passport from 'passport';
import { Strategy } from 'passport-discord';
import session from 'express-session';
import crypto from 'crypto';

export function setupOAuth2(app, bot) {
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
        console.warn('Discord OAuth2 credentials not configured. Dashboard authentication will be disabled.');
        return;
    }

    passport.serializeUser((user, done) => {
        done(null, {
            id: user.id,
            username: user.username,
            discriminator: user.discriminator,
            avatar: user.avatar,
            accessToken: user.accessToken,
            refreshToken: user.refreshToken
        });
    });

    passport.deserializeUser(async (serialized, done) => {
        try {
            done(null, serialized);
        } catch (error) {
            done(error, null);
        }
    });

    passport.use(new Strategy({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/auth/discord/callback`,
        scope: ['identify', 'guilds', 'guilds.members.read'],
        prompt: 'consent'
    }, async (accessToken, refreshToken, profile, done) => {
        profile.accessToken = accessToken;
        profile.refreshToken = refreshToken;
        
        if (bot.database?.OAuthToken) {
            try {
                await bot.database.OAuthToken.upsertMapping(profile.id, {
                    accessToken,
                    refreshToken,
                    expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
                });
            } catch (error) {
                console.error('Error storing OAuth token:', error);
            }
        }

        return done(null, profile);
    }));

    const sessionMiddleware = session({
        secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 7 * 24 * 60 * 60 * 1000,
            sameSite: 'lax'
        }
    });

    app.use(sessionMiddleware);

    app.use(passport.initialize());
    app.use(passport.session());

    app.get('/auth/discord', (req, res, next) => {
        req.session.returnTo = req.query.returnTo || '/dashboard';
        passport.authenticate('discord')(req, res, next);
    });

    app.get('/auth/discord/callback', 
        passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }),
        (req, res) => {
            const returnTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;
            res.redirect(returnTo);
        }
    );

    app.get('/auth/logout', (req, res) => {
        req.logout(() => {
            res.redirect('/');
        });
    });

    app.get('/auth/user', (req, res) => {
        if (req.isAuthenticated()) {
            res.json(req.user);
        } else {
            res.status(401).json({ error: 'Not authenticated' });
        }
    });

    app.get('/auth/check', (req, res) => {
        if (req.isAuthenticated()) {
            res.json({ authenticated: true, user: req.user });
        } else {
            res.json({ authenticated: false });
        }
    });
}

export function requireAuth(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Authentication required' });
}

export async function requireGuildPermission(req, res, next) {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const guildId = req.params.guildId || req.body.guildId;
    if (!guildId) {
        return res.status(400).json({ error: 'Guild ID required' });
    }

    const hasPermission = await checkGuildPermission(req.user, guildId, req.app.get('bot'));
    if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
}

async function checkGuildPermission(user, guildId, bot) {
    if (user.id === process.env.BOT_OWNER_ID) return true;

    const guild = bot.guilds.cache.get(guildId);
    if (!guild) return false;

    const member = guild.members.cache.get(user.id);
    if (!member) return false;

    return member.permissions.has('ManageGuild');
}

export { checkGuildPermission };
