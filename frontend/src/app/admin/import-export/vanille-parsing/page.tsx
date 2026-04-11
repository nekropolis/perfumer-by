"use client";

import {ChangeEvent, useState} from "react";

export default function VanilleParsingPage() {
    const [file, setFile] = useState<File | null>(null);
    const [uploadPath, setUploadPath] = useState("");
    const [uploading, setUploading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<any>(null);
    const [parsingBrands, setParsingBrands] = useState(false);
    const [collectingLinks, setCollectingLinks] = useState(false);
    const [parsingProducts, setParsingProducts] = useState(false);


    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files && e.target.files[0] ? e.target.files[0] : null;
        setFile(selectedFile);
    };

    const handleUpload = async () => {
        if (!file) {
            setError("Выбери JSON файл");
            return;
        }

        setUploading(true);
        setError("");
        setResult(null);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/catalog/admin/import-export/vanille/upload", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Ошибка загрузки файла");
            }

            setUploadPath(data.path || "");
            setResult(data);
        } catch (e: any) {
            setError(e?.message || "Ошибка загрузки");
        } finally {
            setUploading(false);
        }
    };

    const handleParseBrands = async () => {
        setParsingBrands(true);
        setError("");
        setResult(null);

        try {
            const response = await fetch("/api/catalog/admin/import-export/vanille/parse-brands", {
                method: "POST",
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Ошибка парсинга брендов");
            }

            setResult(data);
        } catch (e: any) {
            setError(e?.message || "Ошибка парсинга брендов");
        } finally {
            setParsingBrands(false);
        }
    };

    const handleCollectLinks = async () => {
        setCollectingLinks(true);
        setError("");
        setResult(null);

        try {
            let offset = 0;
            const limit = 20;
            const maxLinks = 100;
            let done = false;
            let finalData: any = null;
            const combinedLog: string[] = [];

            while (!done) {
                const response = await fetch("/api/catalog/admin/import-export/vanille/collect-links", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ offset, limit, max_links: maxLinks }),
                });

                const text = await response.text();

                let data: any;
                try {
                    data = JSON.parse(text);
                } catch {
                    throw new Error(text || "Сервер вернул не JSON");
                }

                if (!response.ok) {
                    throw new Error(data.message || "Ошибка сбора ссылок");
                }

                if (Array.isArray(data.log)) {
                    combinedLog.push(...data.log);
                }

                finalData = {
                    ...data,
                    log: combinedLog,
                };

                done = !!data.done;
                offset = data.next_offset ?? offset + limit;
            }

            setResult(finalData);
        } catch (e: any) {
            setError(e?.message || "Ошибка сбора ссылок");
        } finally {
            setCollectingLinks(false);
        }
    };

    const handleParseProducts = async () => {
        setParsingProducts(true);
        setError("");
        setResult(null);

        try {
            let offset = 0;
            const limit = 20;
            const maxLinks = 100;
            let done = false;
            let finalData: any = null;
            const combinedLog: string[] = [];

            while (!done) {
                const response = await fetch("/api/catalog/admin/import-export/vanille/parse-products", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ offset, limit, max_links: maxLinks }),
                });
                const text = await response.text();

                let data: any;
                try {
                    data = JSON.parse(text);
                } catch {
                    throw new Error(text || "Сервер вернул не JSON");
                }

                if (!response.ok) {
                    throw new Error(data.message || "Ошибка массового парсинга карточек");
                }

                if (Array.isArray(data.log)) {
                    combinedLog.push(...data.log);
                }

                finalData = {
                    ...data,
                    log: combinedLog,
                };

                done = !!data.done;
                offset = data.next_offset ?? offset + limit;
            }

            setResult(finalData);
        } catch (e: any) {
            setError(e?.message || "Ошибка массового парсинга карточек");
        } finally {
            setParsingProducts(false);
        }
    };

    const handleImport = async () => {
        if (!uploadPath) {
            setError("Сначала загрузи JSON файл");
            return;
        }

        setImporting(true);
        setError("");
        setResult(null);

        try {
            const response = await fetch("/api/catalog/admin/import-export/vanille/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({path: uploadPath}),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Ошибка импорта");
            }

            setResult(data);
        } catch (e: any) {
            setError(e?.message || "Ошибка импорта");
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold">Vanille Parsing</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Загрузка JSON файла и массовый импорт товаров vanille.by
                </p>
            </div>

            <div className="rounded-2xl border bg-white p-6 space-y-4">
                <div>
                    <label className="mb-2 block text-sm font-medium">JSON файл</label>
                    <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileChange}
                        className="block w-full rounded-xl border px-3 py-2 text-sm"
                    />
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                        {uploading ? "Загрузка..." : "Загрузить файл"}
                    </button>

                    <button
                        type="button"
                        onClick={handleParseBrands}
                        disabled={parsingBrands}
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {parsingBrands ? "Парсинг..." : "Парсинг брендов"}
                    </button>

                    <button
                        type="button"
                        onClick={handleCollectLinks}
                        disabled={collectingLinks}
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {collectingLinks ? "Сбор..." : "Сбор ссылок товаров"}
                    </button>

                    <button
                        type="button"
                        onClick={handleParseProducts}
                        disabled={parsingProducts}
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {parsingProducts ? "Парсинг..." : "Массовый парсинг карточек"}
                    </button>

                    <button
                        type="button"
                        onClick={handleImport}
                        disabled={!uploadPath || importing}
                        className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                    >
                        {importing ? "Импорт..." : "Массовый импорт"}
                    </button>
                </div>

                {uploadPath ? (
                    <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
                        <span className="font-medium">Путь к файлу:</span> {uploadPath}
                    </div>
                ) : null}

                {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                ) : null}

                {result ? (
                    <div className="rounded-2xl border bg-gray-50 p-4 space-y-4">
                        <div className="text-sm font-medium">Результат</div>

                        {result.message ? (
                            <div className="text-sm text-gray-700">{result.message}</div>
                        ) : null}

                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <div className="rounded-xl border bg-white p-3 text-sm">
                                <div className="text-gray-500">Imported</div>
                                <div className="text-lg font-semibold">{result.imported || 0}</div>
                            </div>

                            <div className="rounded-xl border bg-white p-3 text-sm">
                                <div className="text-gray-500">Updated</div>
                                <div className="text-lg font-semibold">{result.updated || 0}</div>
                            </div>

                            <div className="rounded-xl border bg-white p-3 text-sm">
                                <div className="text-gray-500">Errors</div>
                                <div className="text-lg font-semibold">{result.errors || 0}</div>
                            </div>

                            <div className="rounded-xl border bg-white p-3 text-sm">
                                <div className="text-gray-500">Items</div>
                                <div className="text-lg font-semibold">{result.items || 0}</div>
                            </div>
                        </div>

                        {Array.isArray(result.log) && result.log.length > 0 ? (
                            <div className="rounded-xl border bg-white p-3">
                                <div className="mb-2 text-sm font-medium">Лог
                                </div>
                                <div className="space-y-1 text-sm text-gray-700">
                                    {result.log.map((line: string, index: number) => (
                                        <div key={index}>{line}</div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
