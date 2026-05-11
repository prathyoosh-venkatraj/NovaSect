/**
 * Project Osiris - Secure Oracle Proxy Integration
 * Connects the stochastic percentiles to the backend LLM synthesis endpoint.
 */

export class OsirisOracle {
    constructor(uiContainerElement) {
        this.container = uiContainerElement;
        this.isTyping = false;
    }

    /**
     * Synthesizes the final simulation data and requests an analytical summary.
     * @param {Object} params - { ticker, currentPrice, p50, p05, p95, physicsType }
     */
    async requestSynthesis(params) {
        this._clearContainer();
        this._showLoading();

        const payload = {
            ticker: params.ticker,
            current: params.currentPrice.toFixed(2),
            P50: params.p50.toFixed(2),
            P05: params.p05.toFixed(2),
            P95: params.p95.toFixed(2),
            model: params.physicsType === 'Ornstein-Uhlenbeck' ? 'OU' : 'GBM'
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8-second timeout

        try {
            const response = await fetch('/api/oracle-synthesis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Oracle API error: ${response.status}`);
            }

            const data = await response.json();
            
            this._clearContainer();
            if (data && data.summary) {
                await this._typewriterEffect(data.summary);
            } else {
                throw new Error("Invalid response format from Oracle.");
            }
        } catch (error) {
            clearTimeout(timeoutId);
            console.warn('[OSIRIS] Oracle Synthesis Error/Timeout. Injecting mathematical fallback.', error);
            this._clearContainer();
            const fallbackText = this._generateFallbackSynthesis(params);
            await this._typewriterEffect(fallbackText);
        }
    }

    _generateFallbackSynthesis(params) {
        const spread = params.p95 - params.p05;
        const upside = ((params.p50 / params.currentPrice) - 1) * 100;
        const skew = (params.p95 - params.p50) > (params.p50 - params.p05) ? "positive" : "negative";
        
        return `ORACLE TIMEOUT // INITIATING DETERMINISTIC FALLBACK. 
The stochastic dispersion reveals a 90% confidence interval spread of $${spread.toFixed(2)}, exhibiting a ${skew} skew toward the terminal bound. 
Median trajectory indicates a ${upside > 0 ? 'premium' : 'discount'} drift of ${upside.toFixed(1)}% from current valuation under ${params.physicsType === 'Ornstein-Uhlenbeck' ? 'mean-reverting bounds' : 'unconstrained jump dynamics'}.`;
    }

    _clearContainer() {
        this.container.innerHTML = '';
        this.isTyping = false;
    }

    _showLoading() {
        this.container.innerHTML = `> TRANSMITTING TELEMETRY TO ORACLE... <span class="blinking-cursor">_</span>`;
    }

    /**
     * CRT-style character-reveal animation
     */
    async _typewriterEffect(text) {
        this.isTyping = true;
        this.container.innerHTML = '';
        
        const textWrapper = document.createElement('span');
        textWrapper.style.color = 'var(--accent-green)';
        textWrapper.style.fontFamily = 'monospace';
        textWrapper.style.lineHeight = '1.5';
        
        const cursor = document.createElement('span');
        cursor.className = 'blinking-cursor';
        cursor.textContent = '_';

        this.container.appendChild(textWrapper);
        this.container.appendChild(cursor);

        for (let i = 0; i < text.length; i++) {
            if (!this.isTyping) break; // Allow interruption

            textWrapper.textContent += text[i];
            
            // Randomize typing speed slightly for realism (10ms - 40ms per char)
            const delay = Math.random() * 30 + 10;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        this.isTyping = false;
    }
}
