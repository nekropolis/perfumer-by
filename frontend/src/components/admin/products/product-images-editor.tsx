"use client";

import Image from "next/image";
import { useMemo, useRef, useState, type DragEvent } from "react";
import {
    deleteProductImage,
    reorderProductImages,
    setMainProductImage,
    updateProductImageUsageType,
    uploadProductImages,
} from "@/lib/admin-product-images-api";
import {
    normalizeProductImageUrl,
    optimizeImageForSeo,
    type ProductImageItem,
} from "@/lib/admin-product-images-utils";

type Props = {
    productId: number;
    images: ProductImageItem[];
    onImagesChangedAction: (images: ProductImageItem[]) => void;
};


export default function ProductImagesEditor({ productId, images, onImagesChangedAction }: Props) {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [processingSeo, setProcessingSeo] = useState(false);
    const [busyImageId, setBusyImageId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [draggedImageId, setDraggedImageId] = useState<number | null>(null);
    const [uploadUsageType, setUploadUsageType] = useState<"gallery" | "catalog">("gallery");
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const sortedImages = useMemo(() => {
        return [...images].sort((a, b) => {
            const orderA = Number(a.sort_order ?? 0);
            const orderB = Number(b.sort_order ?? 0);
            if (orderA === orderB) {
                return a.id - b.id;
            }
            return orderA - orderB;
        });
    }, [images]);

    const catalogCount = useMemo(
        () => sortedImages.filter((i) => i.usage_type === "catalog").length,
        [sortedImages]
    );

    const refreshFromPayload = (payload: { data: ProductImageItem[] }) => {
        onImagesChangedAction(payload.data || []);
    };

    const processAndUpload = async (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) {
            return;
        }

        setError("");
        setProcessingSeo(true);
        setUploading(true);

        try {
            const rawFiles = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
            if (rawFiles.length === 0) {
                throw new Error("Выберите изображения в формате JPG, PNG или WEBP");
            }

            const optimized = await Promise.all(rawFiles.map((file) => optimizeImageForSeo(file)));
            const response = await uploadProductImages(productId, optimized, {
                usage_type: uploadUsageType,
            });
            refreshFromPayload(response);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось загрузить изображения");
        } finally {
            setProcessingSeo(false);
            setUploading(false);
        }
    };

    const handleChooseFiles = () => {
        fileInputRef.current?.click();
    };

    const handleDropZoneDragOver = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDraggingOver(true);
    };

    const handleDropZoneDragLeave = () => {
        setIsDraggingOver(false);
    };

    const handleDropZoneDrop = async (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setIsDraggingOver(false);
        await processAndUpload(event.dataTransfer.files);
    };

    const handleSetMain = async (imageId: number) => {
        setBusyImageId(imageId);
        setError("");
        try {
            const response = await setMainProductImage(productId, imageId);
            refreshFromPayload(response);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось задать главное изображение");
        } finally {
            setBusyImageId(null);
        }
    };

    const handleUsageTypeChange = async (imageId: number, usageType: "gallery" | "catalog") => {
        setBusyImageId(imageId);
        setError("");
        try {
            const response = await updateProductImageUsageType(productId, imageId, usageType);
            refreshFromPayload(response);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось обновить тип изображения");
        } finally {
            setBusyImageId(null);
        }
    };

    const handleDelete = async (imageId: number) => {
        setBusyImageId(imageId);
        setError("");
        try {
            const response = await deleteProductImage(productId, imageId);
            refreshFromPayload(response);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось удалить изображение");
        } finally {
            setBusyImageId(null);
        }
    };

    const handleCardDragStart = (imageId: number) => {
        setDraggedImageId(imageId);
    };

    const handleCardDrop = async (targetImageId: number) => {
        if (!draggedImageId || draggedImageId === targetImageId) {
            return;
        }

        const sourceIndex = sortedImages.findIndex((item) => item.id === draggedImageId);
        const targetIndex = sortedImages.findIndex((item) => item.id === targetImageId);
        if (sourceIndex < 0 || targetIndex < 0) {
            return;
        }

        const next = [...sortedImages];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, moved);
        const nextIds = next.map((item) => item.id);

        setError("");
        try {
            const response = await reorderProductImages(productId, nextIds);
            refreshFromPayload(response);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Не удалось сохранить сортировку");
        } finally {
            setDraggedImageId(null);
        }
    };

    return (
        <div className="space-y-4 rounded-2xl border bg-white p-5">
            <div
                onDragOver={handleDropZoneDragOver}
                onDragLeave={handleDropZoneDragLeave}
                onDrop={handleDropZoneDrop}
                className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${isDraggingOver ? "border-black bg-gray-50" : "border-gray-300"
                    }`}
            >
                <div className="text-sm text-gray-700">
                    Перетащите изображения сюда или загрузите через кнопку
                </div>
                <div className="mt-1 text-xs text-gray-500">
                    Перед загрузкой изображения автоматически сжимаются в SEO-friendly WEBP (до 1600px)
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm">
                    <span className="text-gray-600">Тип загрузки:</span>
                    <select
                        value={uploadUsageType}
                        onChange={(e) => setUploadUsageType(e.target.value as "gallery" | "catalog")}
                        disabled={uploading || processingSeo}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm"
                    >
                        <option value="gallery">Галерея</option>
                        <option value="catalog" disabled={catalogCount >= 2}>
                            Каталог (макс. 2)
                        </option>
                    </select>
                </div>

                <button
                    type="button"
                    onClick={handleChooseFiles}
                    disabled={uploading || processingSeo}
                    className="mt-4 rounded-xl border px-4 py-2 text-sm disabled:opacity-50"
                >
                    {processingSeo ? "Оптимизируем..." : uploading ? "Загружаем..." : "Выбрать изображения"}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                        void processAndUpload(event.target.files);
                        event.currentTarget.value = "";
                    }}
                />
            </div>

            {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            <div className="text-xs text-gray-600">
                Каталожные изображения для листинга / hover:{" "}
                <span className="font-medium">
                    {catalogCount}/2
                </span>
            </div>

            {sortedImages.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-600">
                    Картинки пока не загружены.
                </div>
            ) : (
                <div className="space-y-2">
                    {sortedImages.map((image, index) => {
                        const imageUrl = normalizeProductImageUrl(image.path);
                        const imageIsRemote = imageUrl.startsWith("http://") || imageUrl.startsWith("https://");
                        const isBusy = busyImageId === image.id;

                        return (
                            <div
                                key={image.id}
                                draggable
                                onDragStart={() => handleCardDragStart(image.id)}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={() => void handleCardDrop(image.id)}
                                className={`grid cursor-grab grid-cols-[84px_1fr_auto] items-center gap-3 rounded-xl border p-2 active:cursor-grabbing ${draggedImageId === image.id ? "opacity-60" : ""
                                    }`}
                            >
                                <div className="relative h-20 w-20 overflow-hidden rounded-lg border bg-gray-50">
                                    <Image
                                        src={imageUrl}
                                        alt={`Изображение ${index + 1}`}
                                        fill
                                        className="object-cover"
                                        sizes="80px"
                                        unoptimized={imageIsRemote}
                                    />
                                </div>

                                <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-gray-800">
                                        #{index + 1} {image.is_main ? "• Главная" : ""}{" "}
                                        {image.usage_type === "catalog" ? "• Каталог" : ""}
                                    </div>
                                    <div className="truncate text-xs text-gray-500">{image.path}</div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span className="text-xs text-gray-600">Тип:</span>
                                        <select
                                            value={image.usage_type === "catalog" ? "catalog" : "gallery"}
                                            disabled={isBusy}
                                            onChange={(e) => {
                                                const v = e.target.value as "gallery" | "catalog";
                                                if (v === (image.usage_type === "catalog" ? "catalog" : "gallery")) {
                                                    return;
                                                }
                                                if (
                                                    v === "catalog" &&
                                                    catalogCount >= 2 &&
                                                    image.usage_type !== "catalog"
                                                ) {
                                                    setError("Каталожных изображений может быть не более двух.");
                                                    return;
                                                }
                                                void handleUsageTypeChange(image.id, v);
                                            }}
                                            className="rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                                        >
                                            <option value="gallery">Галерея</option>
                                            <option
                                                value="catalog"
                                                disabled={
                                                    catalogCount >= 2 && image.usage_type !== "catalog"
                                                }
                                            >
                                                Каталог
                                            </option>
                                        </select>
                                    </div>
                                    <div className="mt-1 text-xs text-gray-400">Перетащите карточку, чтобы изменить порядок</div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleSetMain(image.id)}
                                        disabled={Boolean(image.is_main) || isBusy}
                                        className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50"
                                    >
                                        Главная
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void handleDelete(image.id)}
                                        disabled={isBusy}
                                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 disabled:opacity-50"
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
