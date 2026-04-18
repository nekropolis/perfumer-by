<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('vanille_import_job_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vanille_import_job_id')->constrained('vanille_import_jobs')->cascadeOnDelete();
            $table->string('level', 20)->default('info');
            $table->text('message');
            $table->json('context')->nullable();
            $table->timestamps();

            $table->index(['vanille_import_job_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vanille_import_job_logs');
    }
};
