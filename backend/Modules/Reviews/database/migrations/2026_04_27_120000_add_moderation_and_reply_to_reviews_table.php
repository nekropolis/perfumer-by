<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            $table->string('status', 32)->default('pending')->after('stars');
            $table->timestamp('published_at')->nullable()->after('status');
            $table->text('reply_text')->nullable()->after('published_at');
            $table->timestamp('replied_at')->nullable()->after('reply_text');
        });

        DB::table('reviews')->update([
            'status' => 'published',
            'published_at' => DB::raw('COALESCE(published_at, created_at)'),
        ]);
    }

    public function down(): void
    {
        Schema::table('reviews', function (Blueprint $table) {
            $table->dropColumn(['status', 'published_at', 'reply_text', 'replied_at']);
        });
    }
};
