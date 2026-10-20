<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batch_code_submissions', function (Blueprint $table): void {
            $table->id();
            $table->string('brand_slug');
            $table->string('code', 20);
            $table->string('code_normalized', 20);
            $table->date('printed_date');
            $table->string('date_kind', 16);
            $table->string('email')->nullable();
            $table->char('ip_hash', 64);
            $table->string('user_agent', 512)->nullable();
            $table->string('status', 16)->default('pending');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batch_code_submissions');
    }
};
