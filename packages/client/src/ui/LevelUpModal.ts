import type { PowerupChoice } from "@shared/types";

export class LevelUpModal {
  root: HTMLDivElement;

  constructor() {
    const overlay = document.createElement("div");
    overlay.className = "ui-overlay";
    const modal = document.createElement("div");
    modal.className = "modal level-up-modal";
    modal.innerHTML = `
      <h2>Level Up!</h2>
      <p>Choose a powerup to improve by +1 level</p>
      <div class="powerup-choices"></div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.root = overlay;
    this.hide();
  }

  hide() {
    this.root.style.display = "none";
  }

  show() {
    this.root.style.display = "flex";
  }

  async choose(choices: PowerupChoice[], currentStats?: any): Promise<PowerupChoice> {
    this.show();
    const container = this.root.querySelector(".powerup-choices") as HTMLDivElement;
    container.innerHTML = "";

    const pick = new Promise<PowerupChoice>((resolve) => {
      for (const option of choices) {
        const btn = document.createElement("button");
        btn.className = "powerup-choice-btn";
        if (option.family === "Special") {
          btn.classList.add("special-upgrade-btn");
        }
        
        let iconSvg = '';
        switch(option.family) {
          case 'Hull': iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>'; break;
          case 'Damage': iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M10 10.5 8 15h3l-1 4.5 5-6H12l2-3z"></path></svg>'; break;
          case 'Engine': iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path></svg>'; break;
          case 'FireRate': iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>'; break;
          case 'Magnet': iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15"></path><path d="m5 8 4 4"></path><path d="m12 15 4 4"></path></svg>'; break;
          case 'Radar': iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2v10l4.5 4.5"></path></svg>'; break;
          case 'AltFire': iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'; break;
          case 'Special': iconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'; break;
        }

        btn.innerHTML = `
          <div class="powerup-header">
            <span class="powerup-icon">${iconSvg}</span>
            <span class="powerup-name">${option.label}</span>
          </div>
          <div class="powerup-desc">${option.desc}</div>
        `;
        btn.onclick = () => resolve(option);
        container.appendChild(btn);
      }
    });

    const result = await pick;
    this.hide();
    return result;
  }


}
