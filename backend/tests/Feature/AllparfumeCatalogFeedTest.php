<?php

namespace Tests\Feature;

use Illuminate\Http\UploadedFile;
use Modules\ImportExport\Services\Allparfume\AllparfumeIdFileImportService;
use Tests\TestCase;

class AllparfumeCatalogFeedTest extends TestCase
{
    public function test_it_returns_404_without_token(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);

        $this->getJson('/api/feeds/allparfume.json')
            ->assertNotFound();
    }

    public function test_it_returns_404_with_wrong_token(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);

        $this->getJson('/api/feeds/allparfume.json?token=wrong')
            ->assertNotFound();
    }

    public function test_it_returns_404_when_token_is_not_configured(): void
    {
        config(['services.allparfume.feed_token' => '']);

        $this->getJson('/api/feeds/allparfume.json?token=anything')
            ->assertNotFound();
    }

    public function test_post_returns_404_without_token(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);

        $this->postJson('/api/feeds/allparfume.json', ['items' => [$this->sampleItem()]])
            ->assertNotFound();
    }

    public function test_post_returns_404_with_wrong_token(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);

        $this->postJson('/api/feeds/allparfume.json?token=wrong', ['items' => [$this->sampleItem()]])
            ->assertNotFound();
    }

    public function test_post_imports_json_items_with_token(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);
        $this->bindImportService();

        $this->postJson('/api/feeds/allparfume.json?token=secret-feed-token', [
            'items' => [$this->sampleItem()],
        ])
            ->assertOk()
            ->assertJsonPath('stats.updated', 1);
    }

    public function test_post_imports_json_items_with_perfumer_url_array(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);
        $this->bindImportService();

        $this->postJson('/api/feeds/allparfume.json?token=secret-feed-token', [
            'items' => [[
                'perfumer_url' => [
                    'https://perfumer.by/chanel-pour-monsieur',
                    'https://perfumer.by/chanel-pour-monsieur-eau-de-toilette',
                ],
                'allparfume_url' => 'https://allparfume.by/chanel/pour_monsieur.html',
                'allparfume_id' => 695,
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('stats.updated', 1);
    }

    public function test_post_imports_json_array_body(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);
        $this->bindImportService();

        $this->postJson('/api/feeds/allparfume.json?token=secret-feed-token', [
            $this->sampleItem(),
        ])
            ->assertOk()
            ->assertJsonPath('stats.updated', 1);
    }

    public function test_post_imports_uploaded_json_file(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);
        $this->bindImportService();

        $file = UploadedFile::fake()->createWithContent(
            'ids.json',
            json_encode(['items' => [$this->sampleItem()]], JSON_THROW_ON_ERROR),
        );

        $this->post('/api/feeds/allparfume.json?token=secret-feed-token', [
            'file' => $file,
        ])
            ->assertOk()
            ->assertJsonPath('stats.updated', 1);
    }

    public function test_post_rejects_empty_items(): void
    {
        config(['services.allparfume.feed_token' => 'secret-feed-token']);

        $this->postJson('/api/feeds/allparfume.json?token=secret-feed-token', [
            'items' => [],
        ])
            ->assertUnprocessable();
    }

    /**
     * @return array{perfumer_url: string, allparfume_url: string, allparfume_id: int}
     */
    private function sampleItem(): array
    {
        return [
            'perfumer_url' => 'https://perfumer.by/dior-sauvage',
            'allparfume_url' => 'https://allparfume.by/christian_dior/sauvage.html',
            'allparfume_id' => 3597,
        ];
    }

    private function bindImportService(): void
    {
        $import = $this->createMock(AllparfumeIdFileImportService::class);
        $import->expects($this->once())->method('import')->willReturn([
            'updated' => 1,
            'unmatched_slug' => 0,
            'unmatched_allparfume_url' => 0,
            'unmatched_slug_samples' => [],
            'unmatched_allparfume_url_samples' => [],
        ]);
        $this->app->instance(AllparfumeIdFileImportService::class, $import);
    }
}
