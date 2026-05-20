<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('product_images', function (Blueprint $table): void {
            $table->string('path_full', 2048)->nullable()->after('path');
            $table->string('path_card', 2048)->nullable()->after('path_full');
            $table->string('path_listing', 2048)->nullable()->after('path_card');
            $table->string('path_thumb', 2048)->nullable()->after('path_listing');
        });
    }

    public function down(): void
    {
        Schema::table('product_images', function (Blueprint $table): void {
            $table->dropColumn(['path_full', 'path_card', 'path_listing', 'path_thumb']);
        });
    }
};
