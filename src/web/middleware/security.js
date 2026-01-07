import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export function securityMiddleware(app) {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https://cdn.discordapp.com", "https://images.unsplash.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                connectSrc: ["'self'", "wss:", "https://discord.com"]
            }
        },
        crossOriginEmbedderPolicy: false
    }));

    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: { error: 'Too many requests, please try again later' }
    });

    const authLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 5,
        message: { error: 'Too many login attempts, please try again later' }
    });

    app.use('/api/', apiLimiter);
    app.use('/auth/login', authLimiter);

    app.use((req, res, next) => {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
        const origin = req.headers.origin;
        
        if (allowedOrigins.includes(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
        }
        
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        
        if (req.method === 'OPTIONS') {
            return res.sendStatus(200);
        }
        next();
    });

    app.use((req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        }
        next();
    });
}

export function inputSanitization(req, res, next) {
    if (req.body) {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                if (req.body[key].length > 10000) {
                    return res.status(400).json({ error: 'Input too long' });
                }
            }
        }
    }
    next();
}

export function validateGuildId(req, res, next) {
    const guildId = req.params.guildId;
    if (guildId && !/^\d{17,19}$/.test(guildId)) {
        return res.status(400).json({ error: 'Invalid guild ID format' });
    }
    next();
}

export function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    if (!apiKey && !req.isAuthenticated()) {
        return res.status(401).json({ error: 'API key or authentication required' });
    }
    next();
}
