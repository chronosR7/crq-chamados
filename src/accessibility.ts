const STORAGE_KEY = "crq-accessibility";

type Preferences = {
  describeImages: boolean;
  keyboardMode: boolean;
  highContrast: boolean;
  magnifier: boolean;
  vlibras: boolean;
};

const defaults: Preferences = {
  describeImages: false,
  keyboardMode: false,
  highContrast: false,
  magnifier: false,
  vlibras: false
};

let preferences = loadPreferences();
let listenersBound = false;
let lastFocusedElement: HTMLElement | null = null;
let speechChunks: string[] = [];
let magnifierStage: HTMLElement | null = null;

function loadPreferences(): Preferences {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
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

function ensureImageAlternatives() {
  document.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    if (!image.hasAttribute("alt")) image.alt = "Imagem da plataforma";
    if (!image.alt.trim()) return;

    if (preferences.describeImages) {
      if (!image.dataset.a11yOriginalTabindex) {
        image.dataset.a11yOriginalTabindex = image.getAttribute("tabindex") ?? "none";
      }
      image.tabIndex = 0;
      image.title = image.alt;
      image.dataset.a11yDescribed = "true";
    } else if (image.dataset.a11yDescribed) {
      const original = image.dataset.a11yOriginalTabindex;
      if (original === "none") image.removeAttribute("tabindex");
      else if (original) image.setAttribute("tabindex", original);
      image.removeAttribute("title");
      delete image.dataset.a11yDescribed;
      delete image.dataset.a11yOriginalTabindex;
    }
  });
}

function updateControls() {
  (Object.keys(preferences) as Array<keyof Preferences>).forEach((key) => {
    const button = document.querySelector<HTMLButtonElement>(`[data-a11y-toggle="${key}"]`);
    if (!button) return;
    button.setAttribute("aria-pressed", String(preferences[key]));
    button.querySelector<HTMLElement>(".a11y-switch-label")!.textContent = preferences[key] ? "Ativado" : "Desativado";
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
  clone.querySelectorAll("script, .a11y-center").forEach((element) => element.remove());
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  clone.style.width = `${document.documentElement.scrollWidth}px`;
  magnifierStage.replaceChildren(clone);
}

function applyPreferences() {
  document.documentElement.classList.toggle("a11y-high-contrast", preferences.highContrast);
  document.documentElement.classList.toggle("a11y-keyboard-mode", preferences.keyboardMode);
  document.documentElement.classList.toggle("a11y-describe-images", preferences.describeImages);
  ensureImageAlternatives();
  updateControls();
  rebuildMagnifier();
  if (preferences.vlibras) void setVLibras(true);
}

function openCenter() {
  const panel = document.querySelector<HTMLElement>("#a11y-panel");
  const trigger = document.querySelector<HTMLButtonElement>("#a11y-trigger");
  if (!panel || !trigger) return;
  lastFocusedElement = document.activeElement as HTMLElement;
  panel.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  panel.querySelector<HTMLButtonElement>("#a11y-close")?.focus();
}

function closeCenter(restoreFocus = true) {
  const panel = document.querySelector<HTMLElement>("#a11y-panel");
  const trigger = document.querySelector<HTMLButtonElement>("#a11y-trigger");
  if (!panel || !trigger) return;
  panel.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) (lastFocusedElement || trigger).focus();
}

function pageText() {
  const selected = window.getSelection()?.toString().trim();
  if (selected) return selected;
  const main = document.querySelector<HTMLElement>("#main-content") || document.querySelector<HTMLElement>("main");
  return (main?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 16000);
}

function speakNext() {
  const text = speechChunks.shift();
  if (!text) {
    announce("Leitura concluída.");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "pt-BR";
  utterance.rate = 0.95;
  utterance.voice = speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase() === "pt-br") || null;
  utterance.onend = speakNext;
  utterance.onerror = () => announce("A leitura em voz não está disponível neste navegador.");
  speechSynthesis.speak(utterance);
}

function startSpeech() {
  if (!("speechSynthesis" in window)) {
    announce("A leitura em voz não está disponível neste navegador.");
    return;
  }
  speechSynthesis.cancel();
  const text = pageText();
  if (!text) return announce("Não há texto disponível para leitura.");
  speechChunks = text.match(/.{1,1500}(?:\s|$)/g) || [text];
  announce("Leitura em português iniciada.");
  speakNext();
}

async function setVLibras(enabled: boolean) {
  let widget = document.querySelector<HTMLElement>("#crq-vlibras-widget");
  if (!enabled) {
    if (widget) widget.hidden = true;
    return;
  }
  if (widget) {
    widget.hidden = false;
    return;
  }

  widget = document.createElement("div");
  widget.id = "crq-vlibras-widget";
  widget.setAttribute("vw", "");
  widget.className = "enabled";
  widget.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
  document.body.appendChild(widget);

  const initialize = () => {
    const api = (window as Window & { VLibras?: { Widget: new (url: string) => unknown } }).VLibras;
    if (api) new api.Widget("https://vlibras.gov.br/app");
  };
  const existingScript = document.querySelector<HTMLScriptElement>("#vlibras-script");
  if (existingScript) return initialize();
  const script = document.createElement("script");
  script.id = "vlibras-script";
  script.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
  script.async = true;
  script.onload = initialize;
  script.onerror = () => announce("Não foi possível carregar o VLibras. Verifique a conexão.");
  document.head.appendChild(script);
}

function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("#a11y-trigger")) return openCenter();
    if (target.closest("#a11y-close")) return closeCenter();
    if (target.closest("#a11y-read")) return startSpeech();
    if (target.closest("#a11y-pause")) {
      if (speechSynthesis.paused) speechSynthesis.resume(); else speechSynthesis.pause();
      return;
    }
    if (target.closest("#a11y-stop")) return speechSynthesis.cancel();
    if (target.closest("#a11y-reset")) {
      preferences = { ...defaults };
      savePreferences();
      applyPreferences();
      void setVLibras(false);
      return announce("Preferências de acessibilidade restauradas.");
    }
    const toggle = target.closest<HTMLButtonElement>("[data-a11y-toggle]");
    if (toggle) {
      const key = toggle.dataset.a11yToggle as keyof Preferences;
      preferences[key] = !preferences[key];
      savePreferences();
      applyPreferences();
      announce(`${toggle.dataset.a11yName}: ${preferences[key] ? "ativado" : "desativado"}.`);
      if (key === "vlibras") void setVLibras(preferences.vlibras);
      return;
    }
    const image = target.closest<HTMLImageElement>("img[data-a11y-described]");
    if (image?.alt) announce(`Descrição da imagem: ${image.alt}`);
  });

  document.addEventListener("focusin", (event) => {
    const image = (event.target as HTMLElement).closest<HTMLImageElement>("img[data-a11y-described]");
    if (image?.alt) announce(`Descrição da imagem: ${image.alt}`);
  });

  document.addEventListener("keydown", (event) => {
    if (event.altKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      openCenter();
    }
    if (event.altKey && event.key.toLowerCase() === "p") {
      event.preventDefault();
      document.querySelector<HTMLInputElement>("#global-top-search")?.focus();
    }
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
      <button id="a11y-trigger" class="a11y-trigger" type="button" aria-controls="a11y-panel" aria-expanded="false" title="Acessibilidade (Alt+A)">
        <span aria-hidden="true">♿</span><span class="a11y-trigger-label">Acessibilidade</span>
      </button>
      <section id="a11y-panel" class="a11y-panel" role="dialog" aria-labelledby="a11y-title" hidden>
        <header><div><span class="a11y-eyebrow">Preferências pessoais</span><h2 id="a11y-title">Central de acessibilidade</h2></div><button id="a11y-close" type="button" aria-label="Fechar central">×</button></header>
        <p class="a11y-intro">Escolha os recursos que ajudam você a utilizar o sistema. As escolhas ficam salvas neste dispositivo.</p>
        <div class="a11y-options">
          <button class="a11y-option" data-a11y-toggle="describeImages" data-a11y-name="Descrições de imagens" type="button"><strong>Textos alternativos</strong><small>Foca imagens e anuncia suas descrições. Os textos alternativos permanecem disponíveis para leitores de tela.</small><span class="a11y-switch-label"></span></button>
          <button class="a11y-option" data-a11y-toggle="keyboardMode" data-a11y-name="Navegação por teclado" type="button"><strong>Navegação por teclado</strong><small>Reforça o foco visual e exibe os atalhos disponíveis.</small><span class="a11y-switch-label"></span></button>
          <div id="a11y-keyboard-guide" class="a11y-keyboard-guide"><strong>Como navegar</strong><span><kbd>Tab</kbd> avança · <kbd>Shift</kbd> + <kbd>Tab</kbd> retorna · <kbd>Enter</kbd> ativa · <kbd>Esc</kbd> fecha janelas · <kbd>Alt</kbd> + <kbd>A</kbd> abre este menu · <kbd>Alt</kbd> + <kbd>P</kbd> pesquisa chamados.</span></div>
          <button class="a11y-option" data-a11y-toggle="highContrast" data-a11y-name="Contraste forte" type="button"><strong>Contraste de cores forte</strong><small>Aumenta a separação entre textos, controles, bordas e fundos.</small><span class="a11y-switch-label"></span></button>
          <button class="a11y-option" data-a11y-toggle="magnifier" data-a11y-name="Lupa de tela" type="button"><strong>Ampliador de tela</strong><small>Mostra uma lupa que acompanha o ponteiro. Em telas de toque, use o zoom nativo do navegador.</small><span class="a11y-switch-label"></span></button>
          <div class="a11y-option a11y-voice"><strong>Leitura em voz — português brasileiro</strong><small>Lê o texto selecionado ou o conteúdo principal usando a voz disponível no navegador.</small><div><button id="a11y-read" type="button">Ler</button><button id="a11y-pause" type="button">Pausar/continuar</button><button id="a11y-stop" type="button">Parar</button></div></div>
          <button class="a11y-option" data-a11y-toggle="vlibras" data-a11y-name="VLibras" type="button"><strong>Tradução para Libras (VLibras)</strong><small>Carrega o tradutor oficial de português para Libras. É um apoio automático e não substitui intérprete humano.</small><span class="a11y-switch-label"></span></button>
        </div>
        <footer><button id="a11y-reset" type="button">Restaurar preferências</button><span>Atalho: <kbd>Alt</kbd> + <kbd>A</kbd></span></footer>
      </section>
    </div>
    <div id="a11y-magnifier" class="a11y-magnifier" aria-hidden="true" hidden><div class="a11y-magnifier-stage"></div></div>
    <div id="a11y-live-region" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>`;
}

export function mountAccessibilityCenter() {
  if (!document.querySelector(".a11y-center")) document.body.insertAdjacentHTML("beforeend", centerMarkup());
  bindListeners();
  applyPreferences();
}
