<?php

namespace Modules\Checkout\Services\Veter;

use Modules\Checkout\Models\Order;
use Modules\Checkout\Models\OrderItem;
use Modules\Checkout\Services\CheckoutDeliveryService;
use Modules\Checkout\Support\RandomPersonNameGenerator;
use Modules\Catalog\Support\ProductDisplayName;
use Modules\Users\Models\Client;
use App\Support\Phone;

class VeterTicketPayloadBuilder
{
    public function __construct(
        private readonly RandomPersonNameGenerator $names,
    ) {}

    /**
     * @return array{ok: true, ticket: array<string, mixed>}|array{ok: false, missing: list<string>, reason: string}
     */
    public function buildForOrder(Order $order): array
    {
        $missing = $this->validationMissing($order);
        if ($missing !== []) {
            return [
                'ok' => false,
                'missing' => $missing,
                'reason' => 'Не заполнено: '.implode(', ', $missing),
            ];
        }

        $fio = $this->resolveFio($order);
        $sender = (array) config('services.veter.sender', []);

        $comments = $this->buildComments($order);

        $ticket = [
            'ProfileName' => (string) config('services.veter.profile_name', ''),
            'CityID' => (string) $this->resolveCityId($order),
            'StreetPrefix' => (string) ($order->delivery_street_prefix ?? ''),
            'StreetName' => trim((string) $order->delivery_address),
            'HouseNumber' => (string) ($order->delivery_house ?? ''),
            'Korpus' => (string) ($order->delivery_korpus ?? ''),
            'Kvartira' => (string) ($order->delivery_apartment ?? ''),
            'SenderCityID' => (string) ($sender['city_id'] ?? ''),
            'SenderStreetPrefix' => (string) ($sender['street_prefix'] ?? ''),
            'SenderStreetName' => (string) ($sender['street_name'] ?? ''),
            'SenderHouseNumber' => (string) ($sender['house_number'] ?? ''),
            'SenderKorpus' => (string) ($sender['korpus'] ?? ''),
            'SenderKvartira' => (string) ($sender['kvartira'] ?? ''),
            'FirstName' => $fio['last'],
            'SecondName' => $fio['first'],
            'ThirdName' => $fio['patronymic'],
            'FirstTelefonNumber' => Phone::formatBelarusDisplay((string) ($order->phone ?? '')),
            'SecondTelefonNumber' => '',
            'RecieverCost' => '',
            'BoxCount' => '1',
            'SendDate' => $this->formatSendDate($order),
            'Comments' => $comments,
            'TTNSeria' => '',
            'TTNNmber' => '',
            'OtherDocuments' => '',
            'CreditDocuments' => '0',
            'PassportSeria' => '',
            'PassportNumber' => '',
            'Goods' => [
                [
                    // GoodName — название из справочника ветерОК (GoodsAPI).
                    'GoodName' => 'Парфюмерия *(в ассортименте)',
                    'GoodModel' => $this->buildGoodName($order),
                    'GoodCost' => $this->formatMoney($order->total),
                    'GoodCount' => '1',
                ],
            ],
        ];

        return ['ok' => true, 'ticket' => $ticket];
    }

    /**
     * @return list<string>
     */
    public function validationMissing(Order $order): array
    {
        $missing = [];
        $method = (string) ($order->delivery_method ?? '');

        if ($method === CheckoutDeliveryService::METHOD_PICKUP) {
            $missing[] = 'самовывоз (в курьерскую службу не отправляется)';
        } elseif (! in_array($method, [
            CheckoutDeliveryService::METHOD_MINSK,
            CheckoutDeliveryService::METHOD_BELARUS,
        ], true)) {
            $missing[] = 'способ доставки (нужен курьер Минск или РБ)';
        }

        if ($this->resolveCityId($order) <= 0) {
            $missing[] = $method === CheckoutDeliveryService::METHOD_MINSK
                ? 'населённый пункт Минск (VETER_MINSK_CITY_ID)'
                : 'населённый пункт (ID ветерОК)';
        }
        if (trim((string) ($order->delivery_address ?? '')) === '') {
            $missing[] = 'адрес (улица)';
        }
        if ($this->resolveFio($order)['first'] === '') {
            $missing[] = 'имя клиента';
        }
        if (trim((string) ($order->phone ?? '')) === '') {
            $missing[] = 'телефон';
        }

        return $missing;
    }

    private function resolveCityId(Order $order): int
    {
        $fromOrder = (int) ($order->delivery_city_id ?? 0);
        if ($fromOrder > 0) {
            return $fromOrder;
        }

        if ((string) ($order->delivery_method ?? '') === CheckoutDeliveryService::METHOD_MINSK) {
            return (int) config('services.veter.minsk_city_id', 0);
        }

        return 0;
    }

    /**
     * @return array{first: string, last: string, patronymic: string}
     */
    private function resolveFio(Order $order): array
    {
        $first = '';
        $last = '';
        $patronymic = '';

        // Заказ (admin: Имя Фамилия Отчество) — основной источник для ветерОК.
        $parsedOrder = $this->parseCustomerName((string) ($order->customer_name ?? ''));
        $first = $parsedOrder['first'];
        $last = $parsedOrder['last'];
        $patronymic = $parsedOrder['patronymic'];

        $client = $order->relationLoaded('client') ? $order->client : null;
        if ($client instanceof Client) {
            $cFirst = trim((string) ($client->first_name ?? ''));
            $cLast = trim((string) ($client->last_name ?? ''));
            $cPatronymic = trim((string) ($client->patronymic ?? ''));

            // Структурированные поля клиента — только дозаполнение пустых частей.
            // first_name с пробелами часто = целое ФИО из старых миграций; так не берём.
            if ($first === '' && $cFirst !== '' && ! preg_match('/\s/u', $cFirst)) {
                $first = $cFirst;
            }
            if ($last === '' && $cLast !== '') {
                $last = $cLast;
            }
            if ($patronymic === '' && $cPatronymic !== '') {
                $patronymic = $cPatronymic;
            }

            if (($first === '' || $last === '' || $patronymic === '') && $cFirst !== '' && preg_match('/\s/u', $cFirst)) {
                $fromBlob = $this->parseCustomerName($cFirst);
                if ($first === '') {
                    $first = $fromBlob['first'];
                }
                if ($last === '') {
                    $last = $fromBlob['last'];
                }
                if ($patronymic === '') {
                    $patronymic = $fromBlob['patronymic'];
                }
            }
        }

        $seed = (int) $order->id;
        if ($last === '') {
            $last = $this->names->randomLastName($seed);
        }
        if ($patronymic === '') {
            $patronymic = $this->names->randomPatronymic($seed, $first);
        }

        return [
            'first' => $first,
            'last' => $last,
            'patronymic' => $patronymic,
        ];
    }

    /**
     * Разбор строки ФИО.
     * Поддерживает: «Имя Фамилия Отчество», «Имя Отчество Фамилия», «Фамилия Имя Отчество».
     *
     * @return array{first: string, last: string, patronymic: string}
     */
    private function parseCustomerName(string $full): array
    {
        $parts = preg_split('/\s+/u', trim($full), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ($parts === []) {
            return ['first' => '', 'last' => '', 'patronymic' => ''];
        }
        if (count($parts) === 1) {
            return ['first' => $parts[0], 'last' => '', 'patronymic' => ''];
        }
        if (count($parts) === 2) {
            // «Фамилия Имя», если второе похоже на имя, а первое — нет.
            if ($this->looksLikeFirstName($parts[1]) && ! $this->looksLikeFirstName($parts[0])) {
                return ['first' => $parts[1], 'last' => $parts[0], 'patronymic' => ''];
            }

            // Имя Фамилия (как в форме заказа).
            return ['first' => $parts[0], 'last' => $parts[1], 'patronymic' => ''];
        }

        $a = $parts[0];
        $b = $parts[1];
        $c = implode(' ', array_slice($parts, 2));

        // Имя Отчество Фамилия (displayName клиента).
        if ($this->looksLikePatronymic($b) && ! $this->looksLikePatronymic($c)) {
            return ['first' => $a, 'last' => $c, 'patronymic' => $b];
        }

        // Фамилия Имя Отчество.
        if ($this->looksLikePatronymic($c) && ! $this->looksLikePatronymic($b) && $this->looksLikeFirstName($b)) {
            return ['first' => $b, 'last' => $a, 'patronymic' => $c];
        }

        // Имя Фамилия Отчество (форма заказа).
        return ['first' => $a, 'last' => $b, 'patronymic' => $c];
    }

    private function looksLikePatronymic(string $value): bool
    {
        $v = mb_strtolower(trim($value));
        if ($v === '') {
            return false;
        }

        return (bool) preg_match('/(ович|евич|ич|овна|евна|ична|инична)$/u', $v);
    }

    private function looksLikeFirstName(string $value): bool
    {
        $v = mb_strtolower(trim($value));
        if ($v === '' || preg_match('/\s/u', $v)) {
            return false;
        }

        $last = mb_substr($v, -1);

        return in_array($last, ['а', 'я', 'й', 'н', 'р', 'л', 'м', 'с', 'т', 'в', 'д', 'к', 'г', 'б', 'п', 'ь'], true);
    }

    private function buildGoodName(Order $order): string
    {
        $names = [];
        foreach ($order->items as $item) {
            if (! $item instanceof OrderItem) {
                continue;
            }
            $label = $this->buildLineItemTitle($item);
            if ($label !== '') {
                $names[] = $label;
            }
        }

        if ($names === []) {
            return 'Заказ #'.$order->id;
        }

        return implode(', ', $names);
    }

    /**
     * Бренд + имя без дубля бренда (product_name часто уже snapshot display_name) + вариант.
     */
    private function buildLineItemTitle(OrderItem $item): string
    {
        $brand = trim((string) ($item->brand_name ?? ''));
        $product = trim((string) ($item->product_name ?? ''));
        $variant = trim((string) ($item->variant_title ?? ''));

        if ($brand !== '' && $product !== '') {
            $stripped = ProductDisplayName::stripBrandFromName($brand, $product);
            $shortName = $stripped['found'] ? (string) $stripped['name'] : $product;
            $title = ProductDisplayName::format($brand, $shortName);
        } else {
            $title = $product !== '' ? $product : $brand;
        }

        if ($variant !== '') {
            $title = $title !== '' ? $title.' '.$variant : $variant;
        }

        return trim($title);
    }

    private function buildComments(Order $order): string
    {
        $parts = [];
        $from = $this->formatClock($order->delivery_time_from);
        $to = $this->formatClock($order->delivery_time_to);
        if ($from !== null || $to !== null) {
            $parts[] = ($from ?? '—').' – '.($to ?? '—');
        }
        
        $deliveryComment = trim((string) ($order->delivery_comment ?? ''));
        if ($deliveryComment !== '') {
            $parts[] = $deliveryComment;
        }

        return implode("\n", $parts);
    }

    private function formatClock(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if ($value instanceof \Carbon\CarbonInterface) {
            return $value->format('H:i');
        }
        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }
        if (preg_match('/^(\d{1,2}):(\d{2})(?::\d{2})?/', $raw, $m) === 1) {
            return sprintf('%02d:%02d', (int) $m[1], (int) $m[2]);
        }

        return $raw;
    }

    private function formatSendDate(Order $order): string
    {
        $tz = config('app.timezone', 'Europe/Minsk');
        $today = now()->timezone($tz)->startOfDay();
        $minskCityId = (int) config('services.veter.minsk_city_id', 0);
        $cityId = $this->resolveCityId($order);
        $isMinsk = $minskCityId > 0 && $cityId === $minskCityId;

        // Вне Минска Ветер принимает заявку только на следующий день и позже.
        $minDate = $isMinsk ? $today : $today->copy()->addDay();

        $date = $order->delivery_date
            ? $order->delivery_date->copy()->timezone($tz)->startOfDay()
            : $minDate->copy();

        if ($date->lt($minDate)) {
            $date = $minDate->copy();
        }

        return $date->format('d.m.Y');
    }

    private function formatMoney(mixed $value): string
    {
        return number_format((float) $value, 2, ',', '');
    }
}
