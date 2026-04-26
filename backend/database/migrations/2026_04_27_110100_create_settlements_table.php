<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settlements', function (Blueprint $table) {
            $table->id();

            $table->string('osm_type', 20); // node / way / relation
            $table->unsignedBigInteger('osm_id');

            $table->string('country_code', 2)->default('BY');

            $table->string('name'); // русское название для сайта
            $table->string('name_be')->nullable();
            $table->string('name_ru')->nullable();
            $table->string('name_en')->nullable();
            $table->string('int_name')->nullable();

            $table->string('name_prefix')->nullable(); // хутор / деревня / агрогородок
            $table->string('place')->nullable(); // city / town / village / hamlet / isolated_dwelling

            $table->string('region_name')->nullable(); // addr:region
            $table->string('district_name')->nullable(); // addr:district
            $table->string('subdistrict_name')->nullable(); // addr:subdistrict

            $table->string('postcode')->nullable();

            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();

            $table->string('wikidata')->nullable();
            $table->string('wikipedia')->nullable();

            $table->json('osm_tags')->nullable();

            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['osm_type', 'osm_id']);

            $table->index(['country_code', 'is_active']);
            $table->index(['name']);
            $table->index(['name_ru']);
            $table->index(['name_be']);
            $table->index(['place']);
            $table->index(['region_name']);
            $table->index(['district_name']);
            $table->index(['subdistrict_name']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settlements');
    }
};
