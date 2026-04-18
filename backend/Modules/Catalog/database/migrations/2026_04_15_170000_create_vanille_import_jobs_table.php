<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('vanille_import_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('type', 50);
            $table->string('status', 30)->default('pending');
            $table->unsignedTinyInteger('progress')->default(0);
            $table->string('message')->nullable();
            $table->json('result')->nullable();
            $table->text('error')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'created_at']);
            $table->index(['status', 'id'], 'vanille_import_jobs_status_id_index');
            $table->index(['type', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vanille_import_jobs');
    }
};
