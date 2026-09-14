// Общий кружок аватара: карточка Google/Telegram, если есть, иначе первая
// буква имени. Один компонент, а не копия условия в topbar/sidebar/профиле —
// три места уже разошлись бы в мелочах (padding, цвет буквы), если бы каждое
// решало это само.
export default function UserAvatar({
    name,
    avatarUrl,
    sizeClassName = "h-7 w-7 text-[11px]",
    colorClassName = "bg-primary text-primary-foreground",
}: {
    name: string;
    avatarUrl?: string | null;
    sizeClassName?: string;
    /** Фон/цвет буквы-заглушки — не применяется, если есть фото. */
    colorClassName?: string;
}) {
    if (avatarUrl) {
        return (
            // Внешний URL (Google/Telegram CDN) — next/image потребовал бы
            // заранее перечислять оба домена в конфиге ради одной картинки.
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={avatarUrl}
                alt=""
                className={`shrink-0 rounded-full object-cover ${sizeClassName}`}
                referrerPolicy="no-referrer"
            />
        );
    }
    return (
        <div className={`flex shrink-0 items-center justify-center rounded-full font-black ${sizeClassName} ${colorClassName}`}>
            {(name?.[0] || "U").toUpperCase()}
        </div>
    );
}
