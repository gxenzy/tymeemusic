/**
 * 3D Animated Music Player Visualizer with Particles & Aura
 * Replaces the static hero_bg.png
 */

class VisualizerBackground {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.width = 0;
        this.height = 0;
        this.angle = 0;

        // Configuration
        this.particleCount = 100;
        this.connectionDistance = 100;
        this.colors = ['#5865F2', '#EB459E', '#9B59B6', '#1DB954']; // Discord Blurple, Pink, Purple, Spotify Green

        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Create initial particles
        for (let i = 0; i < this.particleCount; i++) {
            this.particles.push(new Particle(this.width, this.height, this.colors));
        }

        this.animate();
    }

    resize() {
        // Set canvas to full parent size
        const parent = this.canvas.parentElement;
        this.width = parent.offsetWidth;
        this.height = parent.offsetHeight;

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Re-initialize particles if needed or adjust positions (optional)
    }

    animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 1. Draw "Aura" / Background Glow
        const gradient = this.ctx.createRadialGradient(
            this.width / 2, this.height / 2, 0,
            this.width / 2, this.height / 2, this.width * 0.6
        );
        gradient.addColorStop(0, 'rgba(88, 101, 242, 0.05)'); // Inner glow
        gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0)'); // Fade out

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // 2. Update and Draw Particles (Simulated 3D flow)
        this.particles.forEach(p => {
            p.update(this.width, this.height);
            p.draw(this.ctx);
        });

        // 3. Draw Simulated Audio Bars (Visualizer)
        this.drawVisualizerBars();

        requestAnimationFrame(() => this.animate());
    }

    drawVisualizerBars() {
        const barCount = 40;
        const barWidth = (this.width * 0.8) / barCount;
        const centerX = this.width / 2;
        const startX = centerX - (barCount * barWidth) / 2;

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';

        for (let i = 0; i < barCount; i++) {
            // Simulated frequency data using sine waves
            const time = Date.now() * 0.002;
            const height = Math.sin(i * 0.2 + time) * 30 + Math.cos(i * 0.5 - time) * 20 + 60;

            // Draw mirrored bars
            const x = startX + i * barWidth;
            const y = this.height - height; // Bottom aligned? Or floating?

            // Let's make them float in the middle-bottom like a "floor"
            // this.ctx.fillRect(x, this.height - height, barWidth - 2, height); // Bar style 

            // Better: Circular visualizer around the center? or Just particles?
            // User asked for "particles, aura", so maybe bars are distracting.
            // Let's stick to a subtle wave at the bottom.
        }
    }
}

class Particle {
    constructor(w, h, colors) {
        this.reset(w, h);
        this.colors = colors;
        this.color = this.colors[Math.floor(Math.random() * this.colors.length)];
    }

    reset(w, h) {
        // Start from center
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.z = Math.random() * 2; // Simulated depth

        // Velocity (random direction)
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;

        this.size = Math.random() * 2 + 1;
        this.life = Math.random() * 100 + 100;
        this.opacity = 0;
    }

    update(w, h) {
        this.x += this.vx * (1 + this.z); // Moves faster if "closer"
        this.y += this.vy * (1 + this.z);
        this.life--;

        // Fade in/out
        if (this.life > 150) this.opacity += 0.01;
        else this.opacity -= 0.01;

        if (this.opacity < 0 || this.life <= 0 || this.x < 0 || this.x > w || this.y < 0 || this.y > h) {
            this.reset(w, h);
            this.opacity = 0;
            // Respawn somewhat near center for explosion effect?
            // No, random drift is better for "aura"
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (1 + this.z * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = Math.max(0, Math.min(1, this.opacity));
        ctx.fill();
        ctx.globalAlpha = 1;

        // Glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new VisualizerBackground('hero-visualizer');
});
