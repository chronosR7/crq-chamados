import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type Role = "usuario" | "gestor" | "tic";

function temporaryPassword() {
  const number = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return `Crq12@${String(number).padStart(6, "0")}`;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found || data.users.length < 1000) return found;
  }
  return undefined;
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");
    if (!supabaseUrl || !serviceRoleKey || !authorization) {
      return response({ error: "Configuração ou autenticação ausente." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return response({ error: "Sessão inválida." }, 401);

    const { data: actor, error: actorError } = await admin
      .from("profiles")
      .select("id, role, department_id, managed_department_ids, active")
      .eq("id", authData.user.id)
      .single();
    if (actorError || !actor || actor.active === false || !["tic", "gestor"].includes(actor.role)) {
      return response({ error: "Você não possui permissão para administrar usuários." }, 403);
    }

    const body = await request.json();
    const action = String(body.action ?? "");
    const actorDepartments = new Set<string>([
      String(actor.department_id ?? ""),
      ...((actor.managed_department_ids ?? []) as unknown[]).map(String)
    ].filter(Boolean));

    if (action === "create") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const newTemporaryPassword = temporaryPassword();
      const fullName = String(body.fullName ?? "").trim();
      const requestedRole = String(body.role ?? "usuario") as Role;
      const rawDepartmentIds = Array.isArray(body.departmentIds) ? body.departmentIds : [];
      const departmentIds = Array.from(new Set(rawDepartmentIds.map(String).filter(Boolean))) as string[];

      if (!email || !fullName || departmentIds.length === 0) {
        return response({ error: "Preencha nome, e-mail e departamento." }, 400);
      }
      if (!email.includes("@")) return response({ error: "E-mail inválido." }, 400);
      if (!["usuario", "gestor", "tic"].includes(requestedRole)) {
        return response({ error: "Perfil inválido." }, 400);
      }

      const finalRole: Role = actor.role === "tic" ? requestedRole : "usuario";
      if (actor.role === "gestor" && departmentIds.some((id) => !actorDepartments.has(id))) {
        return response({ error: "Gestores só podem criar usuários nos departamentos que gerenciam." }, 403);
      }

      // Contas antigas eram apenas desativadas. A TIC pode limpar esse resíduo
      // automaticamente para reutilizar o mesmo e-mail sem entrar no painel.
      const { data: existingProfile, error: existingError } = await admin
        .from("profiles")
        .select("id, active")
        .eq("email", email)
        .maybeSingle();
      if (existingError) return response({ error: existingError.message }, 500);
      if (existingProfile && existingProfile.active !== false) {
        return response({ error: "Já existe uma conta com este e-mail." }, 409);
      }
      if (existingProfile && actor.role === "tic") {
        const { error: legacyDeleteError } = await admin.auth.admin.deleteUser(existingProfile.id, false);
        if (legacyDeleteError) {
          return response({ error: `Não foi possível limpar a conta antiga: ${legacyDeleteError.message}` }, 409);
        }
      }
      if (!existingProfile) {
        const orphanAuthUser = await findAuthUserByEmail(admin, email);
        if (orphanAuthUser) {
          if (actor.role !== "tic") return response({ error: "Já existe uma conta com este e-mail." }, 409);
          const { error: orphanDeleteError } = await admin.auth.admin.deleteUser(orphanAuthUser.id, false);
          if (orphanDeleteError) return response({ error: `Não foi possível limpar a autenticação antiga: ${orphanDeleteError.message}` }, 409);
        }
      }

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: newTemporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });
      if (createError || !created.user) {
        const duplicate = /already|registered|exists/i.test(createError?.message ?? "");
        return response({ error: duplicate ? "Já existe uma conta com este e-mail." : (createError?.message ?? "Não foi possível criar a conta.") }, 409);
      }

      // Reafirma a credencial no Auth antes de criar o perfil. A operação só é
      // confirmada quando o próprio Auth aceitou explicitamente a senha entregue.
      const { error: credentialError } = await admin.auth.admin.updateUserById(created.user.id, {
        password: newTemporaryPassword,
        email_confirm: true
      });
      if (credentialError) {
        await admin.auth.admin.deleteUser(created.user.id, false);
        return response({ error: `A conta não pôde validar a senha temporária: ${credentialError.message}` }, 500);
      }

      const profile = {
        id: created.user.id,
        full_name: fullName,
        email,
        role: finalRole,
        department_id: departmentIds[0],
        managed_department_ids: finalRole === "tic" ? [] : departmentIds.slice(1),
        active: true,
        pending_approval: false,
        approved_by_tic: actor.role === "tic"
        ,must_change_password: true
      };
      const { error: profileError } = await admin.from("profiles").upsert(profile, { onConflict: "id" });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return response({ error: `Conta não concluída: ${profileError.message}` }, 500);
      }

      return response({ user: profile, temporaryPassword: newTemporaryPassword }, 201);
    }

    if (action === "reset-password") {
      if (actor.role !== "tic") return response({ error: "Somente a TIC pode gerar senha temporária." }, 403);
      const targetId = String(body.userId ?? "");
      if (!targetId) return response({ error: "Usuário inválido." }, 400);
      const newTemporaryPassword = temporaryPassword();
      const { data: previousProfile, error: profileReadError } = await admin
        .from("profiles")
        .select("must_change_password, active")
        .eq("id", targetId)
        .single();
      if (profileReadError || !previousProfile || previousProfile.active === false) {
        return response({ error: "Usuário ativo não encontrado." }, 404);
      }
      const { error: flagError } = await admin.from("profiles").update({ must_change_password: true }).eq("id", targetId);
      if (flagError) return response({ error: flagError.message }, 500);
      const { error: passwordError } = await admin.auth.admin.updateUserById(targetId, {
        password: newTemporaryPassword,
        email_confirm: true
      });
      if (passwordError) {
        await admin.from("profiles").update({ must_change_password: previousProfile.must_change_password === true }).eq("id", targetId);
        return response({ error: passwordError.message }, 500);
      }
      return response({ temporaryPassword: newTemporaryPassword });
    }

    if (action === "update") {
      if (actor.role !== "tic") return response({ error: "Somente a TIC pode editar perfis existentes." }, 403);
      const targetId = String(body.userId ?? "");
      const email = String(body.email ?? "").trim().toLowerCase();
      const fullName = String(body.fullName ?? "").trim();
      const requestedRole = String(body.role ?? "usuario") as Role;
      const departmentIds = Array.from(new Set(
        (Array.isArray(body.departmentIds) ? body.departmentIds : []).map(String).filter(Boolean)
      )) as string[];
      if (!targetId || !email || !fullName || !["usuario", "gestor", "tic"].includes(requestedRole)) {
        return response({ error: "Dados do usuário inválidos." }, 400);
      }
      if (requestedRole !== "tic" && departmentIds.length === 0) {
        return response({ error: "Selecione ao menos um departamento." }, 400);
      }

      const { data: target, error: targetError } = await admin.from("profiles").select("email").eq("id", targetId).single();
      if (targetError || !target) return response({ error: "Usuário não encontrado." }, 404);
      if (target.email !== email) {
        const { error: authUpdateError } = await admin.auth.admin.updateUserById(targetId, { email, email_confirm: true });
        if (authUpdateError) return response({ error: authUpdateError.message }, 409);
      }
      const { error: updateError } = await admin.from("profiles").update({
        full_name: fullName,
        email,
        role: requestedRole,
        department_id: departmentIds[0] || null,
        managed_department_ids: requestedRole === "tic" ? [] : departmentIds.slice(1),
        active: body.active !== false,
        pending_approval: false,
        approved_by_tic: true
      }).eq("id", targetId);
      if (updateError) {
        if (target.email !== email) {
          await admin.auth.admin.updateUserById(targetId, { email: target.email, email_confirm: true });
        }
        return response({ error: updateError.message }, 500);
      }
      return response({ success: true });
    }

    if (action === "delete") {
      const targetId = String(body.userId ?? "");
      if (!targetId || targetId === actor.id) return response({ error: "Você não pode excluir a própria conta." }, 400);

      const { data: target, error: targetError } = await admin
        .from("profiles")
        .select("id, full_name, role, department_id, managed_department_ids")
        .eq("id", targetId)
        .single();
      if (targetError || !target) return response({ error: "Usuário não encontrado." }, 404);

      if (actor.role === "gestor") {
        const targetDepartments = [target.department_id, ...(target.managed_department_ids ?? [])].filter(Boolean).map(String);
        if (target.role !== "usuario" || targetDepartments.length === 0 || !targetDepartments.every((id) => actorDepartments.has(id))) {
          return response({ error: "Gestores só podem excluir usuários comuns vinculados exclusivamente aos departamentos que gerenciam." }, 403);
        }
      }

      // Não dependemos da cascata de auth.users, pois bancos antigos podem ter
      // sido criados sem essa FK. A exclusão explícita torna o fluxo previsível.
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(targetId, false);
      const authAlreadyMissing = /not found|does not exist/i.test(deleteAuthError?.message ?? "");
      if (deleteAuthError && !authAlreadyMissing) return response({ error: deleteAuthError.message }, 500);

      const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", targetId);
      if (deleteProfileError) return response({ error: `A conta foi removida do Auth, mas o perfil não pôde ser excluído: ${deleteProfileError.message}` }, 500);
      const { data: remainingProfile } = await admin.from("profiles").select("id").eq("id", targetId).maybeSingle();
      if (remainingProfile) return response({ error: "O Auth removeu a conta, mas o perfil permaneceu no banco." }, 500);
      return response({ success: true });
    }

    return response({ error: "Ação administrativa inválida." }, 400);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Erro inesperado." }, 500);
  }
});
