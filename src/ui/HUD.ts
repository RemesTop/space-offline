type Bars = { hp: HTMLDivElement; xp: HTMLDivElement };

export class HUD {
  root: HTMLDivElement;
  bars: Bars;
  hpText: HTMLSpanElement;
  board: HTMLDivElement;
  powerupsPanel: HTMLDivElement;
  velocityPanel: HTMLDivElement;

  constructor() {
    this.root = document.createElement("div");
    this.root.className = "hud";
    document.body.appendChild(this.root);

    const hp = document.createElement("div");
    hp.className = "bar hp";
    hp.innerHTML = "<div style='width:100%'></div><span class='hp-text'></span>";
    const xp = document.createElement("div");
    xp.className = "bar xp";
    xp.innerHTML = "<div style='width:0%'></div>";
    const barsWrap = document.createElement("div");
    barsWrap.className = "bottom-bars";
    barsWrap.append(hp, xp);
    document.body.appendChild(barsWrap);

    const board = document.createElement("div");
    board.className = "card";
    this.root.appendChild(board);

    // Create powerups panel in left bottom corner
    this.powerupsPanel = document.createElement("div");
    this.powerupsPanel.className = "powerups-panel";
    this.powerupsPanel.innerHTML = "<h3>Powerups</h3><div class='powerups-list'></div>";
    document.body.appendChild(this.powerupsPanel);
    // Initialize with base (all 0) so panel is never empty before first snapshot
    this.setPowerups({});

    // Create velocity panel in bottom right corner (or under leaderboard)
    this.velocityPanel = document.createElement("div");
    this.velocityPanel.className = "velocity-panel";
    this.velocityPanel.innerHTML = `
      <span class="velocity-label">Speed:</span> <span class="velocity-value">0</span>
    `;
    document.body.appendChild(this.velocityPanel);

    this.bars = {
      hp: hp.firstElementChild as HTMLDivElement,
      xp: xp.firstElementChild as HTMLDivElement,
    };
    this.hpText = hp.querySelector('.hp-text') as HTMLSpanElement;
    this.board = board;
  }

  setHP(hp: number, max: number) {
    const pct = Math.max(0, Math.min(1, hp / max)) * 100;
    this.bars.hp.style.width = `${pct}%`;
    if (this.hpText) {
      this.hpText.textContent = `${Math.round(hp)} / ${Math.round(max)}`;
    }
  }

  setXP(xp: number, toNext: number) {
    const pct = Math.max(0, Math.min(1, xp / toNext)) * 100;
    this.bars.xp.style.width = `${pct}%`;
  }

  setVelocity(vx: number, vy: number) {
    const speed = Math.hypot(vx, vy);
    const speedRounded = Math.round(speed);
    const valueElement = this.velocityPanel.querySelector('.velocity-value') as HTMLDivElement;
    if (valueElement) {
      valueElement.textContent = speedRounded.toString();

      // Add color coding based on speed
      if (speed < 50) {
        valueElement.style.color = '#4caf50'; // Green for slow
      } else if (speed < 150) {
        valueElement.style.color = '#ffeb3b'; // Yellow for medium
      } else if (speed < 250) {
        valueElement.style.color = '#ff9800'; // Orange for fast
      } else {
        valueElement.style.color = '#f44336'; // Red for very fast
      }
    }
  }

  setPowerups(stats: any) {
    const container = this.powerupsPanel.querySelector('.powerups-list') as HTMLDivElement;
    if (!container) return;

    const families = ["Hull", "Damage", "Engine", "FireRate", "Magnet", "Wings"] as const;

    // Prefer explicit powerupLevels from server; else derive (0-based levels)
    const serverLevels = stats.powerupLevels as Record<string, number> | undefined;

    let levels: Record<string, number> = {};
    if (serverLevels) {
      for (const f of families) levels[f] = serverLevels[f] ?? 0;
    } else {
      // Derive from stats using same math as before but keep 0-based
      const derived = this.calculatePowerupLevelsRaw(stats); // returns array with {name, level}
      for (const d of derived) levels[d.name] = d.level;
      for (const f of families) if (levels[f] == null) levels[f] = 0;
    }

    // Build HTML showing all families (even 0). Internal 0-4 displayed as 1-5; internal 5 stays 5.
    container.innerHTML = families.map(name => {
      const lvl = Math.max(0, Math.min(5, levels[name] ?? 0)); // internal 0-5
      const displayLvl = Math.min(5, lvl === 5 ? 5 : lvl + 1); // shift +1 except keep max at 5
      return `<div class="powerup-item">
        <span class="powerup-name">${name}</span>
        <span class="powerup-level">Lv ${displayLvl}/5</span>
      </div>`;
    }).join('');
  }

  private calculatePowerupLevelsRaw(stats: any) {
    // Same base values
    const baseDamage = 12;     // BULLET.baseDamage
    const baseFireRate = 220;  // BULLET.cooldownMs
    const baseAccel = 700;     // PLAYER.baseAccel
    const baseMaxHp = 100;     // PLAYER.baseHP
    const baseMagnet = 100;    // PICKUPS.magnetBaseRadius

    const maxHp = stats.maxHp || baseMaxHp;
    const damage = stats.damage || baseDamage;
    const accel = stats.accel || baseAccel;
    const fireCooldownMs = stats.fireCooldownMs || baseFireRate;
    const magnetRadius = stats.magnetRadius || baseMagnet;
    const shield = stats.shield || 0;

    const raw = [
      { name: "Hull", level: Math.round((maxHp - baseMaxHp) / 20) },
      { name: "Damage", level: Math.round((damage - baseDamage) / 4) },
      { name: "Engine", level: Math.round((accel - baseAccel) / 80) },
      { name: "FireRate", level: Math.round((baseFireRate - fireCooldownMs) / 25) },
      { name: "Magnet", level: Math.round((magnetRadius - baseMagnet) / 40) },
      { name: "Wings", level: stats.powerupLevels?.Wings || 0 },
    ];
    return raw.map(r => ({ ...r, level: Math.max(0, Math.min(5, r.level)) }));
  }

  private calculatePowerupLevels(stats: any) {
    // Deprecated: kept for backward compat (returns only upgraded). Use calculatePowerupLevelsRaw instead.
    const raw = this.calculatePowerupLevelsRaw(stats);
    return raw.filter(p => p.level > 0);
  }

  setScoreboard(entries: Array<{ id: string; name: string; score: number; level: number }>, youId?: string) {
    const lines = entries
      .map((e, i) => {
        const text = `${i + 1}. ${e.name} — ${e.score} (Lv ${e.level})`;
        return e.id === youId ? `<b>${text}</b>` : text;
      })
      .join("<br/>");
    this.board.innerHTML = `<strong>Leaderboard</strong><br/>${lines || "No players"}`;
  }
}
