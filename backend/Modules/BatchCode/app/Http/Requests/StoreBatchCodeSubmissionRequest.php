<?php

namespace Modules\BatchCode\Http\Requests;

use DateTimeImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;
use Modules\BatchCode\Support\BatchCodeNormalizer;

class StoreBatchCodeSubmissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'brand_slug' => ['required', 'string', 'max:255', 'exists:brands,slug'],
            'code' => ['required', 'string', 'regex:/^[A-Za-z0-9А-Яа-яЁё -]{2,20}$/u'],
            'printed_date' => ['required', 'string', 'regex:/^\d{4}-\d{2}(-\d{2})?$/'],
            'date_kind' => ['required', 'string', Rule::in(['production', 'expiry'])],
            'consent' => ['required', 'accepted'],
            'email' => ['nullable', 'email', 'max:255'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $code = $this->input('code');
            if (is_string($code) && ! $validator->errors()->has('code')) {
                $normalized = BatchCodeNormalizer::normalize($code);
                if (strlen($normalized) < 2 || strlen($normalized) > 20) {
                    $validator->errors()->add('code', 'Код должен содержать от 2 до 20 букв или цифр.');
                }
            }

            $printed = $this->input('printed_date');
            if (is_string($printed) && ! $validator->errors()->has('printed_date') && ! $this->isCalendarDate($printed)) {
                $validator->errors()->add('printed_date', 'Дата должна быть в формате ГГГГ-ММ или ГГГГ-ММ-ДД.');
            }
        });
    }

    public function messages(): array
    {
        return [
            'brand_slug.required' => 'Выберите бренд.',
            'brand_slug.exists' => 'Такого бренда нет в каталоге.',
            'code.required' => 'Введите код.',
            'code.regex' => 'Код должен быть длиной от 2 до 20 символов: буквы, цифры, пробел или дефис.',
            'printed_date.required' => 'Укажите дату с упаковки.',
            'printed_date.regex' => 'Дата должна быть в формате ГГГГ-ММ или ГГГГ-ММ-ДД.',
            'date_kind.required' => 'Укажите, что это за дата.',
            'date_kind.in' => 'Тип даты: production или expiry.',
            'consent.required' => 'Нужно согласие на сохранение кода и даты.',
            'consent.accepted' => 'Нужно согласие на сохранение кода и даты.',
            'email.email' => 'Укажите корректный email.',
        ];
    }

    private function isCalendarDate(string $value): bool
    {
        if (preg_match('/^\d{4}-\d{2}$/', $value) === 1) {
            $parsed = DateTimeImmutable::createFromFormat('!Y-m', $value);

            return $parsed instanceof DateTimeImmutable && $parsed->format('Y-m') === $value;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1) {
            $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

            return $parsed instanceof DateTimeImmutable && $parsed->format('Y-m-d') === $value;
        }

        return false;
    }
}
