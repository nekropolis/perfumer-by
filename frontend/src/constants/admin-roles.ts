export const ADMIN_ROLES = ["admin", "ceo", "manager"] as const;
export const ROLE_LABELS: Record<string, string> = {
    admin: "Админ",
    manager: "Менеджер",
    ceo: "CEO",
    customer: "Пользователь",
};

export function isAdminRole(role?: string | null): boolean {
    return !!role && ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
}

export function getRoleLabel(role?: string) {
    if (!role) return "Пользователь";
    return ROLE_LABELS[role] ?? role;
}

export function isPrivilegedRole(role?: string | null): boolean {
    return ["admin", "manager", "ceo"].includes(role || "");
}