<?php

namespace Tests\Feature;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\Reviews\Models\Review;
use Modules\Reviews\Services\PublishedProductReviewsService;
use Tests\TestCase;

/**
 * Агрегаты рейтинга считаются по всем опубликованным отзывам товара, а не по ограниченному списку.
 */
class PublishedProductReviewsStatsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();

        Schema::create('reviews', function (Blueprint $table): void {
            $table->id();
            $table->string('type', 32);
            $table->unsignedBigInteger('product_id')->nullable();
            $table->string('name', 120);
            $table->text('body');
            $table->unsignedTinyInteger('stars');
            $table->string('status', 32)->default('published');
            $table->timestamp('published_at')->nullable();
            $table->text('reply_text')->nullable();
            $table->timestamp('replied_at')->nullable();
            $table->timestamps();
        });
    }

    protected function tearDown(): void
    {
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('reviews');
        }

        parent::tearDown();
    }

    public function test_stats_cover_all_published_reviews_beyond_list_limit(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->insertReview(10, Review::TYPE_PRODUCT, $i < 30 ? 5 : 4);
        }
        $this->insertReview(10, Review::TYPE_PRODUCT, 1, Review::STATUS_PENDING);
        $this->insertReview(11, Review::TYPE_PRODUCT, 1);
        $this->insertReview(null, Review::TYPE_STORE, 1);

        $service = new PublishedProductReviewsService();

        $this->assertCount(50, $service->listForProduct(10));
        $this->assertSame(['total' => 60, 'average' => 4.5], $service->statsForProduct(10));
    }

    public function test_stats_are_empty_without_published_reviews(): void
    {
        $service = new PublishedProductReviewsService();

        $this->assertSame(['total' => 0, 'average' => null], $service->statsForProduct(99));
        $this->assertSame(['total' => 0, 'average' => null], $service->statsForProduct(0));
    }

    private function insertReview(?int $productId, string $type, int $stars, string $status = Review::STATUS_PUBLISHED): void
    {
        DB::table('reviews')->insert([
            'type' => $type,
            'product_id' => $productId,
            'name' => 'Тест',
            'body' => 'Текст отзыва для проверки',
            'stars' => $stars,
            'status' => $status,
            'published_at' => $status === Review::STATUS_PUBLISHED ? now() : null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
