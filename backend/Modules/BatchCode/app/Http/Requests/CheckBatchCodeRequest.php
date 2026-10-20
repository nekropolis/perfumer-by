<?php

namespace Modules\BatchCode\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;
use Modules\BatchCode\Support\BatchCodeNormalizer;

class CheckBatchCodeRequest extends FormRequest
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
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }
            $normalized = BatchCodeNormalizer::normalize((string) $this->input('code'));
            if (strlen($normalized) < 2 || strlen($normalized) > 20) {
                $validator->errors()->add('code', 'Код должен содержать от 2 до 20 букв или цифр.');
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
        ];
    }
}
