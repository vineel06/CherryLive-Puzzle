// ─── Cherry Blossom Particle System ─────────────────────────────────────────
(function () {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function randomRange(a, b) { return a + Math.random() * (b - a); }

  class Petal {
    constructor() { this.reset(true); }
    reset(initial) {
      this.x = randomRange(0, W);
      this.y = initial ? randomRange(0, H) : -20;
      this.size = randomRange(4, 12);
      this.speedY = randomRange(0.5, 2);
      this.speedX = randomRange(-0.8, 0.8);
      this.rotation = randomRange(0, Math.PI * 2);
      this.rotSpeed = randomRange(-0.02, 0.02);
      this.opacity = randomRange(0.3, 0.8);
      this.wobble = randomRange(0, Math.PI * 2);
      this.wobbleSpeed = randomRange(0.02, 0.05);
      // Cherry blossom pinks
      const hue = randomRange(330, 360);
      const sat = randomRange(60, 100);
      const lit = randomRange(70, 90);
      this.color = `hsla(${hue}, ${sat}%, ${lit}%, `;
    }
    update() {
      this.wobble += this.wobbleSpeed;
      this.x += this.speedX + Math.sin(this.wobble) * 0.5;
      this.y += this.speedY;
      this.rotation += this.rotSpeed;
      if (this.y > H + 20) this.reset(false);
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      ctx.globalAlpha = this.opacity;
      // Draw a simple petal shape
      ctx.beginPath();
      ctx.fillStyle = this.color + this.opacity + ')';
      ctx.ellipse(0, 0, this.size, this.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Stars / sparkles
  class Sparkle {
    constructor() { this.reset(); }
    reset() {
      this.x = randomRange(0, W);
      this.y = randomRange(0, H);
      this.size = randomRange(1, 3);
      this.opacity = 0;
      this.maxOpacity = randomRange(0.2, 0.7);
      this.speed = randomRange(0.005, 0.02);
      this.growing = true;
    }
    update() {
      if (this.growing) {
        this.opacity += this.speed;
        if (this.opacity >= this.maxOpacity) this.growing = false;
      } else {
        this.opacity -= this.speed;
        if (this.opacity <= 0) this.reset();
      }
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = '#ffd93d';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Init particles
  for (let i = 0; i < 60; i++) particles.push(new Petal());
  for (let i = 0; i < 80; i++) particles.push(new Sparkle());

  let raf;
  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    raf = requestAnimationFrame(loop);
  }
  loop();

  // Stop when menu is hidden
  window.ParticleSystem = {
    stop() { cancelAnimationFrame(raf); },
    start() { loop(); }
  };
})();
