"use client";

type UserAccountProps = {
    user: {
        name?: string | null;
        phone?: string | null;
    } | null;
    logoutAction: () => void;
};

export default function UserAccount({ user, logoutAction }: UserAccountProps) {
    return (
        <aside className="h-fit rounded-2xl border p-5">
            <div className="mb-5">
                <div className="mb-1 text-sm text-gray-500">Имя</div>
                <div className="font-medium">{user?.name || "—"}</div>
            </div>

            <div className="mb-6">
                <div className="mb-1 text-sm text-gray-500">Телефон</div>
                <div className="font-medium">{user?.phone || "—"}</div>
            </div>

            <div className="space-y-2">
                <button
                    type="button"
                    className="w-full rounded-xl bg-black px-4 py-3 text-left text-sm text-white"
                    onClick={logoutAction}
                >
                    Выйти
                </button>
            </div>
        </aside>
    );
}