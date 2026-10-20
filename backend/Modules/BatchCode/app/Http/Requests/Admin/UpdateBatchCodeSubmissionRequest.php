<?php

namespace Modules\BatchCode\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\BatchCode\Models\BatchCodeSubmission;

class UpdateBatchCodeSubmissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', 'string', Rule::in([
                BatchCodeSubmission::STATUS_PENDING,
                BatchCodeSubmission::STATUS_ACCEPTED,
                BatchCodeSubmission::STATUS_REJECTED,
            ])],
        ];
    }
}
