"use client";

import { useEffect, useMemo, useState } from "react";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import AdminFeedbackMessage from "@/components/admin/ui/admin-feedback-message";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
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

    const supplierOptions = useMemo(
        () =>
            suppliers.map((item) => ({
                value: String(item.supplier_id),
                label: item.supplier_name,
            })),
        [suppliers],
    );

    useEffect(() => {
        if (!open) {
            setFile(null);
            setError("");
            return;
        }
        if (supplierId === "" && suppliers.length > 0) {
            setSupplierId(suppliers[0].supplier_id);
            return;
        }
        if (
            supplierId !== "" &&
            suppliers.length > 0 &&
            !suppliers.some((item) => item.supplier_id === supplierId)
        ) {
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

                <div className="space-y-1">
                    <span className="block text-sm text-admin-text-secondary">Поставщик</span>
                    <AdminStatusDropdown
                        value={supplierId === "" ? "" : String(supplierId)}
                        onChangeAction={(value) => setSupplierId(value ? Number(value) : "")}
                        options={supplierOptions}
                        widthClassName="w-full"
                        menuWidthClassName="w-max"
                        disabled={uploading || supplierOptions.length === 0}
                    />
                </div>

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
