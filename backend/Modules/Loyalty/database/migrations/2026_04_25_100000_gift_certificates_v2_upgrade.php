<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Апгрейд с legacy-схемы (number/nominal/balance) на v2 + журнал транзакций.
 * Для установок, уже прошедших старые миграции Loyalty.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('gift_certificates') && Schema::hasColumn('gift_certificates', 'code')) {
            $this->dropLegacyOrderGiftColumns();
            $this->renameCartGiftColumnIfNeeded();
            $this->ensureLedgerTables();

            return;
        }

        $this->dropLegacyOrderGiftColumns();
        $this->renameCartGiftColumnIfNeeded();

        Schema::dropIfExists('order_gift_certificates');
        Schema::dropIfExists('gift_certificate_transactions');

        $legacyRows = collect();
        if (Schema::hasTable('gift_certificates') && Schema::hasColumn('gift_certificates', 'number')) {
            $legacyRows = DB::table('gift_certificates')->get();
        }

        if (Schema::hasTable('gift_certificates')) {
            Schema::drop('gift_certificates');
        }

        Schema::create('gift_certificates', function (Blueprint $table) {
            $table->id();
            $table->string('code', 64)->unique();
            $table->decimal('initial_amount', 12, 2);
            $table->decimal('balance_amount', 12, 2);
            $table->decimal('reserved_amount', 12, 2)->default(0);
            $table->string('status', 32)->default('active')->index();
            $table->timestamp('expires_at')->nullable()->index();
            $table->foreignId('sold_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('purchaser_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable()->useCurrent();
        });

        Schema::create('gift_certificate_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gift_certificate_id')->constrained('gift_certificates')->cascadeOnDelete();
            $table->string('type', 32)->index();
            $table->decimal('amount', 12, 2);
            $table->decimal('balance_before', 12, 2);
            $table->decimal('balance_after', 12, 2);
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('cart_token', 64)->nullable()->index();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->nullable()->useCurrent();
        });

        Schema::create('order_gift_certificates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('gift_certificate_id')->constrained('gift_certificates')->cascadeOnDelete();
            $table->string('code_snapshot', 64);
            $table->decimal('amount_applied', 12, 2);
            $table->timestamp('created_at')->nullable()->useCurrent();
        });

        foreach ($legacyRows as $row) {
            $balance = (float) ($row->balance ?? 0);
            $nominal = (float) ($row->nominal ?? $balance);
            $active = (bool) ($row->is_active ?? true);
            $status = 'void';
            if ($active && $balance > 0) {
                $status = 'active';
            } elseif ($balance <= 0) {
                $status = 'redeemed';
            }

            DB::table('gift_certificates')->insert([
                'code' => (string) $row->number,
                'initial_amount' => round($nominal, 2),
                'balance_amount' => round(max(0, $balance), 2),
                'reserved_amount' => 0,
                'status' => $status,
                'expires_at' => null,
                'sold_order_id' => $row->purchased_order_id ?? null,
                'purchaser_user_id' => null,
                'created_at' => $row->created_at ?? now(),
            ]);
        }
    }

    public function down(): void
    {
        // Не откатываем преобразование данных v2 → legacy.
    }

    private function dropLegacyOrderGiftColumns(): void
    {
        if (!Schema::hasTable('orders')) {
            return;
        }

        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'gift_certificate_id')) {
                $table->dropConstrainedForeignId('gift_certificate_id');
            }
            foreach (['gift_certificate_number', 'gift_certificate_amount'] as $column) {
                if (Schema::hasColumn('orders', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }

    private function renameCartGiftColumnIfNeeded(): void
    {
        if (!Schema::hasTable('carts')) {
            return;
        }

        if (Schema::hasColumn('carts', 'gift_certificate_number') && !Schema::hasColumn('carts', 'gift_certificate_code')) {
            Schema::table('carts', function (Blueprint $table) {
                $table->string('gift_certificate_code', 64)->nullable();
            });
            DB::statement('UPDATE carts SET gift_certificate_code = gift_certificate_number WHERE gift_certificate_number IS NOT NULL');
            Schema::table('carts', function (Blueprint $table) {
                $table->dropColumn('gift_certificate_number');
            });
        }
    }

    private function ensureLedgerTables(): void
    {
        if (!Schema::hasTable('gift_certificate_transactions')) {
            Schema::create('gift_certificate_transactions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('gift_certificate_id')->constrained('gift_certificates')->cascadeOnDelete();
                $table->string('type', 32)->index();
                $table->decimal('amount', 12, 2);
                $table->decimal('balance_before', 12, 2);
                $table->decimal('balance_after', 12, 2);
                $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
                $table->string('cart_token', 64)->nullable()->index();
                $table->json('meta')->nullable();
                $table->timestamp('created_at')->nullable()->useCurrent();
            });
        }

        if (!Schema::hasTable('order_gift_certificates')) {
            Schema::create('order_gift_certificates', function (Blueprint $table) {
                $table->id();
                $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
                $table->foreignId('gift_certificate_id')->constrained('gift_certificates')->cascadeOnDelete();
                $table->string('code_snapshot', 64);
                $table->decimal('amount_applied', 12, 2);
                $table->timestamp('created_at')->nullable()->useCurrent();
            });
        }
    }
};
