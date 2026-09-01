import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

const BUCKET = "uni-prep";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

// file.type is whatever the browser/client claims — trivially forgeable
// (a renamed .html served as "image/png" would still get an image/*
// Content-Type back from this endpoint's public bucket, a stored-XSS
// vector). Check the actual file signature, same principle as the %PDF-
// magic-byte check already done for test PDFs in mock-tests/import/route.ts.
function detectImageMime(bytes: Uint8Array): string | null {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
    if (
        bytes.length >= 12 &&
        bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) return "image/webp";
    return null;
}

export async function POST(req: NextRequest) {
    const routeClient = createRouteHandlerClient();
    const { data: authData } = await routeClient.auth.getUser();
    if (!authData.user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    const { data: profile } = await supabaseServer.from("users").select("role").eq("id", authData.user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
    }

    const body = await req.formData();
    const file = body.get("file") as File | null;
    if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ALLOWED_IMAGES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Разрешены PNG, JPEG, WebP или GIF до 10 MB" }, { status: 415 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const detectedMime = detectImageMime(new Uint8Array(arrayBuffer));
    if (!detectedMime || detectedMime !== file.type) {
        return NextResponse.json({ error: "Содержимое файла не соответствует заявленному типу изображения" }, { status: 415 });
    }

    const extByMime: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
    const ext = extByMime[detectedMime];
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": detectedMime,
            "x-upsert": "true",
        },
        body: arrayBuffer,
    });

    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        console.error("[upload] Supabase error:", uploadRes.status, err);
        return NextResponse.json({ error: `Upload failed: ${err}` }, { status: 500 });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${filename}`;
    return NextResponse.json({ url: publicUrl });
}
