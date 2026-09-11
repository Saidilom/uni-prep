import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/app-config";

// Картинка ссылки для соцсетей и мессенджеров.
//
// Основной способ, которым сюда попадают ученики, — ссылка, пересланная в
// Telegram. Без этой картинки она разворачивается серым прямоугольником с
// голым доменом; с ней — карточкой с названием и обещанием.
//
// Текст намеренно на латинице: своих шрифтов сюда не подгружаем, а встроенный
// у ImageResponse кириллицу рисует ненадёжно.
export const alt = "Registan — Milliy sertifikat va mock imtihonlar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    padding: "80px",
                    background: "linear-gradient(135deg, #0f2b46 0%, #1d4e79 100%)",
                    color: "white",
                    fontFamily: "sans-serif",
                }}
            >
                <div style={{ fontSize: 34, letterSpacing: 6, opacity: 0.75 }}>{APP_NAME.toUpperCase()}</div>
                <div style={{ fontSize: 82, fontWeight: 700, lineHeight: 1.1, marginTop: 28 }}>
                    Milliy sertifikat va
                </div>
                <div style={{ fontSize: 82, fontWeight: 700, lineHeight: 1.1, color: "#8ec5ff" }}>
                    mock imtihonlar
                </div>
                <div style={{ fontSize: 34, marginTop: 36, opacity: 0.85 }}>
                    Kirish testi · Mock imtihon · Batafsil tahlil
                </div>
                <div style={{ fontSize: 30, marginTop: "auto", opacity: 0.7 }}>testregiston.uz</div>
            </div>
        ),
        size,
    );
}
