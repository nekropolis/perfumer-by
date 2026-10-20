<?php

namespace Modules\BatchCode\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\BatchCode\Http\Requests\StoreBatchCodeSubmissionRequest;
use Modules\BatchCode\Models\BatchCodeSubmission;
use Modules\BatchCode\Support\BatchCodeNormalizer;

class BatchCodeSubmissionController extends Controller
{
    public function store(StoreBatchCodeSubmissionRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $printed = (string) $validated['printed_date'];
        if (strlen($printed) === 7) {
            $printed .= '-01';
        }

        $agent = $request->userAgent();
        if (is_string($agent) && $agent !== '') {
            $agent = mb_substr($agent, 0, 512);
        } else {
            $agent = null;
        }

        $submission = BatchCodeSubmission::query()->create([
            'brand_slug' => $validated['brand_slug'],
            'code' => $validated['code'],
            'code_normalized' => BatchCodeNormalizer::normalize((string) $validated['code']),
            'printed_date' => $printed,
            'date_kind' => $validated['date_kind'],
            'email' => $validated['email'] ?? null,
            'ip_hash' => BatchCodeSubmission::hashIp((string) $request->ip()),
            'user_agent' => $agent,
            'status' => BatchCodeSubmission::STATUS_PENDING,
        ]);

        return response()->json([
            'data' => [
                'id' => $submission->id,
                'status' => $submission->status,
            ],
        ], 201);
    }
}
