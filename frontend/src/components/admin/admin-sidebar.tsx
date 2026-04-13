"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    ListFilter,
    ShoppingBag,
    Tags,
    FileText,
    Settings,
    Users,
    FolderSync,
    ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";

type LinkItem = {
    type: "link";
    href: string;
    label: string;
    icon: LucideIcon;
};

type GroupChild = {
    href: string;
    label: string;
};

type GroupItem = {
    type: "group";
    key: string;
    label: string;
    icon: LucideIcon;
    children: GroupChild[];
};

type SidebarItem = LinkItem | GroupItem;

const items: SidebarItem[] = [
    { type: "link", href: "/admin", label: "Дашборд", icon: LayoutDashboard },
    { type: "link", href: "/admin/orders", label: "Заказы", icon: ShoppingBag },
    { type: "link", href: "/admin/brands", label: "Бренды", icon: Tags },
    { type: "link", href: "/admin/products", label: "Продукты", icon: ShoppingBag },
    { type: "link", href: "/admin/attributes", label: "Характеристики", icon: ListFilter },
    { type: "link", href: "#", label: "Страницы", icon: FileText },
    { type: "link", href: "#", label: "Футер", icon: Settings },

    {
        type: "group",
        key: "vanille",
        label: "Vanille",
        icon: FolderSync,
        children: [
            { href: "/admin/import-export/vanille-parsing", label: "Парсинг" },
            { href: "/admin/import-export/vanille-products", label: "Товары" },
        ],
    },

    { type: "link", href: "/admin/users", label: "Пользователи", icon: Users },
];

type Props = {
    onNavigate?: () => void;
};

export default function AdminSidebar({ onNavigate }: Props) {
    const pathname = usePathname();

    const activeGroupKey = useMemo(() => {
        const activeGroup = items.find((item) => {
            if (item.type !== "group") {
                return false;
            }

            return item.children.some((child) => pathname.startsWith(child.href));
        });

        return activeGroup?.type === "group" ? activeGroup.key : null;
    }, [pathname]);

    const [openGroup, setOpenGroup] = useState<string | null>(activeGroupKey);

    useEffect(() => {
        setOpenGroup(activeGroupKey);
    }, [activeGroupKey]);

    const toggleGroup = (groupKey: string) => {
        setOpenGroup((current) => (current === groupKey ? null : groupKey));
    };

    return (
        <aside className="w-full rounded-2xl border bg-white p-4">
            <nav className="space-y-1">
                {items.map((item) => {
                    if (item.type === "link") {
                        const isActive =
                            pathname === item.href ||
                            (item.href !== "/admin" &&
                                item.href !== "#" &&
                                pathname.startsWith(item.href));

                        const Icon = item.icon;

                        return (
                            <Link
                                key={`${item.label}-${item.href}`}
                                href={item.href}
                                onClick={onNavigate}
                                className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200 ${
                                    isActive
                                        ? "bg-black text-white shadow-sm"
                                        : "text-gray-700 hover:bg-gray-100 hover:text-black"
                                }`}
                            >
                                <span
                                    className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-all ${
                                        isActive
                                            ? "bg-white/90"
                                            : "bg-transparent group-hover:bg-gray-300"
                                    }`}
                                />

                                <Icon
                                    size={18}
                                    className={`shrink-0 transition-transform duration-200 ${
                                        isActive ? "scale-105" : "group-hover:scale-105"
                                    }`}
                                />

                                <span className={isActive ? "font-medium" : "group-hover:font-medium"}>
                                    {item.label}
                                </span>
                            </Link>
                        );
                    }

                    const Icon = item.icon;
                    const isOpen = openGroup === item.key;
                    const isActive = item.children.some((child) => pathname.startsWith(child.href));

                    return (
                        <div key={item.key} className="space-y-1">
                            <button
                                type="button"
                                onClick={() => toggleGroup(item.key)}
                                className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200 ${
                                    isActive
                                        ? "bg-black text-white shadow-sm"
                                        : "text-gray-700 hover:bg-gray-100 hover:text-black"
                                }`}
                            >
                                <span
                                    className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-all ${
                                        isActive
                                            ? "bg-white/90"
                                            : "bg-transparent group-hover:bg-gray-300"
                                    }`}
                                />

                                <Icon
                                    size={18}
                                    className={`shrink-0 transition-transform duration-200 ${
                                        isActive ? "scale-105" : "group-hover:scale-105"
                                    }`}
                                />
                                <span className={`flex-1 text-left ${isActive ? "font-medium" : "group-hover:font-medium"}`}>
                                    {item.label}
                                </span>

                                <ChevronDown
                                    size={16}
                                    className={`transition-transform duration-200 ${
                                        isOpen ? "rotate-180" : ""
                                    }`}
                                />
                            </button>

                            {isOpen && (
                                <div className="ml-4 space-y-1 border-l pl-3">
                                    {item.children.map((child) => {
                                        const childActive = pathname === child.href;

                                        return (
                                            <Link
                                                key={child.href}
                                                href={child.href}
                                                onClick={onNavigate}
                                                className={`block rounded-lg px-3 py-2 text-sm transition ${
                                                    childActive
                                                        ? "bg-gray-900 text-white"
                                                        : "text-gray-600 hover:bg-gray-100 hover:text-black"
                                                }`}
                                            >
                                                {child.label}
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </nav>
        </aside>
    );
}
