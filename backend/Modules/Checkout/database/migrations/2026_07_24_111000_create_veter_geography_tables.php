<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('veter_tracks', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'name']);
        });

        Schema::create('veter_districts', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->unsignedTinyInteger('monday')->default(0);
            $table->unsignedTinyInteger('tuesday')->default(0);
            $table->unsignedTinyInteger('wednesday')->default(0);
            $table->unsignedTinyInteger('thursday')->default(0);
            $table->unsignedTinyInteger('friday')->default(0);
            $table->unsignedTinyInteger('saturday')->default(0);
            $table->unsignedTinyInteger('sunday')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'name']);
        });

        Schema::create('veter_cities', function (Blueprint $table) {
            $table->unsignedBigInteger('id')->primary();
            $table->string('name');
            $table->unsignedBigInteger('region_id')->nullable();
            $table->unsignedBigInteger('district_id')->nullable();
            $table->string('village_council_name')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['is_active', 'name']);
            $table->index('region_id');
            $table->index('district_id');
            $table->index('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('veter_cities');
        Schema::dropIfExists('veter_districts');
        Schema::dropIfExists('veter_tracks');
    }
};
