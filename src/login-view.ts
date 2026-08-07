import type { AppData, AuthMode, Role } from './types';

export function renderLoginView(_data: AppData, authMode: AuthMode, loginRole: Role) {
  const authTitle = authMode === 'signup' ? 'Criar conta' : authMode === 'reset' ? 'Recuperar senha' : authMode === 'update-password' ? 'Definir nova senha' : 'Entrar';
  const submitLabel = authMode === 'signup' ? 'Criar conta' : authMode === 'reset' ? 'Enviar link' : authMode === 'update-password' ? 'Salvar nova senha' : 'Entrar';
  const iconName = authMode === 'signup' ? 'user-plus' : authMode === 'reset' ? 'rotate-ccw' : authMode === 'update-password' ? 'key-round' : 'log-in';
  const showPassword = authMode !== 'reset' && authMode !== 'update-password';
  const showFullName = authMode === 'signup';
  const roleOptions: Array<{ value: Role; label: string }> = [
    { value: 'usuario', label: 'Usuário' },
    { value: 'gestor', label: 'Gestor' },
    { value: 'tic', label: 'TIC' }
  ];

  return `
    <main class="login-page">
      <div class="login-visual-fx" aria-hidden="true">
        <div class="login-cursor-glow"></div>
        <div class="login-tech-grid"></div>
        <div class="login-scan-line"></div>
        <div class="login-particles">
          ${Array.from({ length: 14 }, (_, index) => `<span style="--particle:${index}"></span>`).join('')}
        </div>
      </div>
      <div class="login-orb login-orb-one" aria-hidden="true"></div>
      <div class="login-orb login-orb-two" aria-hidden="true"></div>
      <button id="login-theme-toggle" class="login-theme-toggle" type="button" aria-label="Alternar tema" title="Alternar tema">
        <i data-lucide="moon"></i>
      </button>
      <section class="login-brand" aria-label="CRQ-12">
        <div class="login-brand-header">
          <div class="login-logo-wrap">
            <img class="login-logo" src="/crq12-logo.jpg" alt="CRQ-12" />
          </div>
          <span class="login-brand-tag">CRQ-12 · Atendimento interno</span>
        </div>

        <div class="login-brand-hero">
          <p class="eyebrow">Sistema Integrado de Chamados</p>
          <h1><span>Central de</span><span>Atendimento <em>TIC</em></span></h1>
          <p class="login-copy">Plataforma corporativa de suporte em tecnologia da informação e acompanhamento de solicitações internas.</p>
          <div class="login-benefits" aria-label="Recursos da plataforma">
            <span><i data-lucide="activity"></i>Acompanhamento em tempo real</span>
            <span><i data-lucide="shield-check"></i>Acesso institucional seguro</span>
            <span><i data-lucide="bell"></i>Atualizações centralizadas</span>
          </div>
        </div>

      </section>

      <section class="login-panel">
        <div class="login-card">
          <form id="login-form" class="login-form">
            <div class="login-card-identity" aria-label="Conselho Regional de Química da 12ª Região">
              <span class="login-card-logo-wrap">
                <img src="/crq12-logo.jpg" alt="Logo do CRQ-12" />
              </span>
              <span>
                <strong>CRQ-12</strong>
                <small>Sistema interno de chamados</small>
              </span>
            </div>
            <div class="form-title">
              <span class="section-kicker">Acesso ao Sistema</span>
              <h2>${authTitle}</h2>
            </div>
            ${authMode === 'login' ? `
              <div class="login-role-selector" role="group" aria-label="Seleção de perfil">
                ${roleOptions.map((option) => `
                  <button class="ghost-button login-role-button ${loginRole === option.value ? 'active' : ''}" type="button" data-login-role="${option.value}">
                    ${option.label}
                  </button>
                `).join('')}
              </div>
              <aside class="manager-access-note">
                <i data-lucide="circle-help"></i>
                <p><strong>Primeiro acesso?</strong><span>Você pode criar sua conta. Para receber perfil de Gestor, solicite a alteração à TIC.</span></p>
              </aside>
            ` : ''}
            ${showFullName ? `
              <label>
                Nome completo
                <input id="login-full-name" type="text" autocomplete="name" placeholder="Seu nome completo" required />
              </label>
            ` : ''}
            ${authMode !== 'update-password' ? `
              <label>
                E-mail corporativo
                <input id="login-email" type="email" autocomplete="email" placeholder="seu.nome@crq12.org.br" required />
              </label>
            ` : ''}
            ${showPassword ? `
              <label>
                ${authMode === 'signup' ? 'Crie sua senha' : 'Senha de acesso'}
                <span class="password-input-wrap">
                  <input id="login-password" type="password" autocomplete="${authMode === 'signup' ? 'new-password' : 'current-password'}" placeholder="Mínimo 8 caracteres" required minlength="${authMode === 'signup' ? '8' : '6'}" />
                  <button class="password-toggle" type="button" data-toggle-password="login-password" aria-label="Mostrar senha" title="Mostrar senha">
                    <span aria-hidden="true">👁</span>
                  </button>
                </span>
              </label>
            ` : ''}
            ${authMode === 'signup' ? `
              <label>
                Confirme sua senha
                <span class="password-input-wrap">
                  <input id="signup-confirm-password" type="password" autocomplete="new-password" placeholder="Repita a senha" required minlength="8" />
                  <button class="password-toggle" type="button" data-toggle-password="signup-confirm-password" aria-label="Mostrar senha" title="Mostrar senha"><span aria-hidden="true">👁</span></button>
                </span>
              </label>
              <label>
                Departamento
                <select id="login-department" required>
                  ${_data.departments.map((d) => `<option value="${d.id}">${d.name.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char))}</option>`).join('')}
                </select>
              </label>
            ` : ''}
            ${authMode === 'update-password' ? `
              <label>
                Nova senha
                <span class="password-input-wrap">
                  <input id="new-password" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres" required minlength="6" />
                  <button class="password-toggle" type="button" data-toggle-password="new-password" aria-label="Mostrar senha" title="Mostrar senha"><span aria-hidden="true">👁</span></button>
                </span>
              </label>
              <label>
                Confirmar nova senha
                <span class="password-input-wrap">
                  <input id="confirm-password" type="password" autocomplete="new-password" placeholder="Repita a nova senha" required minlength="6" />
                  <button class="password-toggle" type="button" data-toggle-password="confirm-password" aria-label="Mostrar senha" title="Mostrar senha"><span aria-hidden="true">👁</span></button>
                </span>
              </label>
            ` : ''}
            <p id="login-error" class="form-error" role="alert"></p>
            <button class="primary-button login-submit-btn" type="submit">
              <i data-lucide="${iconName}"></i>
              ${submitLabel}
            </button>
            ${authMode === 'login' ? `
              <div class="login-secondary-actions" style="display: flex; justify-content: flex-start; gap: 8px; margin-top: 4px;">
                <button class="ghost-button inline-link" type="button" data-auth-mode="reset">
                  <i data-lucide="key-round"></i> Esqueci a senha
                </button>
                <button class="ghost-button inline-link" type="button" data-auth-mode="signup">
                  <i data-lucide="user-plus"></i> Criar minha conta
                </button>
              </div>
            ` : ''}
            ${authMode === 'signup' ? `
              <button class="ghost-button inline-link" type="button" data-auth-mode="login" style="margin-top: 4px;">
                <i data-lucide="arrow-left"></i> Já possui conta? Entrar
              </button>
            ` : ''}
            ${authMode === 'reset' ? `
              <button class="ghost-button inline-link" type="button" data-auth-mode="login" style="margin-top: 4px;">
                <i data-lucide="arrow-left"></i> Voltar para o login
              </button>
            ` : ''}
            ${authMode === 'reset' ? `<p class="login-hint">Informe seu e-mail para receber as instruções de recuperação.</p>` : ''}
            ${authMode === 'signup' ? `<p class="login-hint">A conta será criada como Usuário. Gestor e TIC são concedidos somente pela equipe TIC.</p>` : ''}
            ${authMode === 'update-password' ? `<p class="login-hint">Defina uma nova senha segura para sua conta.</p>` : ''}
          </form>
        </div>
      </section>
    </main>
  `;
}
