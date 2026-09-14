// Декоративные текущие линии на левой панели входа/регистрации — тот же
// эффект, что и в референсе владельца (плавные волокна на тёмном фоне), но
// на чистом CSS (stroke-dashoffset), а не framer-motion: анимация для одной
// декоративной панели не стоит новой зависимости в бандле.
export default function AuthFloatingPaths() {
    const paths = Array.from({ length: 18 }, (_, i) => {
        const offset = i * 7;
        return {
            d: `M-${340 - offset} -${170 + offset * 1.2} C-${340 - offset} -${170 + offset * 1.2} -${270 - offset} ${190 - offset} ${140 - offset} ${300 - offset} C${560 - offset} ${420 - offset} ${640 - offset} ${780 - offset} ${640 - offset} ${780 - offset}`,
            width: 0.5 + i * 0.05,
            delay: -(i * 1.1),
            duration: 16 + (i % 5) * 3,
        };
    });

    return (
        <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full text-white"
            viewBox="0 0 696 620"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
        >
            {paths.map((path, i) => (
                <path
                    key={i}
                    d={path.d}
                    stroke="currentColor"
                    strokeWidth={path.width}
                    className="auth-floating-path"
                    style={{ animationDelay: `${path.delay}s`, animationDuration: `${path.duration}s` }}
                />
            ))}
        </svg>
    );
}
