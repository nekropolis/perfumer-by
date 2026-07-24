<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('settlements');
    }

    public function down(): void
    {
        // OSM settlements reference removed; restore from create_settlements_table migration if needed.
    }
};
