<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('incoming_call_devices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('manager_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('label', 100);
            $table->unsignedBigInteger('personal_access_token_id')->nullable()->index();
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('incoming_call_devices');
    }
};
