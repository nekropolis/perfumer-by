<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gift_certificate_templates', function (Blueprint $table) {
            $table->id();
            $table->string('title', 255);
            $table->decimal('amount', 12, 2);
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
        });

        if (! Schema::hasTable('gift_certificates')) {
            return;
        }

        Schema::table('gift_certificates', function (Blueprint $table) {
            if (! Schema::hasColumn('gift_certificates', 'template_id')) {
                $table->foreignId('template_id')->nullable()->after('id')
                    ->constrained('gift_certificate_templates')->nullOnDelete();
            }
            if (! Schema::hasColumn('gift_certificates', 'source')) {
                $table->string('source', 32)->default('manual')->index()->after('status');
            }
            if (! Schema::hasColumn('gift_certificates', 'issued_to_user_id')) {
                $table->foreignId('issued_to_user_id')->nullable()->after('sold_order_id')
                    ->constrained('users')->nullOnDelete();
            }
            if (! Schema::hasColumn('gift_certificates', 'issued_phone')) {
                $table->string('issued_phone', 64)->nullable()->after('issued_to_user_id');
            }
            if (! Schema::hasColumn('gift_certificates', 'comment')) {
                $table->text('comment')->nullable()->after('issued_phone');
            }
            if (! Schema::hasColumn('gift_certificates', 'issued_at')) {
                $table->timestamp('issued_at')->nullable()->after('comment');
            }
            if (! Schema::hasColumn('gift_certificates', 'activated_at')) {
                $table->timestamp('activated_at')->nullable()->after('issued_at');
            }
        });

        DB::table('gift_certificates')
            ->where('status', 'redeemed')
            ->update(['status' => 'used']);

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
        if (Schema::hasTable('gift_certificates')) {
            Schema::table('gift_certificates', function (Blueprint $table) {
                $table->dropUnique(['code']);
            });

            Schema::table('gift_certificates', function (Blueprint $table) {
                $table->string('code', 64)->nullable(false)->change();
            });

            Schema::table('gift_certificates', function (Blueprint $table) {
                $table->unique('code');
            });

            DB::table('gift_certificates')
                ->where('status', 'used')
                ->update(['status' => 'redeemed']);

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

        Schema::dropIfExists('gift_certificate_templates');
    }
};
