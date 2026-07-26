<?php

namespace Modules\Checkout\Support;

/**
 * Стабильные «случайные» фамилия/отчество для ветерОК, когда в заказе их нет.
 * Выбор детерминирован по seed (обычно order id), чтобы превью не прыгало.
 */
class RandomPersonNameGenerator
{
    private const LAST_NAMES = [
        'Иванов',
        'Петров',
        'Сидоров',
        'Козлов',
        'Новиков',
        'Морозов',
        'Волков',
        'Соколов',
        'Лебедев',
        'Кузнецов',
        'Попов',
        'Васильев',
        'Смирнов',
        'Михайлов',
        'Фёдоров',
        'Егоров',
        'Павлов',
        'Семёнов',
        'Голубев',
        'Виноградов',
        'Богданов',
        'Воробьёв',
        'Фролов',
        'Михайловский',
        'Алексеев',
        'Дмитриев',
        'Степанов',
        'Николаев',
        'Орлов',
        'Андреев',
    ];

    private const PATRONYMICS_MALE = [
        'Иванович',
        'Петрович',
        'Сергеевич',
        'Александрович',
        'Дмитриевич',
        'Андреевич',
        'Николаевич',
        'Михайлович',
        'Владимирович',
        'Алексеевич',
        'Евгеньевич',
        'Викторович',
        'Юрьевич',
        'Олегович',
        'Игоревич',
    ];

    private const PATRONYMICS_FEMALE = [
        'Ивановна',
        'Петровна',
        'Сергеевна',
        'Александровна',
        'Дмитриевна',
        'Андреевна',
        'Николаевна',
        'Михайловна',
        'Владимировна',
        'Алексеевна',
        'Евгеньевна',
        'Викторовна',
        'Юрьевна',
        'Олеговна',
        'Игоревна',
    ];

    public function randomLastName(int|string $seed): string
    {
        return $this->pick(self::LAST_NAMES, $seed, 'last');
    }

    public function randomPatronymic(int|string $seed, string $firstName = ''): string
    {
        $list = $this->isLikelyFemaleFirstName($firstName)
            ? self::PATRONYMICS_FEMALE
            : self::PATRONYMICS_MALE;

        return $this->pick($list, $seed, 'patronymic');
    }

    /**
     * @param  list<string>  $items
     */
    private function pick(array $items, int|string $seed, string $salt): string
    {
        $index = abs(crc32($salt.':'.(string) $seed)) % count($items);

        return $items[$index];
    }

    private function isLikelyFemaleFirstName(string $firstName): bool
    {
        $name = mb_strtolower(trim($firstName));
        if ($name === '') {
            return false;
        }

        $last = mb_substr($name, -1);

        return in_array($last, ['а', 'я'], true)
            || str_ends_with($name, 'ия')
            || str_ends_with($name, 'ья');
    }
}
