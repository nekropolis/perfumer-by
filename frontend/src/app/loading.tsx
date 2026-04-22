export default function GlobalLoading() {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 backdrop-blur-[1px]">
            <div className="h-11 w-11 animate-spin rounded-full border-4 border-white/40 border-t-white shadow-lg" />
        </div>
    );
}
