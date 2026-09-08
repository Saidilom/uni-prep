import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { validateCertificate } from "@/lib/external-certificate";

// Путь «ученик вводит сам».
//
// Пишем через СЕССИОННЫЙ клиент, а не service-role: тогда действуют политики
// external_certificates, и ученик физически не может ни выдать запись за
// админский импорт, ни подтвердить её сам. Проверено живым прогоном под ролью
// ученика — все четыре попытки отклонены базой.
//
// source и verification_status здесь НЕ приходят с клиента: они проставляются
// на сервере. Даже если бы политика их пропустила, принять их из тела запроса
// значило бы предложить подделать.
const SelfCertificateSchema = z.object({
    subjectId: z.string().min(1),
    score: z.number(),
    level: z.enum(["C", "C+", "B", "B+", "A", "A+"]).nullable().optional(),
    issuedAt: z.string().min(4),
    certificateNumber: z.string().max(64).nullable().optional(),
});

export async function GET() {
    const client = createRouteHandlerClient();
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    // Свои записи отдаёт RLS: фильтра по user_id здесь нет намеренно, чтобы
    // права жили в одном месте, а не в двух.
    const { data, error } = await client
        .from("external_certificates")
        .select("id, subject_id, score, level, issued_at, certificate_number, source, verification_status, level_matches_score, created_at")
        .order("issued_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ certificates: data ?? [] });
}

export async function POST(req: NextRequest) {
    const client = createRouteHandlerClient();
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = SelfCertificateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Некорректные данные сертификата" }, { status: 400 });

    // Проверяем ДО базы, чтобы вернуть понятную причину: «балл ниже 46 —
    // с таким сертификат не выдаётся» вместо отказа CHECK-ограничения.
    const validation = validateCertificate({
        subjectId: parsed.data.subjectId,
        score: parsed.data.score,
        level: parsed.data.level ?? null,
        issuedAt: parsed.data.issuedAt,
        certificateNumber: parsed.data.certificateNumber ?? null,
    });
    if (!validation.ok) return NextResponse.json({ error: validation.reason }, { status: 400 });

    const { data, error } = await client
        .from("external_certificates")
        .insert({
            user_id: authData.user.id,
            subject_id: parsed.data.subjectId,
            score: parsed.data.score,
            level: parsed.data.level ?? null,
            issued_at: parsed.data.issuedAt,
            certificate_number: parsed.data.certificateNumber ?? null,
            // Проставляет сервер, не клиент.
            source: "self",
            verification_status: "unverified",
            created_by: authData.user.id,
        })
        .select("id, level_matches_score")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });

    return NextResponse.json({
        id: data.id,
        // Ученику полезно сразу увидеть, что балл и уровень не сходятся: чаще
        // всего это его же опечатка, и исправить проще сейчас.
        levelMatchesScore: data.level_matches_score,
        verificationStatus: "unverified",
    });
}
