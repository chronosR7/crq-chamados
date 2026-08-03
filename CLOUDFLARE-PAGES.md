# Publicação no Cloudflare Pages

Esta aplicação é um frontend Vite estático. O Cloudflare entrega os arquivos da
pasta `dist`; autenticação, banco, anexos, Realtime e funções administrativas
continuam no Supabase.

## 1. Criar o projeto

1. Envie este código para um repositório privado no GitHub.
2. No painel Cloudflare, abra **Workers & Pages**.
3. Selecione **Create application > Pages > Connect to Git**.
4. Autorize o GitHub e escolha o repositório.
5. Configure:
   - Production branch: `main`
   - Framework preset: `Vite`
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `/`

Não cadastre uma Pages Function. O backend do sistema já está no Supabase.

## 2. Variáveis de ambiente

Em **Settings > Environment variables**, adicione nas opções **Production** e
**Preview**:

- `VITE_SUPABASE_URL`: URL atual do projeto Supabase.
- `VITE_SUPABASE_ANON_KEY`: chave pública/anon atual do Supabase.
- `VITE_APP_URL`: URL principal do Pages, por exemplo
  `https://crq-chamados.pages.dev`, sem barra no final.
- `NODE_VERSION`: `22`

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no Cloudflare Pages. Essa chave deve
existir somente nos Secrets da Edge Function do Supabase.

Depois de salvar as variáveis, execute **Retry deployment** para gerar um novo
build. Variáveis `VITE_` são incorporadas no frontend no momento do build.

## 3. Autorizar o domínio no Supabase

No Supabase, abra **Authentication > URL Configuration**:

1. Mantenha temporariamente o endereço da Netlify nas Redirect URLs.
2. Adicione `https://crq-chamados.pages.dev/**` às Redirect URLs.
3. Após validar a migração, defina a URL oficial em **Site URL**.
4. Se usar domínio próprio, adicione também
   `https://chamados.seudominio.gov.br/**` e altere `VITE_APP_URL` para ele.

O endereço exato exibido pelo Cloudflare deve substituir os exemplos acima.

## 4. O que já está preparado no código

- `public/_redirects` redireciona rotas da SPA para `index.html`.
- `public/_headers` preserva CSP, proteção contra iframe e cache dos assets.
- A recuperação de senha usa `VITE_APP_URL`, sem depender da Netlify.
- HTTPS e CDN são fornecidos automaticamente pelo Cloudflare.

## 5. Validação antes de trocar o endereço oficial

Abra a URL `pages.dev` em janela anônima e execute:

1. Login de Usuário, Gestor e TIC.
2. Criação de chamado com e sem anexo.
3. Comentário, notificação, alteração de status e atualização em tempo real.
4. Recuperação de senha por e-mail, confirmando o retorno ao Cloudflare.
5. Criação administrativa de usuário e troca da senha provisória.
6. Relatório Word e download de anexo.
7. Atualização da página em cada tela para confirmar o fallback da SPA.

Somente depois mantenha a Cloudflare como produção. A publicação na Netlify pode
continuar ativa durante todo o teste e serve como retorno imediato.
