import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

const AssignmentSchema = z.discriminatedUnion("targetType", [
  z.object({ targetType: z.literal("class"), targetId: z.string().uuid() }),
  z.object({ targetType: z.literal("student"), targetId: z.string().min(1) }),
]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { data: profile } = await supabaseServer.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "teacher") return NextResponse.json({ error: "Назначать может только учитель" }, { status: 403 });

  const { data: test } = await supabaseServer
    .from("mock_tests")
    .select("id,created_by,type,price,status")
    .eq("id", params.id)
    .single();
  if (!test || test.created_by !== user.id || test.type !== "class_only" || test.price !== 0 || test.status !== "published") {
    return NextResponse.json({ error: "Можно назначать только свой опубликованный бесплатный Mock" }, { status: 403 });
  }

  const parsed = AssignmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректное назначение" }, { status: 400 });

  if (parsed.data.targetType === "class") {
    const { data: ownedClass } = await supabaseServer
      .from("classes")
      .select("id")
      .eq("id", parsed.data.targetId)
      .eq("teacher_id", user.id)
      .maybeSingle();
    if (!ownedClass) return NextResponse.json({ error: "Класс не принадлежит учителю" }, { status: 403 });
    const { error } = await client.from("mock_class_assignments").upsert(
      { id: crypto.randomUUID(), mock_test_id: params.id, class_id: parsed.data.targetId },
      { onConflict: "mock_test_id,class_id", ignoreDuplicates: true },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: membership } = await supabaseServer
      .from("class_members")
      .select("class_id,classes!inner(teacher_id)")
      .eq("student_id", parsed.data.targetId)
      .eq("classes.teacher_id", user.id)
      .limit(1)
      .maybeSingle();
    if (!membership) return NextResponse.json({ error: "Ученик не состоит в ваших группах" }, { status: 403 });
    const { error } = await client.from("mock_student_assignments").upsert(
      { mock_test_id: params.id, student_id: parsed.data.targetId, assigned_by: user.id },
      { onConflict: "mock_test_id,student_id", ignoreDuplicates: true },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
