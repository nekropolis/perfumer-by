<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('brands', function (Blueprint $table) {
            if (!Schema::hasColumn('brands', 'description')) {
                $table->longText('description')->nullable()->after('slug');
            }

            if (!Schema::hasColumn('brands', 'seo_keyword')) {
                $table->text('seo_keyword')->nullable()->after('seo_description');
            }
        });
    }

    public function down(): void
    {
        Schema::table('brands', function (Blueprint $table) {
            if (Schema::hasColumn('brands', 'description')) {
                $table->dropColumn('description');
            }

            if (Schema::hasColumn('brands', 'seo_keyword')) {
                $table->dropColumn('seo_keyword');
            }
        });
    }
};
