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
        this.canvas.addEventListener('mouseleave', () => { this.tooltip.style.display = 'none'; });

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
        if (!this.jumpNodes || this.jumpNodes.length === 0) return;

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Find nearest node within threshold radius
        const threshold = 10;
        let nearestNode = null;
        let minDist = threshold * threshold; // Use squared distance

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
     */
    _drawStochasticLayer(context, maxSteps, minValue, maxValue) {
        const percentiles = context.percentiles;
        
        // 1. Draw 5th to 95th Percentile Band (Outer Strokes)
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

        // 2. Draw 25th to 75th Percentile Band (Shaded Fill)
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

        // 3. Draw 50th Percentile (Median Focal Trajectory)
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

        // Phase 3: Terminal Badges
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'left';
        
        const badges = [
            { val: percentiles.p95[maxSteps], label: 'P95' },
            { val: percentiles.p50[maxSteps], label: 'P50' },
            { val: percentiles.p05[maxSteps], label: 'P05' }
        ];

        badges.forEach(b => {
            const pt = this._mapPoint(maxSteps, b.val, maxSteps, minValue, maxValue);
            
            // Draw badge background
            this.ctx.fillStyle = 'rgba(0,0,0,0.8)';
            this.ctx.strokeStyle = this.colors.text;
            this.ctx.lineWidth = 1;
            
            const badgeW = 45;
            const badgeH = 16;
            this.ctx.fillRect(pt.x + 5, pt.y - 8, badgeW, badgeH);
            this.ctx.strokeRect(pt.x + 5, pt.y - 8, badgeW, badgeH);
            
            // Draw badge text
            this.ctx.fillStyle = this.colors.text;
            this.ctx.fillText(b.val.toFixed(2), pt.x + 10, pt.y + 4);
        });

        // Phase 4: Jump Nodes for GBM
        this.jumpNodes = [];
        if (context.physicsType === 'Geometric Brownian Motion + Jump Diffusion') {
            const bands = ['p05', 'p25', 'p50', 'p75', 'p95'];
            // A dynamic threshold representing an anomalous percentage jump in a single day
            const jumpThreshold = 0.04; // 4% daily jump indicates an anomaly

            bands.forEach(band => {
                const path = percentiles[band];
                for (let i = 1; i <= maxSteps; i++) {
                    const delta = Math.abs((path[i] - path[i-1]) / path[i-1]);
                    if (delta > jumpThreshold) {
                        const pt = this._mapPoint(i, path[i], maxSteps, minValue, maxValue);
                        this.jumpNodes.push({
                            x: pt.x,
                            y: pt.y,
                            band: band.toUpperCase(),
                            step: i,
                            magnitude: delta
                        });
                        
                        // Draw visual indicator node
                        this.ctx.beginPath();
                        this.ctx.arc(pt.x, pt.y, 3, 0, 2 * Math.PI);
                        this.ctx.fillStyle = this.colors.jumpNode;
                        
                        // Glow
                        this.ctx.shadowColor = this.colors.jumpNodeGlow;
                        this.ctx.shadowBlur = 8;
                        this.ctx.fill();
                        this.ctx.shadowBlur = 0;
                    }
                }
            });
        }
    }

    renderCloud(context) {
        if (!context || !context.percentiles || !context.percentiles.p50) return;

        this.cachedContext = context;
        const percentiles = context.percentiles;
        const maxSteps = percentiles.p50.length - 1;
        
        // Determine global min and max for scaling across all percentiles
        let minValue = Number.MAX_VALUE;
        let maxValue = Number.MIN_VALUE;

        for (let i = 0; i <= maxSteps; i++) {
            if (percentiles.p05[i] < minValue) minValue = percentiles.p05[i];
            if (percentiles.p95[i] > maxValue) maxValue = percentiles.p95[i];
        }

        // Include initialPrice in bounds to ensure basis line is visible
        if (context.initialPrice < minValue) minValue = context.initialPrice;
        if (context.initialPrice > maxValue) maxValue = context.initialPrice;

        // Include longTermMean in bounds if applicable
        if (context.physicsType === 'Ornstein-Uhlenbeck') {
            const longTermMean = context.initialPrice * Math.exp(context.drift);
            if (longTermMean < minValue) minValue = longTermMean;
            if (longTermMean > maxValue) maxValue = longTermMean;
        }

        // Add 5% padding to scale dynamically
        const range = maxValue - minValue;
        minValue -= range * 0.05;
        maxValue += range * 0.05;
        minValue = Math.max(0, minValue);

        // Render Two-Pass Hierarchy
        this._drawBackgroundLayer(context, maxSteps, minValue, maxValue);
        this._drawStochasticLayer(context, maxSteps, minValue, maxValue);
    }
}
