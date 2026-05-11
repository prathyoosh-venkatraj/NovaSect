/**
 * Project Osiris - High-Performance Vanilla Canvas Layer
 * Renders the stochastic probability cloud using native HTML5 Canvas
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
            gridLines: 'rgba(0, 255, 0, 0.05)',
            text: '#00ff00'
        };

        this.cachedPercentiles = null;
        this.resize();
    }

    resize() {
        // Handle High-DPI displays
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        // Only resize if necessary to save compute
        if (this.canvas.width !== rect.width * dpr || this.canvas.height !== rect.height * dpr) {
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            
            this.ctx.scale(dpr, dpr);
            this.width = rect.width;
            this.height = rect.height;

            if (this.cachedPercentiles) {
                this.renderCloud(this.cachedPercentiles);
            }
        }
    }

    /**
     * Maps a data point to canvas pixel coordinates
     */
    _mapPoint(step, value, maxSteps, minValue, maxValue) {
        const paddingLeft = 40;
        const paddingRight = 20;
        const paddingTop = 20;
        const paddingBottom = 30;

        const drawWidth = this.width - paddingLeft - paddingRight;
        const drawHeight = this.height - paddingTop - paddingBottom;

        const x = paddingLeft + (step / maxSteps) * drawWidth;
        const y = this.height - paddingBottom - ((value - minValue) / (maxValue - minValue)) * drawHeight;

        return { x, y };
    }

    /**
     * Clears the canvas and draws the CRT background and grid
     */
    _drawBackground() {
        // Solid dark background
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Scanlines effect
        this.ctx.fillStyle = 'rgba(0,0,0,0.2)';
        for (let i = 0; i < this.height; i += 4) {
            this.ctx.fillRect(0, i, this.width, 1);
        }

        // Basic grid
        this.ctx.strokeStyle = this.colors.gridLines;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let i = 1; i < 10; i++) {
            const y = (this.height / 10) * i;
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
        }
        this.ctx.stroke();
    }

    /**
     * Renders the probability cloud given the percentiles
     * percentiles: { p05: Float32Array, p25: Float32Array, p50: Float32Array, p75: Float32Array, p95: Float32Array }
     */
    renderCloud(percentiles) {
        if (!percentiles || !percentiles.p50) return;

        this.cachedPercentiles = percentiles;

        const steps = percentiles.p50.length;
        
        // Determine min and max for scaling
        let minValue = Number.MAX_VALUE;
        let maxValue = Number.MIN_VALUE;

        for (let i = 0; i < steps; i++) {
            if (percentiles.p05[i] < minValue) minValue = percentiles.p05[i];
            if (percentiles.p95[i] > maxValue) maxValue = percentiles.p95[i];
        }

        // Add 5% padding to scale
        const range = maxValue - minValue;
        minValue -= range * 0.05;
        maxValue += range * 0.05;

        // Ensure positive minimum if prices can't go below 0
        minValue = Math.max(0, minValue);

        this._drawBackground();

        // 1. Draw 5th to 95th Percentile Band (Outer Strokes)
        const path05 = new Path2D();
        const path95 = new Path2D();
        
        for (let i = 0; i < steps; i++) {
            const pt05 = this._mapPoint(i, percentiles.p05[i], steps - 1, minValue, maxValue);
            const pt95 = this._mapPoint(i, percentiles.p95[i], steps - 1, minValue, maxValue);
            
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
        this.ctx.setLineDash([5, 5]); // Dashed outer bounds
        this.ctx.stroke(path05);
        this.ctx.stroke(path95);
        this.ctx.setLineDash([]); // Reset dash

        // 2. Draw 25th to 75th Percentile Band (Shaded Fill)
        const path25_75 = new Path2D();
        // Forward along p75
        for (let i = 0; i < steps; i++) {
            const pt75 = this._mapPoint(i, percentiles.p75[i], steps - 1, minValue, maxValue);
            if (i === 0) path25_75.moveTo(pt75.x, pt75.y);
            else path25_75.lineTo(pt75.x, pt75.y);
        }
        // Backward along p25 to close the polygon
        for (let i = steps - 1; i >= 0; i--) {
            const pt25 = this._mapPoint(i, percentiles.p25[i], steps - 1, minValue, maxValue);
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
        for (let i = 0; i < steps; i++) {
            const pt50 = this._mapPoint(i, percentiles.p50[i], steps - 1, minValue, maxValue);
            if (i === 0) path50.moveTo(pt50.x, pt50.y);
            else path50.lineTo(pt50.x, pt50.y);
        }

        this.ctx.strokeStyle = this.colors.p50_stroke;
        this.ctx.lineWidth = 3;
        // Subtle glow effect
        this.ctx.shadowColor = this.colors.p50_stroke;
        this.ctx.shadowBlur = 10;
        this.ctx.stroke(path50);
        // Reset shadow
        this.ctx.shadowBlur = 0;

        // Draw basic Y-axis labels
        this.ctx.fillStyle = this.colors.text;
        this.ctx.font = '10px monospace';
        this.ctx.fillText(`$${maxValue.toFixed(2)}`, 5, 20);
        this.ctx.fillText(`$${minValue.toFixed(2)}`, 5, this.height - 35);
    }
}
