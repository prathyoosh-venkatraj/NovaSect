(function () {
    const section = document.querySelector('.osiris-promo-section');
    if (!section) return;

    const canvas = section.querySelector('.osiris-paths-canvas');
    const histogram = section.querySelector('.osiris-histogram');
    const counter = section.querySelector('.osiris-sim-counter');
    if (!canvas) return;

    // Skip animation on mobile (matches CSS visibility)
    const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

    // ---- Histogram bars (bell curve, staggered breathing) ----
    if (histogram && histogram.children.length === 0) {
        const N_BARS = 80;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < N_BARS; i++) {
            const x = (i - N_BARS / 2) / (N_BARS / 4);
            const h = Math.exp(-x * x / 2); // standard normal-ish
            const bar = document.createElement('div');
            bar.className = 'osiris-hist-bar';
            bar.style.height = Math.max(h * 100, 4) + '%';
            bar.style.animationDelay = ((i % 20) * 0.18).toFixed(2) + 's';
            frag.appendChild(bar);
        }
        histogram.appendChild(frag);
    }

    if (isMobile()) return;

    // ---- Canvas setup ----
    const ctx = canvas.getContext('2d');
    let width = 0, height = 0, originX = 0, originY = 0, dpr = 1;

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = section.getBoundingClientRect();
        width = rect.width;
        height = rect.height;
        if (width === 0 || height === 0) return;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        originX = width * 0.10;
        originY = height * 0.50;
    }
    resize();
    window.addEventListener('resize', resize);

    // ---- Path simulation ----
    const NUM_PATHS = 70;
    const STEPS_PER_PATH = 180;
    const VOL_FACTOR = 0.045; // vertical volatility as fraction of height

    function gaussian() {
        const u1 = Math.max(Math.random(), 1e-6);
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    function Path(stagger) {
        this.reset(stagger);
    }
    Path.prototype.reset = function (stagger) {
        this.x = originX;
        this.y = originY;
        this.step = 0;
        this.outlier = Math.random() < 0.04;
        if (stagger) {
            const skip = Math.floor(Math.random() * STEPS_PER_PATH);
            for (let i = 0; i < skip; i++) this._step();
        }
    };
    Path.prototype._step = function () {
        const dx = (width - originX) / STEPS_PER_PATH;
        const dy = gaussian() * height * VOL_FACTOR / Math.sqrt(STEPS_PER_PATH) * 4;
        this.x += dx;
        this.y += dy;
        this.step++;
    };
    Path.prototype.advance = function (boost) {
        if (this.step >= STEPS_PER_PATH) {
            this.reset(false);
        }
        const px = this.x, py = this.y;
        this._step();
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(this.x, this.y);
        const base = this.outlier ? 0.55 : 0.10;
        const alpha = boost ? Math.min(base * 2.4, 0.95) : base;
        ctx.strokeStyle = 'rgba(57, 255, 20, ' + alpha + ')';
        ctx.lineWidth = this.outlier ? 1.1 : 0.55;
        ctx.stroke();
    };

    const paths = [];
    for (let i = 0; i < NUM_PATHS; i++) paths.push(new Path(true));

    // ---- Hover state ----
    let hovering = false;
    section.addEventListener('mouseenter', function () {
        hovering = true;
        startSim();
    });
    section.addEventListener('mouseleave', function () {
        hovering = false;
    });

    // ---- Main loop (IntersectionObserver-gated) ----
    // RAF chain only runs while the OSIRIS section is on-screen. Saves CPU
    // when the user is at the top of the page (NOVASECT/hero/ENTER THE VAULT)
    // and the OSIRIS section is scrolled out of view.
    let isVisible = true;
    let running = false;

    const visibilityObserver = new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
        if (isVisible && !running) {
            running = true;
            frame();
        }
    }, { threshold: 0 });
    visibilityObserver.observe(section);

    function frame() {
        if (!isVisible) {
            running = false;
            return;
        }
        if (width > 0 && height > 0) {
            ctx.fillStyle = hovering ? 'rgba(0, 0, 0, 0.025)' : 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, width, height);
            for (let i = 0; i < paths.length; i++) paths[i].advance(hovering);
        }
        requestAnimationFrame(frame);
    }
    running = true;
    frame();

    // ---- Hover sim counter ("RUNNING SIMULATION...") ----
    let simActive = false;
    function startSim() {
        if (simActive || !counter) return;
        simActive = true;
        let count = 0;
        const target = 5000;
        function tick() {
            if (!hovering) {
                simActive = false;
                counter.textContent = 'IDLE';
                return;
            }
            count = Math.min(count + Math.floor(Math.random() * 80 + 40), target);
            counter.textContent = String(count).padStart(4, '0') + '/' + target + ' PATHS OK';
            if (count < target) {
                requestAnimationFrame(tick);
            } else {
                function hold() {
                    if (!hovering) {
                        simActive = false;
                        counter.textContent = 'IDLE';
                    } else {
                        requestAnimationFrame(hold);
                    }
                }
                hold();
            }
        }
        tick();
    }
})();
