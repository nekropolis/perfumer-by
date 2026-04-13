"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";

type Props = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
};

function ToolbarButton({
                           label,
                           active = false,
                           onClick,
                       }: {
    label: string;
    active?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                active ? "bg-black text-white" : "bg-white hover:bg-gray-50"
            }`}
        >
            {label}
        </button>
    );
}

export default function AdminRichTextEditor({
                                                value,
                                                onChange,
                                                placeholder = "Введите текст...",
                                            }: Props) {
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
                defaultProtocol: "https",
            }),
        ],
        content: value || "",
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class:
                    "min-h-[240px] w-full rounded-b-2xl px-4 py-3 text-sm outline-none prose prose-sm max-w-none",
            },
        },
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
    });

    useEffect(() => {
        if (!editor) {
            return;
        }

        const currentHtml = editor.getHTML();
        const nextValue = value || "";

        if (currentHtml !== nextValue) {
            editor.commands.setContent(nextValue, { emitUpdate: false });
        }
    }, [editor, value]);

    if (!editor) {
        return (
            <div className="rounded-2xl border bg-white px-4 py-3 text-sm text-gray-500">
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

    return (
        <div className="rounded-2xl border bg-white">
            <div className="flex flex-wrap gap-2 border-b p-3">
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
                    label="Ссылка"
                    active={editor.isActive("link")}
                    onClick={setLink}
                />
                <ToolbarButton
                    label="Очистить"
                    onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
                />
            </div>

            <div className="min-h-[240px]">
                {!value ? (
                    <div className="pointer-events-none absolute hidden px-4 py-3 text-sm text-gray-400">
                        {placeholder}
                    </div>
                ) : null}
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}
