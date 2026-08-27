import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient, supabaseServer } from "@/lib/supabase/server";

const BUCKET = "uni-prep";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

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

    const extByMime: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
    const ext = extByMime[file.type];
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${filename}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": file.type || "application/octet-stream",
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
