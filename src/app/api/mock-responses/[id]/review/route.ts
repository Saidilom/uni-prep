import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/server";

const ReviewSchema = z.object({
  // Official essay rubrics score in fractional increments (e.g. the English
  // conversion table: 0.6, 1.3, 1.9 ... 10.0) — a teacher grading against
  // that table needs to enter the exact value, not a rounded integer.
  points: z.number().min(0),
  feedback: z.string().max(4000),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const client = createRouteHandlerClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  const parsed = ReviewSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректная оценка" }, { status: 400 });
  const { data, error } = await client.rpc("review_mock_response", {
    p_detail_id: params.id,
    p_points: parsed.data.points,
    p_feedback: parsed.data.feedback,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json(data);
}

