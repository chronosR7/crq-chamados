# Sistema de Chamados CRQ-12

Protótipo navegável em HTML, CSS e TypeScript para validar o fluxo de chamados do CRQ-12 antes da integração com Supabase e infraestrutura interna.

## Como executar

```bash
npm install
npm run dev
```

Contas de demonstração:

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Usuário | usuario@crq12.org.br | crq123 |
| Gestor | gestor@crq12.org.br | crq123 |
| TIC | tic@crq12.org.br | crq123 |

## O que já está no protótipo

- Login por e-mail e senha com perfis Usuário, Gestor e TIC.
- Painel com resumo por status e visão TIC com fila crítica.
- Tabela de chamados com filtros, SLA de atendimento e SLA de solução.
- Abertura de chamado com tipo, categoria, observadores, descrição e anexos até 2 MB.
- Linha do tempo do chamado, comentários e ações exclusivas do TIC.
- Gestão de usuários para Gestor e TIC.
- Configuração manual de SLA para o TIC.
- Central de notificações simulando e-mails e avisos de plataforma.

## Próximos passos recomendados

1. Conectar autenticação ao Supabase Auth.
2. Persistir chamados, anexos, eventos, notificações e regras de SLA no Supabase.
3. Configurar armazenamento interno/servidor CRQ e política de backup.
4. Integrar SMTP institucional para e-mails transacionais.
5. Definir matriz final de departamentos, categorias, prioridades e regras de SLA.
