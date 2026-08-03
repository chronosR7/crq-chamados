# Autenticação do CRQ-12 no Supabase

## Cadastro sem e-mail

Cada pessoa cria sua própria conta e senha na tela de login. Para o Supabase não enviar mensagem no cadastro e liberar o acesso imediatamente:

1. Acesse **Authentication → Providers → Email**.
2. Mantenha o provedor Email habilitado.
3. Desative **Confirm email**.
4. Salve.

A unicidade é garantida pelo `auth.users` do Supabase e pela restrição `unique` de `profiles.email`. Uma segunda conta com o mesmo e-mail não é criada.

Contas públicas sempre nascem com papel `usuario`. Somente a TIC pode promover uma conta para `gestor` ou `tic`.

## E-mail somente para recuperação

O único envio ao usuário passa a ser quando ele escolher **Esqueci a senha**.

Em **Authentication → Email Templates → Reset Password**, use:

Assunto:

`CRQ-12 | Redefinição de senha`

```html
<h2>Redefinição de senha</h2>
<p>Recebemos uma solicitação para redefinir a senha da sua conta no Sistema de Chamados do CRQ-12.</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;background:#168ac0;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Redefinir minha senha</a></p>
<p>Se você não solicitou essa alteração, ignore esta mensagem e sua senha continuará a mesma.</p>
<p>Atenciosamente,<br><strong>Equipe TIC · CRQ-12</strong></p>
```

Em **Authentication → URL Configuration**, cadastre a URL pública em `Site URL` e em `Redirect URLs`.
