<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_images', function (Blueprint $table): void {
            $table->string('usage_type', 20)->default('gallery')->after('is_main');
            $table->string('source_url', 2048)->nullable()->after('usage_type');
            $table->string('watermark_status', 30)->default('none')->after('source_url');
            $table->json('watermark_meta')->nullable()->after('watermark_status');
        });
    }

    public function down(): void
    {
        Schema::table('product_images', function (Blueprint $table): void {
            $table->dropColumn(['usage_type', 'source_url', 'watermark_status', 'watermark_meta']);
        });
    }
};
