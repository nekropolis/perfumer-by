"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import { useAuth } from "@/components/auth/auth-provider";
import { isAdminRole } from "@/constants/admin-roles";
import { getAuthToken } from "@/lib/auth-token";
import {
    disconnectAdminEcho,
    getAdminEcho,
    type SendToCrmEventPayload,
} from "@/lib/echo";

function buildCreateOrderHref(phone: string, customerName?: string | null): string {
    const params = new URLSearchParams();
    params.set("phone", phone);
    const name = customerName?.trim();
    if (name) {
        params.set("name", name);
    }
    return `/admin/orders/create?${params.toString()}`;
}

function formatToastMessage(payload: SendToCrmEventPayload): string {
    const parts = [`Открываем заказ: ${payload.phone}`];
    if (payload.customer_name) {
        parts.push(payload.customer_name);
    }
    const total =
        payload.orders.completed + payload.orders.active + payload.orders.cancelled;
    if (total > 0) {
        parts.push(`заказов: ${total}`);
    }
    if (payload.device_label) {
        parts.push(`(${payload.device_label})`);
    }
    return parts.join(" · ");
}

export default function IncomingCallListener() {
    const router = useRouter();
    const { user } = useAuth();
    const [toast, setToast] = useState<string | null>(null);
    const lastHandledRef = useRef<{ phone: string; at: number } | null>(null);

    useEffect(() => {
        if (!user || !isAdminRole(user.role)) {
            disconnectAdminEcho();
            return;
        }

        const token = getAuthToken();
        if (!token) {
            return;
        }

        const echo = getAdminEcho(token);
        if (!echo) {
            return;
        }

        const channelName = `manager.${user.id}.incoming-calls`;
        const channel = echo.private(channelName);

        const handler = (payload: SendToCrmEventPayload) => {
            if (payload.trigger !== "manual" || !payload.phone) {
                return;
            }

            const now = Date.now();
            const last = lastHandledRef.current;
            if (last && last.phone === payload.phone && now - last.at < 5000) {
                return;
            }
            lastHandledRef.current = { phone: payload.phone, at: now };

            setToast(formatToastMessage(payload));
            router.push(
                buildCreateOrderHref(payload.phone, payload.customer_name ?? payload.matched_user?.name),
            );
        };

        channel.listen(".SendToCrmEvent", handler);

        return () => {
            channel.stopListening(".SendToCrmEvent");
            echo.leave(channelName);
        };
    }, [router, user]);

    if (!toast) {
        return null;
    }

    return (
        <AdminFeedbackMessage
            type="success"
            message={toast}
            onCloseAction={() => setToast(null)}
            duration={6000}
        />
    );
}
