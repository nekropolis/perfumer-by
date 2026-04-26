<?php

namespace Modules\Reviews\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Reviews\Models\Review;

class StoreReviewRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', Rule::in([Review::TYPE_PRODUCT, Review::TYPE_STORE])],
            'product_id' => [
                'nullable',
                'integer',
                Rule::exists('products', 'id'),
                Rule::requiredIf(fn () => $this->input('type') === Review::TYPE_PRODUCT),
            ],
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'text' => ['required', 'string', 'min:15', 'max:4000'],
            'stars' => ['required', 'integer', 'between:1,5'],
            'captcha_token' => ['nullable', 'string', 'max:4096'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            if ($this->input('type') === Review::TYPE_STORE && $this->filled('product_id')) {
                $validator->errors()->add('product_id', 'Для отзыва о магазине не указывайте товар.');
            }
        });
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Укажите имя.',
            'name.min' => 'Имя должно быть не короче 2 символов.',
            'text.required' => 'Напишите текст отзыва.',
            'text.min' => 'Отзыв должен быть не короче 15 символов.',
            'stars.required' => 'Выберите оценку.',
            'stars.between' => 'Оценка от 1 до 5 звёзд.',
            'product_id.required_if' => 'Укажите товар для отзыва.',
        ];
    }

    public function attributes(): array
    {
        return [
            'name' => 'имя',
            'text' => 'отзыв',
            'stars' => 'оценка',
            'product_id' => 'товар',
            'type' => 'тип',
        ];
    }
}
