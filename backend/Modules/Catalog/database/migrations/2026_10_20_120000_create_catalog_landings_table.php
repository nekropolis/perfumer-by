<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_landings', function (Blueprint $table): void {
            $table->id();
            $table->string('slug')->unique();
            $table->string('gender', 32)->nullable();
            $table->text('filters')->nullable();
            $table->string('h1');
            $table->string('seo_title');
            $table->text('seo_description')->nullable();
            $table->longText('content')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_landings');
    }
};
