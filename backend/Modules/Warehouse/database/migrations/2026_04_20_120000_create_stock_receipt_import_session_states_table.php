<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_receipt_import_session_states', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();
            $table->uuid('session_id')->nullable()->index();
            $table->unsignedBigInteger('warehouse_id')->nullable();
            $table->unsignedBigInteger('supplier_id')->nullable();
            $table->string('received_at', 40)->nullable();
            $table->string('comment', 500)->nullable();
            $table->unsignedInteger('parsed_total_rows')->nullable();
            $table->unsignedBigInteger('linked_draft_receipt_id')->nullable();
            $table->json('unresolved')->nullable();
            $table->json('mapping_by_key')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'updated_at'], 'stock_receipt_import_states_user_updated_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_receipt_import_session_states');
    }
};

