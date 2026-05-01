<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
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

        Schema::create('discount_cards', function (Blueprint $table) {
            $table->id();
            $table->string('card_number', 64)->unique();
            $table->decimal('discount_percent', 5, 2)->default(3.00);
            $table->string('status', 32)->default('active')->index();
            $table->timestamp('issued_at')->nullable();
            $table->string('owner_name')->nullable();
            $table->string('phone', 64)->nullable();
            $table->text('notes')->nullable();
            $table->decimal('spent_total', 12, 2)->default(0);
            $table->timestamp('last_order_completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('user_discount_cards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('discount_card_id')->constrained('discount_cards')->cascadeOnDelete();
            $table->timestamp('linked_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->boolean('is_primary')->default(false);
            $table->string('source', 32)->default('manager');
            $table->string('link_status', 32)->default('verified')->index();
            $table->timestamps();
            $table->unique(['discount_card_id', 'user_id']);
        });

        Schema::create('discount_card_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('discount_card_id')->constrained('discount_cards')->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('type', 40)->index();
            $table->decimal('order_subtotal', 12, 2)->default(0);
            $table->decimal('discount_percent_before', 5, 2)->default(0);
            $table->decimal('discount_percent_after', 5, 2)->default(0);
            $table->decimal('percent_increment', 5, 2)->default(0);
            $table->timestamps();
        });

        Schema::table('carts', function (Blueprint $table) {
            if (! Schema::hasColumn('carts', 'gift_certificate_code')) {
                $table->string('gift_certificate_code', 64)->nullable()->after('user_id');
            }

            if (! Schema::hasColumn('carts', 'discount_card_number')) {
                $table->string('discount_card_number', 64)->nullable()->after('gift_certificate_code');
            }

            if (! Schema::hasColumn('carts', 'discount_card_session_only')) {
                $table->boolean('discount_card_session_only')->default(false)->after('discount_card_number');
            }
        });

        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'discount_card_id')) {
                $table->foreignId('discount_card_id')->nullable()->after('total')->constrained('discount_cards')->nullOnDelete();
            }
            if (! Schema::hasColumn('orders', 'discount_card_number')) {
                $table->string('discount_card_number', 64)->nullable()->after('discount_card_id');
            }
            if (! Schema::hasColumn('orders', 'discount_percent_snapshot')) {
                $table->decimal('discount_percent_snapshot', 5, 2)->default(0)->after('discount_card_number');
            }
            if (! Schema::hasColumn('orders', 'discount_amount')) {
                $table->decimal('discount_amount', 12, 2)->default(0)->after('discount_percent_snapshot');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'discount_card_id')) {
                $table->dropConstrainedForeignId('discount_card_id');
            }
            foreach (['discount_amount', 'discount_percent_snapshot', 'discount_card_number'] as $column) {
                if (Schema::hasColumn('orders', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('carts', function (Blueprint $table) {
            if (Schema::hasColumn('carts', 'discount_card_session_only')) {
                $table->dropColumn('discount_card_session_only');
            }
            if (Schema::hasColumn('carts', 'discount_card_number')) {
                $table->dropColumn('discount_card_number');
            }
            if (Schema::hasColumn('carts', 'gift_certificate_code')) {
                $table->dropColumn('gift_certificate_code');
            }
        });

        Schema::dropIfExists('order_gift_certificates');
        Schema::dropIfExists('gift_certificate_transactions');
        Schema::dropIfExists('discount_card_transactions');
        Schema::dropIfExists('user_discount_cards');
        Schema::dropIfExists('discount_cards');
        Schema::dropIfExists('gift_certificates');
    }
};
