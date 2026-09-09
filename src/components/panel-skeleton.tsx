"use client";

// Заглушка свёрнутой панели на время загрузки.
//
// ═══ ЗАЧЕМ ═══
//
// Панели на экране результатов грузят свои данные сами и до этого возвращали
// null. Выходило, что страница показывалась без них, а через секунду они
// появлялись рывком и сдвигали всё, что ниже: читаешь рейтинг — и он уезжает
// под курсором.
//
// Заглушка держит место ровно такой же высоты, поэтому ничего не прыгает.
//
// ВАЖНО отличать её от пустоты. «Ещё грузится» и «данных нет» — разные
// состояния: у первого заглушка, у второго панель не рисуется вовсе. Свести их
// в один null и значило получить рывок.
export default function PanelSkeleton() {
    return (
        <div className="rounded-2xl border border-border bg-card px-5 py-4">
            <div className="flex items-center gap-3">
                <div className="h-[18px] w-[18px] shrink-0 animate-pulse rounded-md bg-muted" />
                <div className="min-w-0 flex-1">
                    <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
                    <div className="mt-1.5 h-3 w-64 max-w-full animate-pulse rounded bg-muted/70" />
                </div>
            </div>
        </div>
    );
}
