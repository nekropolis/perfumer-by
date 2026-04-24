<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('gift_certificates')) {
            return;
        }

        Schema::table('gift_certificates', function (Blueprint $table) {
            if (!Schema::hasColumn('gift_certificates', 'template_id')) {
                $table->foreignId('template_id')->nullable()->after('id')
                    ->constrained('gift_certificate_templates')->nullOnDelete();
            }
            if (!Schema::hasColumn('gift_certificates', 'source')) {
                $table->string('source', 32)->default('manual')->index()->after('status');
            }
            if (!Schema::hasColumn('gift_certificates', 'issued_to_user_id')) {
                $table->foreignId('issued_to_user_id')->nullable()->after('sold_order_id')
                    ->constrained('users')->nullOnDelete();
            }
            if (!Schema::hasColumn('gift_certificates', 'issued_phone')) {
                $table->string('issued_phone', 64)->nullable()->after('issued_to_user_id');
            }
            if (!Schema::hasColumn('gift_certificates', 'comment')) {
                $table->text('comment')->nullable()->after('issued_phone');
            }
            if (!Schema::hasColumn('gift_certificates', 'issued_at')) {
                $table->timestamp('issued_at')->nullable()->after('comment');
            }
            if (!Schema::hasColumn('gift_certificates', 'activated_at')) {
                $table->timestamp('activated_at')->nullable()->after('issued_at');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('gift_certificates')) {
            return;
        }

        Schema::table('gift_certificates', function (Blueprint $table) {
            if (Schema::hasColumn('gift_certificates', 'template_id')) {
                $table->dropConstrainedForeignId('template_id');
            }
            if (Schema::hasColumn('gift_certificates', 'issued_to_user_id')) {
                $table->dropConstrainedForeignId('issued_to_user_id');
            }
            foreach (['source', 'issued_phone', 'comment', 'issued_at', 'activated_at'] as $column) {
                if (Schema::hasColumn('gift_certificates', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
