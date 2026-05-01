<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cms_posts', function (Blueprint $table) {
            $table->string('slug', 191)->nullable()->after('title');
        });

        $used = [];
        $rows = DB::table('cms_posts')->orderBy('id')->get(['id', 'title', 'type']);
        foreach ($rows as $row) {
            $base = Str::slug((string) $row->title);
            if ($base === '') {
                $base = 'post';
            }
            $type = (string) $row->type;
            $slug = $base;
            $n = 2;
            while (isset($used["{$type}|{$slug}"])) {
                $slug = $base.'-'.$n++;
            }
            $used["{$type}|{$slug}"] = true;
            DB::table('cms_posts')->where('id', $row->id)->update(['slug' => $slug]);
        }

        Schema::table('cms_posts', function (Blueprint $table) {
            $table->unique(['type', 'slug']);
        });
    }

    public function down(): void
    {
        Schema::table('cms_posts', function (Blueprint $table) {
            $table->dropUnique(['type', 'slug']);
            $table->dropColumn('slug');
        });
    }
};
