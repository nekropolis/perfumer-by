"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    ShoppingBag,
    Tags,
    FileText,
    Settings,
    Users,
} from "lucide-react";

const items = [
    { href: "/admin", label: "Дашборд", icon: LayoutDashboard },
    { href: "/admin/orders", label: "Заказы", icon: ShoppingBag },
    { href: "#", label: "Бренды", icon: Tags },
    { href: "#", label: "Страницы", icon: FileText },
    { href: "#", label: "Футер", icon: Settings },
    { href: "/admin/users", label: "Пользователи", icon: Users },
];

type Props = {
    onNavigate?: () => void;
};

export default function AdminSidebar({ onNavigate }: Props) {
    const pathname = usePathname();

    return (
        <aside className="w-full rounded-2xl border bg-white p-4">
            <nav className="space-y-1">
                {items.map((item) => {
                    const isActive =
                        pathname === item.href ||
                        (item.href !== "/admin" && pathname.startsWith(item.href));

                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
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
                      isActive ? "bg-white/90" : "bg-transparent group-hover:bg-gray-300"
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
                })}
            </nav>
        </aside>
    );
}