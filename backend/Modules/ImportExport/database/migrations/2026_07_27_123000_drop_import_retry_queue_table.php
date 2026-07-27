<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('import_retry_queue');
    }

    public function down(): void
    {
        // Table intentionally not recreated: import retry queue feature was removed.
    }
};
