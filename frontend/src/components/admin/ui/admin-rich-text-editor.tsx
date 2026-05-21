"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/auth-token";

type Props = {
    value: string;
    onChangeAction: (value: string) => void;
    placeholder?: string;
    imageUploadUrl?: string;
};

function ToolbarButton({
                           label,
                           active = false,
                           disabled = false,
                           onClick,
                       }: {
    label: string;
    active?: boolean;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                active
                    ? "border-black bg-admin-primary text-white"
                    : "bg-white hover:bg-admin-muted"
            } disabled:cursor-not-allowed disabled:opacity-40`}
        >
            {label}
        </button>
    );
}

function ToolbarDivider() {
    return <div className="mx-1 hidden h-8 w-px bg-gray-200 sm:block" />;
}

export default function AdminRichTextEditor({
                                                value,
                                                onChangeAction,
                                                placeholder = "Введите текст...",
                                                imageUploadUrl,
                                            }: Props) {
    const [uploadingImage, setUploadingImage] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [2, 3, 4],
                },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                autolink: true,
            }),
        ],
        content: value || "",
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class:
                    "ProseMirror min-h-[240px] w-full rounded-b-2xl px-4 py-3 text-sm outline-none max-w-none",
            },
        },
        onUpdate: ({ editor }) => {
            onChangeAction(editor.getHTML());
        },
    });

    useEffect(() => {
        if (!editor) {
            return;
        }

        const currentHtml = editor.getHTML();
        const nextValue = value || "";

        if (currentHtml !== nextValue) {
            editor.commands.setContent(nextValue, { errorOnInvalidContent: false });
        }
    }, [editor, value]);

    if (!editor) {
        return (
            <div className="rounded-2xl border bg-white px-4 py-3 text-sm text-admin-text-secondary">
                Загрузка редактора...
            </div>
        );
    }

    const setLink = () => {
        const previousUrl = editor.getAttributes("link").href;
        const url = window.prompt("Вставь ссылку", previousUrl || "https://");

        if (url === null) {
            return;
        }

        if (!url.trim()) {
            editor.chain().focus().unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
    };

    const uploadAndInsertImage = async (file: File) => {
        if (!imageUploadUrl || !editor) {
            return;
        }
        const base = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
        if (!base) {
            window.alert("NEXT_PUBLIC_API_URL не задан");
            return;
        }

        const formData = new FormData();
        formData.append("image", file);

        setUploadingImage(true);
        try {
            const token = getAuthToken();
            const res = await fetch(`${base}${imageUploadUrl.startsWith("/") ? imageUploadUrl : `/${imageUploadUrl}`}`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                body: formData,
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `Ошибка загрузки: ${res.status}`);
            }

            const json = (await res.json()) as { data?: { picture_html?: string; url?: string } };
            const pictureHtml = json.data?.picture_html;
            const url = json.data?.url;
            if (pictureHtml) {
                editor.chain().focus().insertContent(pictureHtml).run();
                return;
            }
            if (url) {
                editor.chain().focus().insertContent(`<picture><img src="${url}" alt="" loading="lazy" decoding="async" /></picture>`).run();
                return;
            }

            throw new Error("Пустой ответ от сервера");
        } catch (e) {
            const message = e instanceof Error ? e.message : "Ошибка загрузки изображения";
            window.alert(message);
        } finally {
            setUploadingImage(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    return (
        <div className="rounded-2xl border bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
                <ToolbarButton
                    label="B"
                    active={editor.isActive("bold")}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                />

                <ToolbarButton
                    label="I"
                    active={editor.isActive("italic")}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                />

                <ToolbarButton
                    label="U"
                    active={editor.isActive("underline")}
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                />

                <ToolbarDivider />

                <ToolbarButton
                    label="H2"
                    active={editor.isActive("heading", { level: 2 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                />

                <ToolbarButton
                    label="H3"
                    active={editor.isActive("heading", { level: 3 })}
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                />

                <ToolbarDivider />

                <ToolbarButton
                    label="Список"
                    active={editor.isActive("bulletList")}
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                />

                <ToolbarButton
                    label="Нумерация"
                    active={editor.isActive("orderedList")}
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                />

                <ToolbarButton
                    label="Цитата"
                    active={editor.isActive("blockquote")}
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                />

                <ToolbarButton
                    label="Линия"
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                />

                <ToolbarDivider />

                <ToolbarButton
                    label="Ссылка"
                    active={editor.isActive("link")}
                    onClick={setLink}
                />

                {imageUploadUrl ? (
                    <>
                        <ToolbarDivider />
                        <ToolbarButton
                            label={uploadingImage ? "Загрузка..." : "Картинка"}
                            disabled={uploadingImage}
                            onClick={() => fileInputRef.current?.click()}
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) {
                                    return;
                                }
                                void uploadAndInsertImage(file);
                            }}
                        />
                    </>
                ) : null}

                <ToolbarDivider />

                <ToolbarButton
                    label="↺"
                    disabled={!editor.can().chain().focus().undo().run()}
                    onClick={() => editor.chain().focus().undo().run()}
                />

                <ToolbarButton
                    label="↻"
                    disabled={!editor.can().chain().focus().redo().run()}
                    onClick={() => editor.chain().focus().redo().run()}
                />

                <ToolbarButton
                    label="Очистить"
                    onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                />
            </div>

            <div className="relative min-h-[240px]">
                {!editor.getText().trim() ? (
                    <div className="pointer-events-none absolute left-0 top-0 px-4 py-3 text-sm text-gray-400">
                        {placeholder}
                    </div>
                ) : null}

                <EditorContent editor={editor} />
            </div>
        </div>
    );
}