import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import { validateCertificate } from "@/lib/external-certificate";

// Путь «админ импортирует».
//
// source = 'admin', но verification_status всё равно 'unverified': импорт
// означает «перенёс из таблицы», а не «держал документ в руках». Подтверждает
// отдельное действие — /api/certificates/[id]/verify, и оно проставляет, КТО
// подтвердил.
//
// Клиент сессионный: право на запись даёт политика external_certificates_admin,
// и обойти её отсюда нельзя. Отдельной проверки роли в коде нет намеренно —
// она была бы второй копией правила, которое уже живёт в политике.
const ImportRowSchema = z.object({
    userId: z.string().min(1),
    subjectId: z.string().min(1),
    score: z.number(),
    level: z.enum(["C", "C+", "B", "B+", "A", "A+"]).nullable().optional(),
    issuedAt: z.string().min(4),
    certificateNumber: z.string().max(64).nullable().optional(),
});

const ImportSchema = z.object({ rows: z.array(ImportRowSchema).min(1).max(500) });

export async function POST(req: NextRequest) {
    const client = createRouteHandlerClient();
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const parsed = ImportSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Некорректный список" }, { status: 400 });

    // Отбраковка ДО записи и построчно: импорт на 300 строк не должен
    // падать целиком из-за одной опечатки, но и молча её глотать нельзя —
    // возвращаем, какая строка и почему не прошла.
    const rejected: Array<{ row: number; reason: string }> = [];
    const accepted = parsed.data.rows.flatMap((row, i) => {
        const validation = validateCertificate({
            subjectId: row.subjectId,
            score: row.score,
            level: row.level ?? null,
            issuedAt: row.issuedAt,
            certificateNumber: row.certificateNumber ?? null,
        });
        if (!validation.ok) {
            rejected.push({ row: i + 1, reason: validation.reason });
            return [];
        }
        return [{
            user_id: row.userId,
            subject_id: row.subjectId,
            score: row.score,
            level: row.level ?? null,
            issued_at: row.issuedAt,
            certificate_number: row.certificateNumber ?? null,
            source: "admin" as const,
            verification_status: "unverified" as const,
            created_by: authData.user!.id,
        }];
    });

    if (accepted.length === 0) {
        return NextResponse.json({ imported: 0, rejected }, { status: 400 });
    }

    const { data, error } = await client
        .from("external_certificates")
        .insert(accepted)
        .select("id, level_matches_score");
    if (error) return NextResponse.json({ error: error.message, rejected }, { status: 403 });

    return NextResponse.json({
        imported: data?.length ?? 0,
        rejected,
        // Расхождения уровня и балла — то, что надо разобрать до линкинга.
        levelMismatches: (data ?? []).filter((r) => r.level_matches_score === false).length,
    });
}
