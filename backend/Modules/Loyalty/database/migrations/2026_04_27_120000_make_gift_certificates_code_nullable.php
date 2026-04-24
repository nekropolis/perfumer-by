<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('gift_certificates')) {
            return;
        }

        Schema::table('gift_certificates', function (Blueprint $table) {
            $table->dropUnique(['code']);
        });

        Schema::table('gift_certificates', function (Blueprint $table) {
            $table->string('code', 64)->nullable()->change();
        });

        Schema::table('gift_certificates', function (Blueprint $table) {
            $table->unique('code');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('gift_certificates')) {
            return;
        }

        Schema::table('gift_certificates', function (Blueprint $table) {
            $table->dropUnique(['code']);
        });

        Schema::table('gift_certificates', function (Blueprint $table) {
            $table->string('code', 64)->nullable(false)->change();
        });

        Schema::table('gift_certificates', function (Blueprint $table) {
            $table->unique('code');
        });
    }
};
