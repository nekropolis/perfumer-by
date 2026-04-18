<?php

namespace Modules\Users\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(100, max(5, (int) $request->query('per_page', 20)));

        $query = AuditLog::query()
            ->with(['actor:id,name,email'])
            ->orderByDesc('id');

        if ($request->filled('entity_type')) {
            $query->where('entity_type', $request->string('entity_type')->toString());
        }

        if ($request->filled('action')) {
            $query->where('action', $request->string('action')->toString());
        }

        if ($request->filled('warehouse_id')) {
            $query->where('warehouse_id', (int) $request->query('warehouse_id'));
        }

        return response()->json($query->paginate($perPage));
    }
}
