<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('phone_verifications', function (Blueprint $table) {
            if (! Schema::hasColumn('phone_verifications', 'purpose')) {
                $table->string('purpose', 32)->default('legacy')->after('phone');
            }

            if (! Schema::hasColumn('phone_verifications', 'meta')) {
                $table->text('meta')->nullable()->after('code');
            }
        });
    }

    public function down(): void
    {
        Schema::table('phone_verifications', function (Blueprint $table) {
            if (Schema::hasColumn('phone_verifications', 'meta')) {
                $table->dropColumn('meta');
            }

            if (Schema::hasColumn('phone_verifications', 'purpose')) {
                $table->dropColumn('purpose');
            }
        });
    }
};
