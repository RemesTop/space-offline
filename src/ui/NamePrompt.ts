export class NamePrompt {
  root: HTMLDivElement;
  private input!: HTMLInputElement;
  private playBtn!: HTMLButtonElement;
  private randomBtn!: HTMLButtonElement;
  private counter!: HTMLSpanElement;
  private errorEl!: HTMLDivElement;
  private readonly maxLen = 24;
  private onShow?: () => void;

  constructor(onShow?: () => void) {
    this.onShow = onShow;
    const overlay = document.createElement("div");
    overlay.className = "ui-overlay";
    const modal = document.createElement("div");
    modal.className = "modal start-modal";
    modal.innerHTML = `
      <div class="start-header">
        <h1 class="start-title">Space IO</h1>
        <div class="start-controls" style="margin-top: 12px; font-size: 13px; color: #8aa2c7; line-height: 1.6;">
          <span style="display:inline-block; margin:0 8px;"><kbd style="background:#28324a;padding:2px 6px;border-radius:4px;color:#fff;border:1px solid #3c4866;">WASD</kbd> to move your ship</span>
          <span style="display:inline-block; margin:0 8px;"><kbd style="background:#28324a;padding:2px 6px;border-radius:4px;color:#fff;border:1px solid #3c4866;">Space</kbd> or <kbd style="background:#28324a;padding:2px 6px;border-radius:4px;color:#fff;border:1px solid #3c4866;">Mouse 1</kbd> to shoot</span>
        </div>
        <div class="volume-control" style="margin-top: 12px; font-size: 13px; color: #8aa2c7; display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span>Volume</span>
          <input type="range" id="vol-slider" min="0" max="1" step="0.05" value="1" style="width: 100px; cursor: pointer;">
        </div>
      </div>
      <form class="name-form" autocomplete="off">
        <label class="input-group">
          <span class="input-label">Pilot Name</span>
          <input id="nm" class="name-input" maxlength="${this.maxLen}" placeholder="Anonymous" aria-label="Enter your pilot name" />
          <span class="char-counter"><span class="count">0</span>/${this.maxLen}</span>
        </label>
        <div class="error-msg" aria-live="polite" style="display:none"></div>
        <div class="name-actions">
          <button type="button" id="rand" class="btn secondary" title="Random name" aria-label="Generate random name">🎲 Random</button>
          <button type="submit" id="go" class="btn primary" disabled>Play ▶</button>
        </div>
      </form>
      <div class="start-hint">
        <em>Note: This demo is currently singleplayer only.</em>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.root = overlay;

    // Cache elements
    this.input = modal.querySelector('#nm') as HTMLInputElement;
    this.playBtn = modal.querySelector('#go') as HTMLButtonElement;
    this.randomBtn = modal.querySelector('#rand') as HTMLButtonElement;
    this.counter = modal.querySelector('.char-counter .count') as HTMLSpanElement;
    this.errorEl = modal.querySelector('.error-msg') as HTMLDivElement;

    // Prefill from storage or random suggestion
    const stored = localStorage.getItem('playerName');
    if (stored) {
      this.input.value = stored.slice(0, this.maxLen);
    } else {
      this.input.value = this.makeRandomName();
    }
    this.updateCounter();
    this.validate();

    // Events
    this.input.addEventListener('input', () => {
      this.updateCounter();
      this.validate();
    });
    this.randomBtn.addEventListener('click', () => {
      this.input.value = this.makeRandomName();
      this.updateCounter();
      this.validate();
      this.input.focus();
      this.input.select();
    });

    const volSlider = modal.querySelector('#vol-slider') as HTMLInputElement;
    const storedVol = localStorage.getItem('globalVolume');
    if (storedVol !== null) {
      volSlider.value = storedVol;
    }
    // Update live volume if needed
    volSlider.addEventListener('input', () => {
      const v = parseFloat(volSlider.value);
      localStorage.setItem('globalVolume', v.toString());
      // Try to update phaser sound if game is active
      const game = (window as any).phaserGame;
      if (game && game.sound) {
        game.sound.volume = v;
      }
    });

    modal.querySelector('.name-form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!this.playBtn.disabled) this.finish();
    });
  }

  private makeRandomName(): string {
    const adjectives = [
      'Nova', 'Solar', 'Quantum', 'Void', 'Hyper', 'Luminous', 'Crimson', 'Silent', 'Ion', 'Eclipse', 'Vortex', 'Fractal', 'Nebula', 'Prism', 'Fusion'
    ];
    const nouns = [
      'Rider', 'Pilot', 'Drifter', 'Runner', 'Falcon', 'Ghost', 'Warden', 'Comet', 'Ranger', 'Specter', 'Vector', 'Nomad', 'Hermes', 'Forge', 'Spark'
    ];
    return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
  }

  private updateCounter() {
    this.counter.textContent = this.input.value.length.toString();
  }

  private validate() {
    const trimmed = this.input.value.trim();
    const valid = trimmed.length > 0;
    this.playBtn.disabled = !valid;
    if (!valid) {
      this.errorEl.style.display = trimmed.length === 0 ? 'none' : 'block';
      this.errorEl.textContent = '';
    } else {
      this.errorEl.style.display = 'none';
    }
  }

  private finishResolver: ((name: string) => void) | null = null;

  private finish() {
    if (!this.finishResolver) return;
    let name = this.input.value.trim();
    if (!name) name = 'Anon';
    localStorage.setItem('playerName', name);
    document.body.classList.remove('pre-game');
    const resolve = this.finishResolver;
    this.finishResolver = null;
    this.root.remove();
    resolve(name);
  }

  async getName(): Promise<string> {
    this.root.style.display = 'flex';
    document.body.classList.add('pre-game');
    this.onShow?.();
    // Focus next tick to ensure in DOM
    setTimeout(() => this.input.focus(), 0);
    return new Promise((res) => {
      this.finishResolver = res;
    });
  }
}
