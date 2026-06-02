"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPageCard from "@/components/admin/ui/admin-page-card";
import AdminLoadingState from "@/components/admin/ui/admin-loading-state";
import AdminEmptyState from "@/components/admin/ui/admin-empty-state";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import { writeToClipboard } from "@/components/ui/copy-text";
import {
    createIncomingCallDevice,
    deleteIncomingCallDevice,
    fetchIncomingCallDeviceManagers,
    fetchIncomingCallDevices,
    regenerateIncomingCallDeviceToken,
    updateIncomingCallDevice,
    type IncomingCallDevice,
    type IncomingCallDeviceManager,
} from "@/lib/admin-incoming-call-devices-api";
import { getRoleLabel } from "@/constants/admin-roles";
import { adminBtnPrimary, adminBtnSecondary } from "@/lib/admin-ui-classes";
import type { AdminToast } from "@/types/admin";

export default function AdminIncomingCallDevicesPage() {
    const [devices, setDevices] = useState<IncomingCallDevice[]>([]);
    const [managers, setManagers] = useState<IncomingCallDeviceManager[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<AdminToast | null>(null);
    const [tokenBanner, setTokenBanner] = useState<{
        token: string;
        label: string;
        deviceId: string;
    } | null>(null);
    const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
    const [label, setLabel] = useState("");
    const [managerUserId, setManagerUserId] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [devicesResponse, managersResponse] = await Promise.all([
                fetchIncomingCallDevices(),
                fetchIncomingCallDeviceManagers(),
            ]);
            setDevices(devicesResponse);
            setManagers(managersResponse);
            setManagerUserId((current) => current || (managersResponse[0] ? String(managersResponse[0].id) : ""));
        } catch (error) {
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка загрузки",
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const handleCreate = async () => {
        if (!label.trim() || !managerUserId) {
            setToast({ type: "error", message: "Укажите название и менеджера" });
            return;
        }

        setSaving(true);
        try {
            const result = await createIncomingCallDevice({
                label: label.trim(),
                manager_user_id: Number(managerUserId),
            });
            setTokenBanner({
                token: result.token,
                label: result.device.label,
                deviceId: result.device.id,
            });
            setLabel("");
            setToast({ type: "success", message: "Устройство создано. Скопируйте токен." });
            await load();
        } catch (error) {
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка создания",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (device: IncomingCallDevice) => {
        try {
            await updateIncomingCallDevice(device.id, { is_active: !device.is_active });
            await load();
        } catch (error) {
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка обновления",
            });
        }
    };

    const handleCopyToken = async (token: string) => {
        const ok = await writeToClipboard(token);
        setToast(
            ok
                ? { type: "success", message: "Токен скопирован" }
                : {
                      type: "error",
                      message: "Не удалось скопировать — выделите токен вручную",
                  },
        );
    };

    const handleRegenerateToken = async (device: IncomingCallDevice) => {
        if (
            !window.confirm(
                `Выпустить новый токен для «${device.label}»? Старый перестанет работать в приложении на телефоне.`,
            )
        ) {
            return;
        }

        setRegeneratingId(device.id);
        try {
            const result = await regenerateIncomingCallDeviceToken(device.id);
            setTokenBanner({
                token: result.token,
                label: result.device.label,
                deviceId: result.device.id,
            });
            setToast({ type: "success", message: "Новый токен выпущен. Скопируйте и вставьте в приложение." });
            await load();
        } catch (error) {
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка выпуска токена",
            });
        } finally {
            setRegeneratingId(null);
        }
    };

    const handleDelete = async (device: IncomingCallDevice) => {
        if (!window.confirm(`Удалить устройство «${device.label}»?`)) {
            return;
        }

        try {
            await deleteIncomingCallDevice(device.id);
            setTokenBanner((current) => (current?.deviceId === device.id ? null : current));
            setToast({ type: "success", message: "Устройство удалено" });
            await load();
        } catch (error) {
            setToast({
                type: "error",
                message: error instanceof Error ? error.message : "Ошибка удаления",
            });
        }
    };

    return (
        <AdminPageCard>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">Телефоны для CRM</h1>
                <p className="mt-1 text-sm text-admin-text-secondary">
                    Создайте токен для каждого Android-телефона. Перевод в CRM выполняется вручную из приложения.
                </p>
            </div>

            <div className="mb-6 grid gap-3 rounded-xl border border-admin-border bg-admin-surface p-4 md:grid-cols-[1fr_220px_auto]">
                <input
                    type="text"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Название (SIM 1, Рабочий...)"
                    className="rounded-lg border border-admin-border px-3 py-2 text-sm"
                />
                <select
                    value={managerUserId}
                    onChange={(event) => setManagerUserId(event.target.value)}
                    disabled={managers.length === 0}
                    className="rounded-lg border border-admin-border px-3 py-2 text-sm disabled:opacity-60"
                >
                    {managers.length === 0 ? (
                        <option value="">Нет менеджеров</option>
                    ) : (
                        managers.map((manager) => (
                            <option key={manager.id} value={manager.id}>
                                {[manager.name, manager.phone, `#${manager.id}`]
                                    .find((part) => part && String(part).trim() !== "")}{" "}
                                ({getRoleLabel(manager.role)})
                            </option>
                        ))
                    )}
                </select>
                <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={saving || managers.length === 0}
                    className={adminBtnPrimary}
                >
                    {saving ? "Создание..." : "Создать устройство"}
                </button>
            </div>

            {managers.length === 0 && !loading ? (
                <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    Нет пользователей с ролью <strong>Менеджер</strong>, <strong>Админ</strong> или{" "}
                    <strong>CEO</strong>. Откройте{" "}
                    <a href="/admin/users" className="font-medium underline">
                        Пользователи
                    </a>
                    , выберите нужного человека и смените роль (или создайте нового сотрудника).
                </p>
            ) : null}

            {tokenBanner ? (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-medium">
                        Токен для «{tokenBanner.label}» — сохраните в приложение на телефоне
                    </p>
                    <p className="mt-1 text-xs text-amber-800/90">
                        После закрытия блока токен на сервере не показывается. Можно нажать «Скопировать»
                        сколько угодно раз или «Новый токен» в таблице.
                    </p>
                    <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-xs">
                        {tokenBanner.token}
                    </code>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={adminBtnSecondary}
                            onClick={() => void handleCopyToken(tokenBanner.token)}
                        >
                            Скопировать
                        </button>
                        <button
                            type="button"
                            className={adminBtnSecondary}
                            onClick={() => setTokenBanner(null)}
                        >
                            Скрыть
                        </button>
                    </div>
                </div>
            ) : null}

            {loading ? (
                <AdminLoadingState label="Загрузка устройств..." />
            ) : devices.length === 0 ? (
                <AdminEmptyState title="Устройств пока нет" />
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-admin-border text-left text-admin-text-secondary">
                                <th className="px-3 py-2">Название</th>
                                <th className="px-3 py-2">Менеджер</th>
                                <th className="px-3 py-2">Статус</th>
                                <th className="px-3 py-2">Последний перевод</th>
                                <th className="px-3 py-2">Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {devices.map((device) => (
                                <tr key={device.id} className="border-b border-admin-border/70">
                                    <td className="px-3 py-2 font-medium">{device.label}</td>
                                    <td className="px-3 py-2">
                                        {device.manager?.name || device.manager?.phone || "—"}
                                    </td>
                                    <td className="px-3 py-2">
                                        {device.is_active ? "Активно" : "Выключено"}
                                    </td>
                                    <td className="px-3 py-2">
                                        {device.last_seen_at
                                            ? new Date(device.last_seen_at).toLocaleString("ru-RU")
                                            : "—"}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                className={adminBtnSecondary}
                                                disabled={regeneratingId === device.id}
                                                onClick={() => void handleRegenerateToken(device)}
                                            >
                                                {regeneratingId === device.id
                                                    ? "Выпуск..."
                                                    : "Новый токен"}
                                            </button>
                                            <button
                                                type="button"
                                                className={adminBtnSecondary}
                                                onClick={() => void handleToggleActive(device)}
                                            >
                                                {device.is_active ? "Выключить" : "Включить"}
                                            </button>
                                            <button
                                                type="button"
                                                className={adminBtnSecondary}
                                                onClick={() => void handleDelete(device)}
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {toast ? (
                <AdminFeedbackMessage
                    type={toast.type}
                    message={toast.message}
                    onCloseAction={() => setToast(null)}
                />
            ) : null}
        </AdminPageCard>
    );
}
