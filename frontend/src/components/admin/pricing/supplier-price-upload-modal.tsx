"use client";

import { useEffect, useState } from "react";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import { uploadSupplierPriceFile, type SupplierPriceFileMeta } from "@/lib/admin-pricing-api";

type Props = {
    open: boolean;
    suppliers: SupplierPriceFileMeta[];
    onCloseAction: () => void;
    onUploadedAction: () => void | Promise<void>;
};

export default function SupplierPriceUploadModal({
    open,
    suppliers,
    onCloseAction,
    onUploadedAction,
}: Props) {
    const [supplierId, setSupplierId] = useState<number | "">("");
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) {
            setFile(null);
            setError("");
            return;
        }
        if (supplierId === "" && suppliers.length > 0) {
            setSupplierId(suppliers[0].supplier_id);
        }
    }, [open, suppliers, supplierId]);

    const handleUpload = async () => {
        if (!file || supplierId === "") {
            setError("Выберите поставщика и файл");
            return;
        }
        setUploading(true);
        setError("");
        try {
            await uploadSupplierPriceFile(supplierId, file);
            setFile(null);
            await onUploadedAction();
            onCloseAction();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Ошибка загрузки");
        } finally {
            setUploading(false);
        }
    };

    return (
        <AdminModalShell
            open={open}
            onCloseAction={onCloseAction}
            title="Загрузить прайс"
            maxWidthClass="sm:max-w-md"
            footer={
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        className="rounded-lg border px-4 py-2 text-sm"
                        onClick={onCloseAction}
                        disabled={uploading}
                    >
                        Отмена
                    </button>
                    <button
                        type="button"
                        className="rounded-lg border bg-admin-primary px-4 py-2 text-sm text-white disabled:opacity-50"
                        onClick={() => void handleUpload()}
                        disabled={uploading || !file || supplierId === ""}
                    >
                        {uploading ? "Загрузка..." : "Загрузить"}
                    </button>
                </div>
            }
        >
            <div className="space-y-4">
                {error ? <AdminFeedbackMessage type="error" message={error} onCloseAction={() => setError("")} /> : null}

                <p className="text-xs text-admin-text-secondary">
                    Формат: XLS или XLSX. Колонки — код, название, цена (первая строка с «код» может быть заголовком).
                </p>

                <label className="block space-y-1 text-sm">
                    <span className="text-admin-text-secondary">Поставщик</span>
                    <select
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                        {suppliers.map((item) => (
                            <option key={item.supplier_id} value={item.supplier_id}>
                                {item.supplier_name}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm transition hover:bg-admin-muted/50">
                    <span className="truncate text-admin-text-secondary">
                        {file ? file.name : "Выбрать файл XLS / XLSX"}
                    </span>
                    <input
                        type="file"
                        accept=".xls,.xlsx"
                        className="sr-only"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                </label>
            </div>
        </AdminModalShell>
    );
}
