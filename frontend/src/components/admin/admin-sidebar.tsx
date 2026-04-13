"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    ListFilter,
    Package,
    Tags,
    ShieldUser,
    FolderSync,
    ChevronDown,
    ShoppingCart,
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

type SidebarSection = {
    key: string;
    label: string;
    items: SidebarItem[];
};

const sections: SidebarSection[] = [
    {
        key: "main",
        label: "Основное",
        items: [
            { type: "link", href: "/admin", label: "Дашборд", icon: LayoutDashboard },
            { type: "link", href: "/admin/orders", label: "Заказы", icon: ShoppingCart },
        ],
    },
    {
        key: "catalog",
        label: "Каталог",
        items: [
            { type: "link", href: "/admin/brands", label: "Бренды", icon: Tags },
            { type: "link", href: "/admin/products", label: "Продукты", icon: Package },
            { type: "link", href: "/admin/attributes", label: "Атрибуты", icon: ListFilter },
        ],
    },
    {
        key: "imports",
        label: "Импорт и парсинг",
        items: [
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
        ],
    },
    {
        key: "system",
        label: "Система",
        items: [
            { type: "link", href: "/admin/users", label: "Пользователи", icon: ShieldUser },
        ],
    },
];

type Props = {
    onNavigate?: () => void;
    collapsed?: boolean;
};

function Tooltip({ label, collapsed }: { label: string; collapsed: boolean }) {
    if (!collapsed) {
        return null;
    }

    return (
        <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 hidden -translate-y-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg group-hover:block">
            {label}
        </span>
    );
}

export default function AdminSidebar({ onNavigate, collapsed = false }: Props) {
    const pathname = usePathname();

    const flatItems = useMemo(() => sections.flatMap((section) => section.items), []);

    const activeGroupKey = useMemo(() => {
        const activeGroup = flatItems.find((item) => {
            if (item.type !== "group") {
                return false;
            }

            return item.children.some((child) => pathname.startsWith(child.href));
        });

        return activeGroup?.type === "group" ? activeGroup.key : null;
    }, [flatItems, pathname]);

    const [openGroup, setOpenGroup] = useState<string | null>(activeGroupKey);

    useEffect(() => {
        setOpenGroup(activeGroupKey);
    }, [activeGroupKey]);

    const toggleGroup = (groupKey: string) => {
        setOpenGroup((current) => (current === groupKey ? null : groupKey));
    };

    return (
        <aside className="w-full rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <nav className="space-y-5">
                {sections
                    .filter((section) => section.items.length > 0)
                    .map((section) => (
                        <div key={section.key} className="space-y-2">
                            {!collapsed ? (
                                <div className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                                    {section.label}
                                </div>
                            ) : null}

                            <div className="space-y-1 rounded-2xl border border-gray-100 bg-gray-50/70 p-1.5">
                                {section.items.map((item) => {
                                    if (item.type === "link") {
                                        const isActive =
                                            pathname === item.href ||
                                            (item.href !== "/admin" && pathname.startsWith(item.href));

                                        const Icon = item.icon;

                                        return (
                                            <Link
                                                key={`${section.key}-${item.label}-${item.href}`}
                                                href={item.href}
                                                onClick={onNavigate}
                                                className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200 ${
                                                    isActive
                                                        ? "bg-black text-white shadow-sm"
                                                        : "text-gray-700 hover:bg-white hover:text-black"
                                                } ${collapsed ? "justify-center px-3" : ""}`}
                                            >
                                                <span
                                                    className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-all ${
                                                        isActive
                                                            ? "bg-white/90"
                                                            : "bg-transparent group-hover:bg-gray-300"
                                                    }`}
                                                />

                                                <span
                                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                                                        isActive
                                                            ? "bg-white/10"
                                                            : "bg-white text-gray-500 group-hover:text-black"
                                                    }`}
                                                >
                                                    <Icon
                                                        size={17}
                                                        className={`transition-transform duration-200 ${
                                                            isActive ? "scale-105" : "group-hover:scale-105"
                                                        }`}
                                                    />
                                                </span>

                                                {!collapsed ? (
                                                    <span className={isActive ? "font-medium" : "group-hover:font-medium"}>
                                                        {item.label}
                                                    </span>
                                                ) : null}

                                                <Tooltip label={item.label} collapsed={collapsed} />
                                            </Link>
                                        );
                                    }

                                    const Icon = item.icon;
                                    const isOpen = openGroup === item.key;
                                    const isActive = item.children.some((child) => pathname.startsWith(child.href));

                                    return (
                                        <div key={`${section.key}-${item.key}`} className="space-y-1">
                                            <button
                                                type="button"
                                                onClick={() => toggleGroup(item.key)}
                                                className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all duration-200 ${
                                                    isActive
                                                        ? "bg-black text-white shadow-sm"
                                                        : "text-gray-700 hover:bg-white hover:text-black"
                                                } ${collapsed ? "justify-center px-3" : ""}`}
                                            >
                                                <span
                                                    className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-all ${
                                                        isActive
                                                            ? "bg-white/90"
                                                            : "bg-transparent group-hover:bg-gray-300"
                                                    }`}
                                                />

                                                <span
                                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                                                        isActive
                                                            ? "bg-white/10"
                                                            : "bg-white text-gray-500 group-hover:text-black"
                                                    }`}
                                                >
                                                    <Icon
                                                        size={17}
                                                        className={`transition-transform duration-200 ${
                                                            isActive ? "scale-105" : "group-hover:scale-105"
                                                        }`}
                                                    />
                                                </span>

                                                {!collapsed ? (
                                                    <>
                                                        <span className={`flex-1 text-left ${isActive ? "font-medium" : "group-hover:font-medium"}`}>
                                                            {item.label}
                                                        </span>

                                                        <ChevronDown
                                                            size={16}
                                                            className={`transition-transform duration-200 ${
                                                                isOpen ? "rotate-180" : ""
                                                            }`}
                                                        />
                                                    </>
                                                ) : null}

                                                <Tooltip label={item.label} collapsed={collapsed} />
                                            </button>

                                            {isOpen && !collapsed ? (
                                                <div className="ml-5 space-y-1 border-l border-gray-200 pl-3">
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
                                                                        : "text-gray-600 hover:bg-white hover:text-black"
                                                                }`}
                                                            >
                                                                {child.label}
                                                            </Link>
                                                        );
                                                    })}
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
            </nav>
        </aside>
    );
}
