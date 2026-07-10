export type ActorType = "client" | "staff";

export const ADMIN_ROLES = ["admin", "ceo", "manager"] as const;
export const ROLE_LABELS: Record<string, string> = {
    admin: "Админ",
    manager: "Менеджер",
    ceo: "CEO",
};

export function isStaffUser(user?: { actor_type?: ActorType | null } | null): boolean {
    return user?.actor_type === "staff";
}

export function isClientUser(user?: { actor_type?: ActorType | null } | null): boolean {
    return user?.actor_type === "client";
}

export function isAdminRole(user?: { actor_type?: ActorType | null; role?: string | null } | null): boolean {
    return isStaffUser(user) && !!user?.role && ADMIN_ROLES.includes(user.role as (typeof ADMIN_ROLES)[number]);
}

export function getRoleLabel(role?: string) {
    if (!role) return "Пользователь";
    return ROLE_LABELS[role] ?? role;
}

export function isPrivilegedRole(user?: { actor_type?: ActorType | null; role?: string | null } | null): boolean {
    return isAdminRole(user);
}