<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('phone_verifications', function (Blueprint $table) {
            $table->string('delivery_channel', 16)->nullable()->after('code');
            $table->string('delivery_status', 32)->nullable()->after('delivery_channel');
            $table->string('delivery_provider_message_id', 191)->nullable()->after('delivery_status');
            $table->text('delivery_error')->nullable()->after('delivery_provider_message_id');
            $table->timestamp('delivered_at')->nullable()->after('delivery_error');
        });
    }

    public function down(): void
    {
        Schema::table('phone_verifications', function (Blueprint $table) {
            $table->dropColumn([
                'delivery_channel',
                'delivery_status',
                'delivery_provider_message_id',
                'delivery_error',
                'delivered_at',
            ]);
        });
    }
};
