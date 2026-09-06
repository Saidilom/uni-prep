import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Постоянный супер-админ (миграция 025). База откажет и сама, но отказать до
// удаления из auth дешевле: иначе аккаунт остался бы без входа, а профиль — на
// месте.
const PERMANENT_SUPER_ADMIN_ID = "ed845170-28aa-4d33-b0a1-40a9e8d8af01";

// Удаление пользователя из админ-панели.
//
// Удалять нужно В ДВУХ местах: public.users и auth.users. Связи между ними нет
// (проверено на боевой базе), поэтому каскад ничего сам не уберёт. Снести
// только профиль — почта останется занятой, и человек не сможет
// зарегистрироваться заново; снести только auth — останется висеть профиль.
//
// Порядок именно такой: сначала auth, потом профиль. Если оборвётся посередине,
// почта уже свободна и повторная регистрация сработает (handle_new_user создаст
// новый профиль), а осиротевший старый профиль удалится повторным нажатием —
// роут идемпотентный и «уже нет» ошибкой не считает.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { data: isAdmin } = await client.rpc("is_admin");
  if (!isAdmin) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const targetId = params.id;
  if (targetId === PERMANENT_SUPER_ADMIN_ID) {
    return NextResponse.json({ error: "Главного супер-админа удалить нельзя" }, { status: 400 });
  }
  if (targetId === authData.user.id) {
    return NextResponse.json({ error: "Нельзя удалить собственный аккаунт" }, { status: 400 });
  }

  const { data: target } = await supabaseServer
    .from("users")
    .select("email, name, surname, role")
    .eq("id", targetId)
    .maybeSingle();

  const { error: authError } = await supabaseServer.auth.admin.deleteUser(targetId);
  // «Не найден» — не сбой: значит запись входа уже убрали, а профиль остался,
  // и его как раз надо дочистить ниже.
  if (authError && !/not found/i.test(authError.message)) {
    return NextResponse.json({ error: `Не удалось удалить вход: ${authError.message}` }, { status: 500 });
  }

  // Профиль удаляем сессионным клиентом, а не служебным ключом: тогда триггер
  // аудита (миграция 084) видит auth.uid() и запишет, КТО удалил.
  const { error: profileError } = await client.from("users").delete().eq("id", targetId);
  if (profileError) {
    return NextResponse.json({ error: `Вход удалён, но профиль остался: ${profileError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email: target?.email ?? null });
}
