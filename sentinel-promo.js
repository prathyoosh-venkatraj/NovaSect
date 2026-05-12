(function () {
    const section = document.querySelector('.sentinel-active');
    if (!section) return;

    // ---- Build EKG path: 6 cycles of a clean heartbeat waveform ----
    const ekgPath = section.querySelector('.ekg-path');
    if (ekgPath) {
        // One cycle in relative coords starting at baseline y=50, spanning 200 user-units wide.
        // Long baseline, small P wave, QRS spike, T wave, long baseline tail.
        const cycle = 'l60,0 l3,-4 l4,8 l3,-4 l6,0 l2,2 l0.5,-30 l0.5,56 l1,-28 l6,0 l4,-6 l4,6 l106,0';
        let d = 'M0,50';
        for (let i = 0; i < 6; i++) d += ' ' + cycle;
        ekgPath.setAttribute('d', d);
    }

    // ---- Readout numerics + TRACKING state ----
    const procEl = section.querySelector('[data-readout="proc"]');
    const sigEl = section.querySelector('[data-readout="sig"]');
    const gspEl = section.querySelector('[data-readout="gsp"]');
    const statusEls = section.querySelectorAll('.readout-status');

    let tracking = false;
    let scheduled = null;

    function gauss(mean, std) {
        const u1 = Math.max(Math.random(), 1e-6);
        const u2 = Math.random();
        return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    }

    function update() {
        if (procEl) {
            const v = Math.max(0, Math.min(100, gauss(87.4, tracking ? 2.4 : 0.7)));
            procEl.textContent = v.toFixed(1) + '%';
        }
        if (sigEl) {
            const v = Math.round(gauss(124, tracking ? 4.5 : 1.4));
            sigEl.textContent = v + 'bp';
        }
        if (gspEl) {
            const v = gauss(0.043, tracking ? 0.013 : 0.0035);
            gspEl.textContent = (v >= 0 ? '+' : '') + v.toFixed(3);
        }
        const interval = tracking ? 170 : 560;
        scheduled = setTimeout(update, interval);
    }
    update();

    section.addEventListener('mouseenter', function () {
        tracking = true;
        statusEls.forEach(function (el) { el.textContent = 'TRACKING'; });
    });
    section.addEventListener('mouseleave', function () {
        tracking = false;
        statusEls.forEach(function (el) { el.textContent = 'STABLE'; });
    });
})();
