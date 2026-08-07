const STORAGE_KEY = "crq-accessibility";

type Preferences = {
  keyboardMode: boolean;
  highContrast: boolean;
  magnifier: boolean;
};

const defaults: Preferences = { keyboardMode: false, highContrast: false, magnifier: false };
let preferences = loadPreferences();
let listenersBound = false;
let lastFocusedElement: HTMLElement | null = null;
let magnifierStage: HTMLElement | null = null;

function loadPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      keyboardMode: Boolean(saved.keyboardMode),
      highContrast: Boolean(saved.highContrast),
      magnifier: Boolean(saved.magnifier)
    };
  } catch {
    return { ...defaults };
  }
}

function savePreferences() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}

function announce(message: string) {
  const region = document.querySelector<HTMLElement>("#a11y-live-region");
  if (!region) return;
  region.textContent = "";
  window.setTimeout(() => { region.textContent = message; }, 20);
}

function updateControls() {
  (Object.keys(preferences) as Array<keyof Preferences>).forEach((key) => {
    const button = document.querySelector<HTMLButtonElement>(`[data-a11y-toggle="${key}"]`);
    if (!button) return;
    const enabled = preferences[key];
    button.setAttribute("aria-pressed", String(enabled));
    const status = button.querySelector<HTMLElement>(".a11y-switch-label");
    if (status) status.textContent = enabled ? "Ativado" : "Desativado";
  });
  document.querySelector("#a11y-keyboard-guide")?.classList.toggle("is-visible", preferences.keyboardMode);
}

function rebuildMagnifier() {
  const lens = document.querySelector<HTMLElement>("#a11y-magnifier");
  if (!lens) return;
  lens.hidden = !preferences.magnifier;
  magnifierStage = lens.querySelector(".a11y-magnifier-stage");
  if (!preferences.magnifier || !magnifierStage) return;

  const app = document.querySelector<HTMLElement>("#app");
  if (!app) return;
  const clone = app.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
  clone.querySelectorAll("script").forEach((element) => element.remove());
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  clone.style.width = `${document.documentElement.scrollWidth}px`;
  magnifierStage.replaceChildren(clone);
}

function applyPreferences() {
  document.documentElement.classList.toggle("a11y-high-contrast", preferences.highContrast);
  document.documentElement.classList.toggle("a11y-keyboard-mode", preferences.keyboardMode);
  updateControls();
  rebuildMagnifier();
}

function setExpanded(expanded: boolean) {
  document.querySelectorAll<HTMLElement>("[data-a11y-open]").forEach((button) => {
    button.setAttribute("aria-expanded", String(expanded));
  });
}

function openCenter() {
  const panel = document.querySelector<HTMLElement>("#a11y-panel");
  if (!panel) return;
  lastFocusedElement = document.activeElement as HTMLElement;
  panel.hidden = false;
  setExpanded(true);
  panel.querySelector<HTMLButtonElement>("#a11y-close")?.focus();
}

function closeCenter(restoreFocus = true) {
  const panel = document.querySelector<HTMLElement>("#a11y-panel");
  if (!panel) return;
  panel.hidden = true;
  setExpanded(false);
  if (restoreFocus) lastFocusedElement?.focus();
}

function activateView(view: string, fallbackSelector?: string) {
  const target = document.querySelector<HTMLButtonElement>(`[data-view="${view}"]`)
    || (fallbackSelector ? document.querySelector<HTMLButtonElement>(fallbackSelector) : null);
  if (!target) return announce("Este atalho não está disponível nesta tela.");
  target.click();
}

function isTyping(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select, [contenteditable='true']"));
}

function handleShortcut(event: KeyboardEvent) {
  if (!event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.toLowerCase();

  if (key === "a") {
    event.preventDefault();
    openCenter();
    return;
  }
  if (!preferences.keyboardMode || isTyping(event.target)) return;

  const actions: Record<string, () => void> = {
    p: () => document.querySelector<HTMLInputElement>("#global-top-search")?.focus(),
    d: () => activateView("dashboard"),
    f: () => activateView("tickets"),
    n: () => activateView("new-ticket", "#quick-new-ticket"),
    g: () => activateView("settings"),
    b: () => activateView("knowledge"),
    o: () => activateView("notifications"),
    r: () => activateView("reports"),
    u: () => activateView("users"),
    e: () => activateView("departments"),
    t: () => activateView("trash"),
    c: () => {
      preferences.highContrast = !preferences.highContrast;
      savePreferences();
      applyPreferences();
      announce(`Contraste forte ${preferences.highContrast ? "ativado" : "desativado"}.`);
    },
    l: () => {
      preferences.magnifier = !preferences.magnifier;
      savePreferences();
      applyPreferences();
      announce(`Ampliador ${preferences.magnifier ? "ativado" : "desativado"}.`);
    }
  };
  const action = actions[key];
  if (action) {
    event.preventDefault();
    action();
  }
}

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-a11y-open]")) return openCenter();
    if (target.closest("#a11y-close")) return closeCenter();
    if (target.closest("#a11y-reset")) {
      preferences = { ...defaults };
      savePreferences();
      applyPreferences();
      return announce("Preferências de acessibilidade restauradas.");
    }
    const toggle = target.closest<HTMLButtonElement>("[data-a11y-toggle]");
    if (!toggle) return;
    const key = toggle.dataset.a11yToggle as keyof Preferences;
    preferences[key] = !preferences[key];
    savePreferences();
    applyPreferences();
    announce(`${toggle.dataset.a11yName}: ${preferences[key] ? "ativado" : "desativado"}.`);
  });

  document.addEventListener("keydown", (event) => {
    handleShortcut(event);
    if (event.key === "Escape" && !document.querySelector<HTMLElement>("#a11y-panel")?.hidden) closeCenter();
  });

  document.addEventListener("pointermove", (event) => {
    if (!preferences.magnifier || !magnifierStage || event.pointerType === "touch") return;
    const lens = document.querySelector<HTMLElement>("#a11y-magnifier");
    if (!lens) return;
    const size = 220;
    const scale = 1.8;
    lens.style.transform = `translate3d(${event.clientX - size / 2}px, ${event.clientY - size / 2}px, 0)`;
    magnifierStage.style.transform = `translate3d(${size / 2 - event.pageX * scale}px, ${size / 2 - event.pageY * scale}px, 0) scale(${scale})`;
  });
}

function centerMarkup() {
  return `
    <a class="a11y-skip-link" href="#main-content">Pular para o conteúdo principal</a>
    <div class="a11y-center">
      <button class="a11y-login-trigger" type="button" data-a11y-open aria-controls="a11y-panel" aria-expanded="false">
        <span aria-hidden="true">♿</span><span>Acessibilidade</span>
      </button>
      <section id="a11y-panel" class="a11y-panel" role="dialog" aria-labelledby="a11y-title" hidden>
        <header><div><span class="a11y-eyebrow">Preferências pessoais</span><h2 id="a11y-title">Acessibilidade</h2></div><button id="a11y-close" type="button" aria-label="Fechar central">×</button></header>
        <p class="a11y-intro">Ative somente os recursos de que precisa. As escolhas ficam salvas neste dispositivo.</p>
        <div class="a11y-options">
          <button class="a11y-option" data-a11y-toggle="keyboardMode" data-a11y-name="Navegação por teclado" type="button"><strong>Navegação por teclado</strong><small>Realça o item focado e habilita atalhos para as áreas mais utilizadas.</small><span class="a11y-switch-label"></span></button>
          <div id="a11y-keyboard-guide" class="a11y-keyboard-guide"><strong>Como navegar sem o mouse</strong><span><kbd>Tab</kbd> avança · <kbd>Shift</kbd> + <kbd>Tab</kbd> volta · <kbd>Enter</kbd> abre · <kbd>Espaço</kbd> marca opções · <kbd>Esc</kbd> fecha janelas.</span><strong>Atalhos gerais</strong><span><kbd>Alt+A</kbd> acessibilidade · <kbd>Alt+P</kbd> pesquisa · <kbd>Alt+D</kbd> painel · <kbd>Alt+F</kbd> fila · <kbd>Alt+N</kbd> novo chamado · <kbd>Alt+G</kbd> configurações · <kbd>Alt+B</kbd> base de conhecimento · <kbd>Alt+O</kbd> notificações.</span><strong>Atalhos conforme a permissão</strong><span><kbd>Alt+R</kbd> relatórios · <kbd>Alt+U</kbd> usuários · <kbd>Alt+E</kbd> departamentos · <kbd>Alt+T</kbd> lixeira · <kbd>Alt+C</kbd> contraste forte · <kbd>Alt+L</kbd> ampliador.</span></div>
          <button class="a11y-option" data-a11y-toggle="highContrast" data-a11y-name="Contraste forte" type="button"><strong>Contraste de cores forte</strong><small>Aplica fundos sólidos, textos mais definidos e bordas evidentes nos modos claro e escuro.</small><span class="a11y-switch-label"></span></button>
          <button class="a11y-option" data-a11y-toggle="magnifier" data-a11y-name="Ampliador de tela" type="button"><strong>Ampliador de tela</strong><small>Uma lupa de 1,8× acompanha o ponteiro. Em celulares, use o gesto de pinça do navegador.</small><span class="a11y-switch-label"></span></button>
        </div>
        <footer><button id="a11y-reset" type="button">Desativar todos</button><span><kbd>Alt</kbd> + <kbd>A</kbd></span></footer>
      </section>
    </div>
    <div id="a11y-magnifier" class="a11y-magnifier" aria-hidden="true" hidden><div class="a11y-magnifier-stage"></div></div>
    <div id="a11y-live-region" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>`;
}

export function mountAccessibilityCenter() {
  if (!document.querySelector(".a11y-center")) document.body.insertAdjacentHTML("beforeend", centerMarkup());
  const authenticated = Boolean(document.querySelector(".app-shell"));
  document.body.classList.toggle("has-authenticated-shell", authenticated);
  document.querySelector<HTMLButtonElement>(".a11y-login-trigger")?.toggleAttribute("hidden", authenticated);
  bindListeners();
  applyPreferences();
}
