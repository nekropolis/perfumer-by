"use client";

import { useEffect, useState } from "react";
import AdminModalShell from "@/components/admin/ui/admin-modal-shell";
import AdminStatusDropdown from "@/components/admin/ui/admin-status-dropdown";
import {
    PRICE_PARSE_SUPPLIERS,
    SELLER_ONE_FILE_ACCEPT,
    type PriceParseSupplierCode,
} from "@/components/admin/import-export/seller-one/constants";

type Props = {
    open: boolean;
    initialSupplierCode: PriceParseSupplierCode | null;
    initialFile: File | null;
    onCloseAction: () => void;
    onConfirmAction: (file: File, supplierCode: PriceParseSupplierCode) => void;
};

export default function ParseFileModal({
    open,
    initialSupplierCode,
    initialFile,
    onCloseAction,
    onConfirmAction,
}: Props) {
    const [supplierCode, setSupplierCode] = useState<PriceParseSupplierCode>(
        initialSupplierCode ?? PRICE_PARSE_SUPPLIERS[0].code,
    );
    const [file, setFile] = useState<File | null>(initialFile);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) {
            return;
        }
        setSupplierCode(initialSupplierCode ?? PRICE_PARSE_SUPPLIERS[0].code);
        setFile(initialFile);
        setError("");
    }, [open, initialSupplierCode, initialFile]);

    const handleConfirm = () => {
        if (!file) {
            setError("Выбери xls/xlsx файл");
            return;
        }
        onConfirmAction(file, supplierCode);
    };

    return (
        <AdminModalShell
            open={open}
            onCloseAction={onCloseAction}
            title="Новый парсинг"
            maxWidthClass="sm:max-w-md"
            footer={
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        className="rounded-lg border px-4 py-2 text-sm"
                        onClick={onCloseAction}
                    >
                        Отмена
                    </button>
                    <button
                        type="button"
                        className="rounded-lg border bg-admin-primary px-4 py-2 text-sm text-white disabled:opacity-50"
                        onClick={handleConfirm}
                        disabled={!file}
                    >
                        Готово
                    </button>
                </div>
            }
        >
            <div className="space-y-4">
                {error ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        {error}
                    </p>
                ) : null}

                <div className="space-y-1">
                    <span className="block text-sm text-admin-text-secondary">Поставщик</span>
                    <AdminStatusDropdown
                        value={supplierCode}
                        onChangeAction={(value) => setSupplierCode(value as PriceParseSupplierCode)}
                        options={PRICE_PARSE_SUPPLIERS.map((s) => ({
                            value: s.code,
                            label: s.name,
                        }))}
                        widthClassName="w-full"
                        menuWidthClassName="w-max"
                    />
                </div>

                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm transition hover:bg-admin-muted/50">
                    <span className="truncate text-admin-text-secondary">
                        {file ? file.name : "Выбрать файл XLS / XLSX"}
                    </span>
                    <input
                        type="file"
                        accept={SELLER_ONE_FILE_ACCEPT}
                        className="sr-only"
                        onChange={(e) => {
                            setFile(e.target.files?.[0] || null);
                            setError("");
                            e.target.value = "";
                        }}
                    />
                </label>
            </div>
        </AdminModalShell>
    );
}
