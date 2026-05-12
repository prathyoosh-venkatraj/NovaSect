/**
 * Project Osiris - High-Performance Vanilla Canvas Layer
 * Upgraded with Layered Hierarchy, Temporal/Spatial Anchors, and Dual-Engine Context.
 */

export class OsirisCloudCanvas {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { alpha: false }); // Optimize for opaque background
        
        // Define NovaSect Monochromatic Palette
        this.colors = {
            background: '#0a0a0a',
            p05_95_stroke: 'rgba(0, 255, 0, 0.2)',
            p25_75_fill: 'rgba(0, 255, 0, 0.1)',
            p25_75_stroke: 'rgba(0, 255, 0, 0.4)',
            p50_stroke: '#00ff00',
            gridLines: 'rgba(0, 255, 0, 0.1)',
            axisText: 'rgba(0, 255, 0, 0.6)',
            text: '#00ff00',
            basisLine: 'rgba(255, 255, 0, 0.3)',
            basisText: 'rgba(255, 255, 0, 0.8)',
            meanLine: 'rgba(0, 200, 255, 0.3)',
            meanText: 'rgba(0, 200, 255, 0.8)',
            jumpNode: 'rgba(255, 0, 0, 0.8)',
            jumpNodeGlow: 'rgba(255, 0, 0, 0.3)'
        };

        this.cachedContext = null;
        this.jumpNodes = []; // Store calculated coordinates for hover detection
        
        // Tooltip Setup
        this.tooltip = document.createElement('div');
        this.tooltip.style.position = 'absolute';
        this.tooltip.style.background = 'rgba(0, 0, 0, 0.9)';
        this.tooltip.style.border = '1px solid var(--accent-green)';
        this.tooltip.style.color = 'var(--accent-green)';
        this.tooltip.style.padding = '5px 10px';
        this.tooltip.style.fontFamily = 'monospace';
        this.tooltip.style.fontSize = '0.75em';
        this.tooltip.style.pointerEvents = 'none';
        this.tooltip.style.display = 'none';
        this.tooltip.style.zIndex = '100';
        this.tooltip.style.whiteSpace = 'pre-wrap';
        
        // Ensure wrapper has relative positioning to host absolute tooltip
        if (this.canvas.parentElement) {
            this.canvas.parentElement.style.position = 'relative';
            this.canvas.parentElement.appendChild(this.tooltip);
        }

        this.canvas.addEventListener('mousemove', this._handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseleave', () => {
            this.tooltip.style.display = 'none';
            // Restore clean canvas for GBM crosshair cleanup
            if (this._cachedImageData) {
                this.ctx.putImageData(this._cachedImageData, 0, 0);
                const dpr = window.devicePixelRatio || 1;
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
        });

        this.resize();
    }

    resize() {
        // Handle High-DPI displays
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        if (this.canvas.width !== rect.width * dpr || this.canvas.height !== rect.height * dpr) {
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            
            this.ctx.scale(dpr, dpr);
            this.width = rect.width;
            this.height = rect.height;

            if (this.cachedContext) {
                this.renderCloud(this.cachedContext);
            }
        }
    }

    _handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // GBM: Crosshair scrubber with cached frame restore
        if (this.cachedContext && this.cachedContext.physicsType === 'Geometric Brownian Motion + Jump Diffusion') {
            if (this._cachedImageData) {
                this.ctx.putImageData(this._cachedImageData, 0, 0);
                // Re-apply DPR scale since putImageData resets transform
                const dpr = window.devicePixelRatio || 1;
                this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            this._drawCrosshair(mouseX);

            // Jump node tooltip (on P50 arrows)
            if (this.jumpNodes && this.jumpNodes.length > 0) {
                const threshold = 12;
                let nearestNode = null;
                let minDist = threshold * threshold;
                for (const node of this.jumpNodes) {
                    const dx = mouseX - node.x;
                    const dy = mouseY - node.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq < minDist) { minDist = distSq; nearestNode = node; }
                }
                if (nearestNode) {
                    this.tooltip.style.display = 'block';
                    this.tooltip.style.left = (mouseX + 15) + 'px';
                    this.tooltip.style.top = (mouseY + 15) + 'px';
                    const dir = nearestNode.magnitude > 0 ? '▲' : '▼';
                    this.tooltip.textContent = `Contract Shock: ${dir} ${(Math.abs(nearestNode.magnitude) * 100).toFixed(1)}%\nDay ${nearestNode.step}`;
                } else {
                    this.tooltip.style.display = 'none';
                }
            }
            return;
        }

        // OU: Original jump node tooltip behavior (unchanged)
        if (!this.jumpNodes || this.jumpNodes.length === 0) return;

        const threshold = 10;
        let nearestNode = null;
        let minDist = threshold * threshold;

        for (const node of this.jumpNodes) {
            const dx = mouseX - node.x;
            const dy = mouseY - node.y;
            const distSq = dx*dx + dy*dy;
            if (distSq < minDist) {
                minDist = distSq;
                nearestNode = node;
            }
        }

        if (nearestNode) {
            this.tooltip.style.display = 'block';
            this.tooltip.style.left = (mouseX + 15) + 'px';
            this.tooltip.style.top = (mouseY + 15) + 'px';
            this.tooltip.textContent = `Simulated Anomaly: Contract Backlog / Procurement Shock\nPercentile Band: ${nearestNode.band}\nStep: Day ${nearestNode.step}\nMagnitude: +${(nearestNode.magnitude * 100).toFixed(1)}%`;
        } else {
            this.tooltip.style.display = 'none';
        }
    }

    _mapPoint(step, value, maxSteps, minValue, maxValue) {
        const paddingLeft = 40;
        const paddingRight = 60; // Extra room for badges
        const paddingTop = 40;
        const paddingBottom = 30;

        const drawWidth = this.width - paddingLeft - paddingRight;
        const drawHeight = this.height - paddingTop - paddingBottom;

        const x = paddingLeft + (step / maxSteps) * drawWidth;
        const y = this.height - paddingBottom - ((value - minValue) / (maxValue - minValue)) * drawHeight;

        return { x, y };
    }

    /**
     * PASS 1: Renders background grid, axis anchors, and contextual labels.
     */
    _drawBackgroundLayer(context, maxSteps, minValue, maxValue) {
        const paddingLeft = 40;
        const paddingBottom = 30;
        
        // Solid dark background
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Scanlines effect
        this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
        for (let i = 0; i < this.height; i += 4) {
            this.ctx.fillRect(0, i, this.width, 1);
        }

        // Phase 2: Temporal Anchors (X-Axis) - Quarters
        this.ctx.strokeStyle = this.colors.gridLines;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 4]);

        const quarters = [
            { step: 63, label: 'Q1' },
            { step: 126, label: 'Q2' },
            { step: 189, label: 'Q3' },
            { step: 252, label: 'TERMINAL' }
        ];

        this.ctx.beginPath();
        quarters.forEach(q => {
            const pt = this._mapPoint(q.step, minValue, maxSteps, minValue, maxValue);
            // Draw vertical line
            this.ctx.moveTo(pt.x, 0);
            this.ctx.lineTo(pt.x, this.height - paddingBottom);
        });
        this.ctx.stroke();

        // X-Axis Labels
        this.ctx.fillStyle = this.colors.axisText;
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'center';
        quarters.forEach(q => {
            const pt = this._mapPoint(q.step, minValue, maxSteps, minValue, maxValue);
            this.ctx.fillText(`DAY ${q.step}`, pt.x, this.height - paddingBottom + 12);
            this.ctx.fillText(q.label, pt.x, this.height - paddingBottom + 24);
        });

        this.ctx.setLineDash([]); // Reset

        // Phase 3: Spatial & Basis Anchors (Y-Axis)
        // Draw Initial Basis Line
        const initialPt = this._mapPoint(0, context.initialPrice, maxSteps, minValue, maxValue);
        this.ctx.strokeStyle = this.colors.basisLine;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(paddingLeft, initialPt.y);
        this.ctx.lineTo(this.width, initialPt.y);
        this.ctx.stroke();

        this.ctx.fillStyle = this.colors.basisText;
        this.ctx.textAlign = 'left';
        this.ctx.fillText('BASELINE BASIS', paddingLeft + 5, initialPt.y - 5);
        
        this.ctx.setLineDash([]); // Reset

        // Phase 4: Dual-Engine Contextual Labels
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = 'bold 12px monospace';
        this.ctx.textAlign = 'right';
        
        if (context.physicsType === 'Ornstein-Uhlenbeck') {
            this.ctx.fillText('PHYSICS: ORNSTEIN-UHLENBECK // MEAN-REVERTING COMMODITY BOUNDS', this.width - 20, 20);
            
            // Draw Long Term Mean Line
            const longTermMean = context.initialPrice * Math.exp(context.drift);
            if (Math.abs(longTermMean - context.initialPrice) > 0.1) {
                const meanPt = this._mapPoint(0, longTermMean, maxSteps, minValue, maxValue);
                this.ctx.strokeStyle = this.colors.meanLine;
                this.ctx.setLineDash([2, 2]);
                this.ctx.beginPath();
                this.ctx.moveTo(paddingLeft, meanPt.y);
                this.ctx.lineTo(this.width, meanPt.y);
                this.ctx.stroke();
                this.ctx.fillStyle = this.colors.meanText;
                this.ctx.textAlign = 'left';
                this.ctx.fillText('LONG-TERM MEAN', paddingLeft + 5, meanPt.y - 5);
                this.ctx.setLineDash([]);
            }

        } else if (context.physicsType === 'Geometric Brownian Motion + Jump Diffusion') {
            this.ctx.fillText('PHYSICS: GBM + POISSON JUMPS // CONTRACT VOLATILITY CONE', this.width - 20, 20);
        }
    }

    /**
     * PASS 2: Renders stochastic ribbons, terminal badges, and jump nodes.
     * Branches to GBM-specific rendering for industrials.
     */
    _drawStochasticLayer(context, maxSteps, minValue, maxValue) {
        if (context.physicsType === 'Geometric Brownian Motion + Jump Diffusion') {
            this._drawGBMStochasticLayer(context, maxSteps, minValue, maxValue);
            return;
        }

        // ── OU Engine: Original rendering (unchanged) ──────────────────
        const percentiles = context.percentiles;
        
        const path05 = new Path2D();
        const path95 = new Path2D();
        
        for (let i = 0; i <= maxSteps; i++) {
            const pt05 = this._mapPoint(i, percentiles.p05[i], maxSteps, minValue, maxValue);
            const pt95 = this._mapPoint(i, percentiles.p95[i], maxSteps, minValue, maxValue);
            if (i === 0) {
                path05.moveTo(pt05.x, pt05.y);
                path95.moveTo(pt95.x, pt95.y);
            } else {
                path05.lineTo(pt05.x, pt05.y);
                path95.lineTo(pt95.x, pt95.y);
            }
        }

        this.ctx.strokeStyle = this.colors.p05_95_stroke;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]); 
        this.ctx.stroke(path05);
        this.ctx.stroke(path95);
        this.ctx.setLineDash([]);

        const path25_75 = new Path2D();
        for (let i = 0; i <= maxSteps; i++) {
            const pt75 = this._mapPoint(i, percentiles.p75[i], maxSteps, minValue, maxValue);
            if (i === 0) path25_75.moveTo(pt75.x, pt75.y);
            else path25_75.lineTo(pt75.x, pt75.y);
        }
        for (let i = maxSteps; i >= 0; i--) {
            const pt25 = this._mapPoint(i, percentiles.p25[i], maxSteps, minValue, maxValue);
            path25_75.lineTo(pt25.x, pt25.y);
        }
        path25_75.closePath();

        this.ctx.fillStyle = this.colors.p25_75_fill;
        this.ctx.fill(path25_75);
        this.ctx.strokeStyle = this.colors.p25_75_stroke;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke(path25_75);

        const path50 = new Path2D();
        for (let i = 0; i <= maxSteps; i++) {
            const pt50 = this._mapPoint(i, percentiles.p50[i], maxSteps, minValue, maxValue);
            if (i === 0) path50.moveTo(pt50.x, pt50.y);
            else path50.lineTo(pt50.x, pt50.y);
        }

        this.ctx.strokeStyle = this.colors.p50_stroke;
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = this.colors.p50_stroke;
        this.ctx.shadowBlur = 10;
        this.ctx.stroke(path50);
        this.ctx.shadowBlur = 0;

        this._drawTerminalBadges(percentiles, maxSteps, minValue, maxValue);
        this.jumpNodes = [];
    }

    /**
     * Helper: Draw a filled band between two percentile paths.
     */
    _drawFilledBand(upperPath, lowerPath, maxSteps, minValue, maxValue, fillStyle) {
        const band = new Path2D();
        for (let i = 0; i <= maxSteps; i++) {
            const pt = this._mapPoint(i, upperPath[i], maxSteps, minValue, maxValue);
            if (i === 0) band.moveTo(pt.x, pt.y);
            else band.lineTo(pt.x, pt.y);
        }
        for (let i = maxSteps; i >= 0; i--) {
            const pt = this._mapPoint(i, lowerPath[i], maxSteps, minValue, maxValue);
            band.lineTo(pt.x, pt.y);
        }
        band.closePath();
        this.ctx.fillStyle = fillStyle;
        this.ctx.fill(band);
    }

    /**
     * Helper: Draw terminal price badges at right edge.
     */
    _drawTerminalBadges(percentiles, maxSteps, minValue, maxValue) {
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'left';
        
        const badges = [
            { val: percentiles.p95[maxSteps], label: 'P95' },
            { val: percentiles.p50[maxSteps], label: 'P50' },
            { val: percentiles.p05[maxSteps], label: 'P05' }
        ];

        badges.forEach(b => {
            const pt = this._mapPoint(maxSteps, b.val, maxSteps, minValue, maxValue);
            this.ctx.fillStyle = 'rgba(0,0,0,0.8)';
            this.ctx.strokeStyle = this.colors.text;
            this.ctx.lineWidth = 1;
            const badgeW = 45;
            const badgeH = 16;
            this.ctx.fillRect(pt.x + 5, pt.y - 8, badgeW, badgeH);
            this.ctx.strokeRect(pt.x + 5, pt.y - 8, badgeW, badgeH);
            this.ctx.fillStyle = this.colors.text;
            this.ctx.fillText(b.val.toFixed(2), pt.x + 10, pt.y + 4);
        });
    }

    /**
     * GBM-SPECIFIC PASS 2: Graduated heatmap, gain/loss zones, directional jumps.
     */
    _drawGBMStochasticLayer(context, maxSteps, minValue, maxValue) {
        const percentiles = context.percentiles;
        const paddingLeft = 40;
        const paddingRight = 60;
        const paddingTop = 40;
        const paddingBottom = 30;
        const drawWidth = this.width - paddingLeft - paddingRight;

        // ── 1. Gain/Loss Baseline Zones ────────────────────────────────
        const baselinePt = this._mapPoint(0, context.initialPrice, maxSteps, minValue, maxValue);
        // Green zone above baseline (profit)
        this.ctx.fillStyle = 'rgba(0, 255, 60, 0.025)';
        this.ctx.fillRect(paddingLeft, paddingTop, drawWidth, baselinePt.y - paddingTop);
        // Red zone below baseline (loss)
        this.ctx.fillStyle = 'rgba(255, 40, 40, 0.025)';
        this.ctx.fillRect(paddingLeft, baselinePt.y, drawWidth, this.height - paddingBottom - baselinePt.y);

        // ── 2. Graduated Probability Heatmap (outer → inner) ───────────
        // P05-P95: outermost tail boundary
        this._drawFilledBand(percentiles.p95, percentiles.p05, maxSteps, minValue, maxValue, 'rgba(0, 255, 0, 0.025)');
        // P10-P90: wide confidence band
        if (percentiles.p10 && percentiles.p90) {
            this._drawFilledBand(percentiles.p90, percentiles.p10, maxSteps, minValue, maxValue, 'rgba(0, 255, 0, 0.04)');
        }
        // P25-P75: core probability mass
        this._drawFilledBand(percentiles.p75, percentiles.p25, maxSteps, minValue, maxValue, 'rgba(0, 255, 0, 0.07)');
        // P45-P55: highest density core
        if (percentiles.p45 && percentiles.p55) {
            this._drawFilledBand(percentiles.p55, percentiles.p45, maxSteps, minValue, maxValue, 'rgba(0, 255, 0, 0.15)');
        }

        // ── 3. Outer Boundary Strokes (P05 & P95 dashed) ──────────────
        const path05 = new Path2D();
        const path95 = new Path2D();
        for (let i = 0; i <= maxSteps; i++) {
            const pt05 = this._mapPoint(i, percentiles.p05[i], maxSteps, minValue, maxValue);
            const pt95 = this._mapPoint(i, percentiles.p95[i], maxSteps, minValue, maxValue);
            if (i === 0) { path05.moveTo(pt05.x, pt05.y); path95.moveTo(pt95.x, pt95.y); }
            else { path05.lineTo(pt05.x, pt05.y); path95.lineTo(pt95.x, pt95.y); }
        }
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke(path05);
        this.ctx.stroke(path95);
        this.ctx.setLineDash([]);

        // ── 4. P50 Median (bold glow) ──────────────────────────────────
        const path50 = new Path2D();
        for (let i = 0; i <= maxSteps; i++) {
            const pt50 = this._mapPoint(i, percentiles.p50[i], maxSteps, minValue, maxValue);
            if (i === 0) path50.moveTo(pt50.x, pt50.y);
            else path50.lineTo(pt50.x, pt50.y);
        }
        this.ctx.strokeStyle = this.colors.p50_stroke;
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = this.colors.p50_stroke;
        this.ctx.shadowBlur = 10;
        this.ctx.stroke(path50);
        this.ctx.shadowBlur = 0;

        // ── 5. Jump Arrows on P50 Only ─────────────────────────────────
        this.jumpNodes = [];
        const jumpThreshold = 0.04;
        const p50Path = percentiles.p50;
        for (let i = 1; i <= maxSteps; i++) {
            const delta = (p50Path[i] - p50Path[i - 1]) / p50Path[i - 1];
            if (Math.abs(delta) > jumpThreshold) {
                const pt = this._mapPoint(i, p50Path[i], maxSteps, minValue, maxValue);
                const isUp = delta > 0;

                this.jumpNodes.push({
                    x: pt.x, y: pt.y,
                    band: 'P50', step: i,
                    magnitude: delta
                });

                // Directional arrow marker
                this.ctx.beginPath();
                this.ctx.fillStyle = isUp ? 'rgba(0, 255, 100, 0.9)' : 'rgba(255, 60, 60, 0.9)';
                this.ctx.shadowColor = isUp ? 'rgba(0, 255, 100, 0.4)' : 'rgba(255, 60, 60, 0.4)';
                this.ctx.shadowBlur = 6;
                if (isUp) {
                    this.ctx.moveTo(pt.x, pt.y - 10);
                    this.ctx.lineTo(pt.x - 5, pt.y - 3);
                    this.ctx.lineTo(pt.x + 5, pt.y - 3);
                } else {
                    this.ctx.moveTo(pt.x, pt.y + 10);
                    this.ctx.lineTo(pt.x - 5, pt.y + 3);
                    this.ctx.lineTo(pt.x + 5, pt.y + 3);
                }
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
        }

        // ── 6. Terminal Badges ─────────────────────────────────────────
        this._drawTerminalBadges(percentiles, maxSteps, minValue, maxValue);
    }

    /**
     * GBM Crosshair Scrubber: draws vertical line + percentile readout at mouseX.
     */
    _drawCrosshair(mouseX) {
        if (!this.cachedContext || !this._renderParams) return;
        const { maxSteps, minValue, maxValue } = this._renderParams;
        const percentiles = this.cachedContext.percentiles;

        const paddingLeft = 40;
        const paddingRight = 60;
        const paddingTop = 40;
        const paddingBottom = 30;
        const drawWidth = this.width - paddingLeft - paddingRight;

        // Reverse-map mouse X → simulation step
        const step = Math.round(((mouseX - paddingLeft) / drawWidth) * maxSteps);
        if (step < 0 || step > maxSteps) return;

        // Vertical crosshair line
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(mouseX, paddingTop);
        this.ctx.lineTo(mouseX, this.height - paddingBottom);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Percentile readout labels
        const levels = [
            { key: 'p95', label: 'P95', color: 'rgba(0, 255, 0, 0.5)' },
            { key: 'p75', label: 'P75', color: 'rgba(0, 255, 0, 0.4)' },
            { key: 'p50', label: 'P50', color: '#00ff00' },
            { key: 'p25', label: 'P25', color: 'rgba(0, 255, 0, 0.4)' },
            { key: 'p05', label: 'P05', color: 'rgba(0, 255, 0, 0.5)' }
        ];

        this.ctx.font = '9px monospace';
        levels.forEach(level => {
            if (!percentiles[level.key]) return;
            const val = percentiles[level.key][step];
            const pt = this._mapPoint(step, val, maxSteps, minValue, maxValue);

            // Dot at intersection
            this.ctx.beginPath();
            this.ctx.arc(pt.x, pt.y, 3, 0, 2 * Math.PI);
            this.ctx.fillStyle = level.color;
            this.ctx.fill();

            // Label background + text
            const labelX = pt.x + 8;
            const labelW = 55;
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            this.ctx.fillRect(labelX, pt.y - 7, labelW, 14);
            this.ctx.strokeStyle = level.color;
            this.ctx.lineWidth = 0.5;
            this.ctx.strokeRect(labelX, pt.y - 7, labelW, 14);
            this.ctx.fillStyle = level.color;
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`${level.label} $${val.toFixed(0)}`, labelX + 3, pt.y + 4);
        });

        // Day counter at bottom
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        this.ctx.fillRect(mouseX - 22, this.height - paddingBottom + 2, 44, 14);
        this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(mouseX - 22, this.height - paddingBottom + 2, 44, 14);
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.font = '9px monospace';
        this.ctx.fillText(`DAY ${step}`, mouseX, this.height - paddingBottom + 13);
    }

    renderCloud(context) {
        if (!context || !context.percentiles || !context.percentiles.p50) return;

        this.cachedContext = context;
        const percentiles = context.percentiles;
        const maxSteps = percentiles.p50.length - 1;
        
        let minValue = Number.MAX_VALUE;
        let maxValue = Number.MIN_VALUE;

        for (let i = 0; i <= maxSteps; i++) {
            if (percentiles.p05[i] < minValue) minValue = percentiles.p05[i];
            if (percentiles.p95[i] > maxValue) maxValue = percentiles.p95[i];
        }

        if (context.initialPrice < minValue) minValue = context.initialPrice;
        if (context.initialPrice > maxValue) maxValue = context.initialPrice;

        if (context.physicsType === 'Ornstein-Uhlenbeck') {
            const longTermMean = context.initialPrice * Math.exp(context.drift);
            if (longTermMean < minValue) minValue = longTermMean;
            if (longTermMean > maxValue) maxValue = longTermMean;
        }

        const range = maxValue - minValue;
        minValue -= range * 0.05;
        maxValue += range * 0.05;
        minValue = Math.max(0, minValue);

        // Store for crosshair reverse-mapping
        this._renderParams = { maxSteps, minValue, maxValue };

        // Render Two-Pass Hierarchy
        this._drawBackgroundLayer(context, maxSteps, minValue, maxValue);
        this._drawStochasticLayer(context, maxSteps, minValue, maxValue);

        // Cache rendered frame for GBM crosshair overlay
        if (context.physicsType === 'Geometric Brownian Motion + Jump Diffusion') {
            this._cachedImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        }
    }
}
