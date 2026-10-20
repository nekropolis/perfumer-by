<?php

namespace Modules\BatchCode\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Modules\BatchCode\Http\Requests\Admin\UpdateBatchCodeSubmissionRequest;
use Modules\BatchCode\Models\BatchCodeSubmission;

class BatchCodeSubmissionAdminController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            BatchCodeSubmission::query()->orderByDesc('id')->paginate(20)
        );
    }

    public function update(UpdateBatchCodeSubmissionRequest $request, int $id): JsonResponse
    {
        $submission = BatchCodeSubmission::query()->findOrFail($id);
        $submission->status = $request->validated('status');
        $submission->save();

        return response()->json([
            'data' => $submission->fresh(),
        ]);
    }
}
