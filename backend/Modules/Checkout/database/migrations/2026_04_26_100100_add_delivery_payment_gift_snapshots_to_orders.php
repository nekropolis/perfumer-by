<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (!Schema::hasColumn('orders', 'delivery_method')) {
                $table->string('delivery_method', 40)->nullable()->after('comment');
            }
            if (!Schema::hasColumn('orders', 'delivery_city')) {
                $table->string('delivery_city', 255)->nullable()->after('delivery_method');
            }
            if (!Schema::hasColumn('orders', 'delivery_address')) {
                $table->text('delivery_address')->nullable()->after('delivery_city');
            }
            if (!Schema::hasColumn('orders', 'delivery_fee')) {
                $table->decimal('delivery_fee', 12, 2)->default(0)->after('delivery_address');
            }
            if (!Schema::hasColumn('orders', 'payment_method')) {
                $table->string('payment_method', 32)->nullable()->after('delivery_fee');
            }
            if (!Schema::hasColumn('orders', 'gift_certificate_id')) {
                $table->unsignedBigInteger('gift_certificate_id')->nullable()->index()->after('payment_method');
            }
            if (!Schema::hasColumn('orders', 'gift_certificate_code')) {
                $table->string('gift_certificate_code', 64)->nullable()->after('gift_certificate_id');
            }
            if (!Schema::hasColumn('orders', 'gift_certificate_amount')) {
                $table->decimal('gift_certificate_amount', 12, 2)->default(0)->after('gift_certificate_code');
            }
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'gift_certificate_id')) {
                $table->dropColumn('gift_certificate_id');
            }
            foreach ([
                'gift_certificate_code',
                'gift_certificate_amount',
                'payment_method',
                'delivery_fee',
                'delivery_address',
                'delivery_city',
                'delivery_method',
            ] as $col) {
                if (Schema::hasColumn('orders', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
