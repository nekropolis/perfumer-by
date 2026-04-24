<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('gift_certificates')) {
            return;
        }

        DB::table('gift_certificates')
            ->where('status', 'redeemed')
            ->update(['status' => 'used']);
    }

    public function down(): void
    {
        if (!Schema::hasTable('gift_certificates')) {
            return;
        }

        DB::table('gift_certificates')
            ->where('status', 'used')
            ->update(['status' => 'redeemed']);
    }
};
