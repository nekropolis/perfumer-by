<?php

namespace Modules\Catalog\Support;

/**
 * ID атрибутов и опций из product_attributes / product_attribute_options.
 *
 * Единый источник для Seller One, приходов XLS и eager-load индекса каталога при парсинге.
 * При смене ID в БД — править только этот файл.
 */
final class CatalogProductAttributeIds
{
    /** product_attributes: «Сделано в» (страна производства) */
    public const int MADE_IN_ATTRIBUTE_ID = 13;

    /** product_attributes: «Для кого» */
    public const int GENDER_ATTRIBUTE_ID = 2;

    public const int GENDER_OPTION_FEMALE_ID = 2;

    public const int GENDER_OPTION_MALE_ID = 27;

    public const int GENDER_OPTION_UNISEX_ID = 62;

    /** product_attributes: «Год создания» */
    public const int CREATION_YEAR_ATTRIBUTE_ID = 3;

    /** product_attributes: «Стойкость» */
    public const int STABILITY_ATTRIBUTE_ID = 9;

    /** product_attributes: «Шлейфовость» */
    public const int SILLAGE_ATTRIBUTE_ID = 10;

    /** product_attributes: «Типы» */
    public const int TYPE_ATTRIBUTE_ID = 18;

    /** product_attributes: «Парфюмер» */
    public const int PERFUMER_MAIN_ATTRIBUTE_ID = 16;

    /** product_attributes: «Парфюмеры» */
    public const int PERFUMER_ATTRIBUTE_ID = 17;

    /** product_attributes: «Сезон» */
    public const int SEASON_ATTRIBUTE_ID = 8;

    /** product_attributes: «Время суток» */
    public const int TIME_OF_DAY_ATTRIBUTE_ID = 15;

    /** product_attributes: «Семейство ароматов» */
    public const int FRAGRANCE_FAMILY_ATTRIBUTE_ID = 4;

    /** product_attributes: «Начальные ноты» */
    public const int TOP_NOTES_ATTRIBUTE_ID = 5;

    /** product_attributes: «Ноты сердца» */
    public const int HEART_NOTES_ATTRIBUTE_ID = 6;

    /** product_attributes: «Базовые ноты» */
    public const int BASE_NOTES_ATTRIBUTE_ID = 7;

    /**
     * Атрибуты для генерации пула кандидатов (инвертированный индекс).
     *
     * @return list<int>
     */
    public static function similarGeneratorAttributeIds(): array
    {
        return [
            self::TOP_NOTES_ATTRIBUTE_ID,
            self::HEART_NOTES_ATTRIBUTE_ID,
            self::BASE_NOTES_ATTRIBUTE_ID,
            self::PERFUMER_MAIN_ATTRIBUTE_ID,
            self::PERFUMER_ATTRIBUTE_ID,
            self::TYPE_ATTRIBUTE_ID,
        ];
    }

    /**
     * @return list<int>
     */
    public static function similarNoteAttributeIds(): array
    {
        return [
            self::FRAGRANCE_FAMILY_ATTRIBUTE_ID,
            self::TOP_NOTES_ATTRIBUTE_ID,
            self::HEART_NOTES_ATTRIBUTE_ID,
            self::BASE_NOTES_ATTRIBUTE_ID,
        ];
    }

    /**
     * @return list<int>
     */
    public static function similarAllAttributeIds(): array
    {
        return [
            self::GENDER_ATTRIBUTE_ID,
            self::CREATION_YEAR_ATTRIBUTE_ID,
            self::STABILITY_ATTRIBUTE_ID,
            self::SILLAGE_ATTRIBUTE_ID,
            self::TYPE_ATTRIBUTE_ID,
            self::PERFUMER_MAIN_ATTRIBUTE_ID,
            self::PERFUMER_ATTRIBUTE_ID,
            self::SEASON_ATTRIBUTE_ID,
            self::TIME_OF_DAY_ATTRIBUTE_ID,
            ...self::similarNoteAttributeIds(),
        ];
    }

    /**
     * @return list<int>
     */
    public static function genderOptionIdsForBucket(string $bucket): array
    {
        return match ($bucket) {
            'female' => [self::GENDER_OPTION_FEMALE_ID],
            'male' => [self::GENDER_OPTION_MALE_ID],
            'unisex' => [self::GENDER_OPTION_UNISEX_ID],
            default => [],
        };
    }
}
