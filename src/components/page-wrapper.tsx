export default function PageWrapper({
    children,
    className = "",
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
                <div className="px-6 pb-8 pt-6 sm:px-8 sm:pt-8">{children}</div>
            </div>
        </div>
    );
}
