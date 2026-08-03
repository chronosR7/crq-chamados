# Checklist de publicação — CRQ-12 Chamados

## Obrigatório antes do deploy

1. No Supabase SQL Editor, executar nesta ordem:
   - `supabase-production-hardening.sql`
   - `supabase-release-readiness.sql`
   - `supabase-knowledge-base.sql`
   - `supabase-hard-delete-users.sql`
2. Confirmar que ambos terminam com `Success. No rows returned.`
3. Em Authentication > Providers > Email, confirmar a configuração desejada:
   - cadastro comum sem confirmação por e-mail;
   - recuperação de senha habilitada;
   - URL pública adicionada às Redirect URLs.
4. Confirmar que a função `manage-user` está publicada. A versão revisada foi publicada em 02/08/2026.
5. Publicar a pasta `dist` recém-gerada.

## Teste rápido em produção

Usar três contas separadas: TIC, Gestor e Usuário.

1. Usuário cria chamado com título, descrição longa e anexo PDF.
2. Confirmar que o chamado aparece para TIC com ID único.
3. TIC inicia, comenta com anexo e agenda o chamado.
4. Confirmar que comentário, anexo, histórico, status e notificação aparecem ao requerente.
5. Recarregar as duas sessões e confirmar que tudo permanece.
6. Gestor confirma que enxerga somente chamados e usuários dos departamentos gerenciados.
7. TIC move o chamado para lixeira, recarrega, restaura e confirma o status anterior.
8. Gerar relatório Word TIC e Gestor para um período de até 31 dias.
9. TIC cria um tutorial em rascunho, publica para um perfil e confirma a notificação.
10. Testar “Esqueci a senha” usando uma caixa de e-mail real.
11. Testar em desktop e em um celular real, nos modos claro e escuro.

## Critério de interrupção

Não ampliar para todos os departamentos se qualquer teste apresentar:

- chamado ausente ou duplicado;
- comentário/histórico perdido após recarregar;
- acesso de Gestor a departamento não autorizado;
- falha de redefinição de senha;
- erro 400, 403, 409 ou 500 no console durante o fluxo principal.

Se isso ocorrer, manter um piloto restrito à TIC até a causa ser corrigida.
