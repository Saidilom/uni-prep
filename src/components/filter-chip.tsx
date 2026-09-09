"use client";

// Кнопка фильтра со счётчиком.
//
// Счётчик рядом с названием обязателен: без него не видно, что предмет или
// филиал в списке есть, а групп в нём ноль — и нажатие выглядит как поломка.
//
// Считать счётчик надо по ВСЕМ элементам, а не по отфильтрованным, иначе
// число на вкладке менялось бы от того, что она же и выбрана.
export default function FilterChip({ label, count, active, onClick }: {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                active
                    ? "border-transparent bg-foreground text-background"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
        >
            <span className="max-w-[14rem] truncate">{label}</span>
            <span className={`tabular-nums ${active ? "opacity-70" : "opacity-60"}`}>{count}</span>
        </button>
    );
}
