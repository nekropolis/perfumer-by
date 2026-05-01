<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'phone')) {
                $table->string('phone', 32)->nullable()->unique()->after('email');
            }

            if (! Schema::hasColumn('users', 'phone_verified_at')) {
                $table->timestamp('phone_verified_at')->nullable()->after('phone');
            }

            if (! Schema::hasColumn('users', 'role')) {
                $table->string('role', 32)->default('customer')->after('phone_verified_at');
            }
        });

        Schema::create('phone_verifications', function (Blueprint $table) {
            $table->id();
            $table->string('phone', 32)->index();
            $table->string('code', 10);
            $table->string('delivery_channel', 16)->nullable();
            $table->string('delivery_status', 32)->nullable();
            $table->string('delivery_provider_message_id', 191)->nullable();
            $table->text('delivery_error')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('verified_at')->nullable();
            $table->timestamps();

            $table->index(['phone', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('phone_verifications');

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'phone_verified_at')) {
                $table->dropColumn('phone_verified_at');
            }

            if (Schema::hasColumn('users', 'phone')) {
                $table->dropUnique('users_phone_unique');
                $table->dropColumn('phone');
            }

            if (Schema::hasColumn('users', 'role')) {
                $table->dropColumn('role');
            }
        });
    }
};
