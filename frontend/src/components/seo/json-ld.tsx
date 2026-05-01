type JsonValue = Record<string, unknown> | Record<string, unknown>[];

type Props = {
    data: JsonValue;
};

/**
 * Один или несколько объектов schema.org. Сериализация — на сервере, без кастомного replacer
 * (не передавайте в data чувствительные структуры с циклами).
 */
export default function JsonLd({ data }: Props) {
    const list = Array.isArray(data) ? data : [data];
    return (
        <>
            {list.map((schema, index) => (
                <script
                    // eslint-disable-next-line react/no-array-index-key -- стабильный порядок фиксирован
                    key={index}
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
                />
            ))}
        </>
    );
}
