# Sistema de Chamados CRQ-12

Aplicação interna para registrar e acompanhar demandas entre os departamentos do CRQ-12 e a TIC. O Supabase é a única fonte dos dados operacionais: autenticação, perfis, chamados, histórico, notificações, tutoriais e anexos.

## Desenvolvimento

```bash
npm install
npm run dev
```

Use `.env.example` como referência. A chave do navegador deve ser a chave pública/anon do Supabase. A `service_role` nunca deve ser adicionada ao frontend.

## Comandos

```bash
npm run check    # TypeScript estrito e testes automatizados
npm run build    # gera a pasta dist para publicação
npm run preview  # confere localmente o build de produção
```

## Organização

- `src/main.ts`: interface e coordenação dos fluxos da aplicação.
- `src/supabase.ts`: leitura e gravação no Supabase.
- `src/ticket-rules.ts`: regras testáveis de acesso e visibilidade.
- `src/types.ts`: contratos dos dados.
- `src/login-view.ts`: tela de autenticação.
- `src/styles.css`: identidade visual e responsividade.
- `supabase/functions/manage-user`: operações administrativas que exigem `service_role`.
- `supabase-*.sql`: esquema, correções e migrações documentadas do banco.

## Regras importantes

- Usuário acessa os próprios chamados.
- Gestor acessa os departamentos sob sua gestão.
- TIC administra a operação completa.
- Contas criadas administrativamente recebem senha temporária e exigem troca no primeiro acesso.
- Anexos ficam em bucket privado e possuem metadados no banco.
- Tema, menu recolhido, filtros e última tela são apenas preferências locais.
- Relatórios Word são gerados para download; os dados de origem permanecem no Supabase.

## Produção

Para Cloudflare Pages, siga `CLOUDFLARE-PAGES.md`. Para a validação funcional,
consulte `PRODUCTION-CHECKLIST.md`. Sempre execute `npm run check`, `npm run build`
e teste os fluxos com contas separadas de Usuário, Gestor e TIC antes de
substituir a versão publicada.
