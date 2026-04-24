"use client";

import AdminSearchInput from "@/components/admin/ui/admin-search-input";
import type { AdminUser } from "@/lib/admin-users-api";

export function formatAdminUserPrimary(u: AdminUser) {
    return u.phone || u.name || u.email || "Пользователь";
}

type LoyaltyCardUserSearchPanelProps = {
    title?: string;
    userSearch: string;
    onUserSearchChange: (value: string) => void;
    onSearch: () => void;
    foundUsers: AdminUser[];
    selectedUserIds: number[];
    onToggleUser: (user: AdminUser, nextChecked: boolean) => void;
    alreadyLinkedIds: number[];
};

export default function LoyaltyCardUserSearchPanel({
    title = "Добавить пользователей",
    userSearch,
    onUserSearchChange,
    onSearch,
    foundUsers,
    selectedUserIds,
    onToggleUser,
    alreadyLinkedIds,
}: LoyaltyCardUserSearchPanelProps) {
    return (
        <div>
            <div className="mb-3 text-base font-semibold">{title}</div>
            <div className="flex flex-wrap items-center gap-2">
                <AdminSearchInput
                    value={userSearch}
                    onChangeAction={onUserSearchChange}
                    placeholder="Поиск по имени/телефону/email"
                    syncWithUrl={false}
                />
                <button type="button" onClick={() => onSearch()} className="rounded-xl border px-4 py-2.5 text-sm">
                    Найти
                </button>
            </div>

            {foundUsers.length > 0 ? (
                <ul className="mt-3 divide-y divide-gray-200 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {foundUsers.map((user) => {
                        const linked = alreadyLinkedIds.includes(user.id);
                        const selected = selectedUserIds.includes(user.id);
                        return (
                            <li key={user.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 shrink-0"
                                    disabled={linked}
                                    checked={linked || selected}
                                    onChange={(e) => onToggleUser(user, e.target.checked)}
                                />
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium text-gray-900">{formatAdminUserPrimary(user)}</div>
                                    <div className="mt-0.5 text-xs text-gray-500">
                                        ID {user.id}
                                        {user.email ? ` · ${user.email}` : null}
                                        {linked ? <span className="ml-2 text-emerald-700">уже привязан</span> : null}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}

export function LoyaltyUserSelectionChips({
    users,
    onRemove,
}: {
    users: AdminUser[];
    onRemove: (userId: number) => void;
}) {
    if (users.length === 0) return null;
    return (
        <div className="mb-3 flex flex-wrap gap-2">
            {users.map((u) => (
                <span
                    key={u.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800"
                >
                    <span className="max-w-[200px] truncate">{formatAdminUserPrimary(u)}</span>
                    <span className="text-gray-400">#{u.id}</span>
                    <button
                        type="button"
                        className="ml-0.5 rounded-full p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900"
                        aria-label="Убрать из списка"
                        onClick={() => onRemove(u.id)}
                    >
                        ×
                    </button>
                </span>
            ))}
        </div>
    );
}
