<?php

namespace Tests\Feature;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Schema;
use Illuminate\Testing\TestResponse;
use Modules\BatchCode\Models\BatchCodeSubmission;
use Modules\Catalog\Models\Brand;
use Modules\Users\Enums\Role;
use Modules\Users\Models\User;
use Tests\TestCase;

class BatchCodeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->skipUnlessSqliteDriver();
        Carbon::setTestNow('2026-10-20 12:00:00');
        $this->createSchema();
        $this->seedBrands();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        if ($this->sqliteDriverAvailable()) {
            Schema::dropIfExists('batch_code_submissions');
            Schema::dropIfExists('brands');
            Schema::dropIfExists('users');
        }

        parent::tearDown();
    }

    public function test_brands_lists_only_brands_with_a_supported_rule(): void
    {
        $response = $this->getJson('/api/batch-code/brands')->assertOk();
        $rows = $response->json('data');

        $this->assertSame([
            'chanel',
            'christian-dior',
            'clarins',
            'dior',
            'estee-lauder',
            'giorgio-armani',
            'givenchy',
            'lancome',
            'versace',
            'yves-saint-laurent',
        ], array_column($rows, 'slug'));

        $bySlug = collect($rows)->keyBy('slug');
        $this->assertSame('Chanel', $bySlug['chanel']['name']);
        $this->assertSame('format_recognized', $bySlug['chanel']['support']);
        $this->assertSame('approximate', $bySlug['versace']['support']);
        $this->assertSame('approximate', $bySlug['dior']['support']);
        $this->assertSame('manufacturer_portal', $bySlug['clarins']['support']);
        $this->assertArrayNotHasKey('clinique', $bySlug);
    }

    public function test_check_approximate_dates_and_ambiguous_candidates(): void
    {
        $versace = $this->check('versace', '15 234-56')->assertOk()->json('data');
        $this->assertDataShape($versace);
        $this->assertSame('approximate', $versace['status']);
        $this->assertSame('1523456', $versace['code_normalized']);
        $this->assertSame('low', $versace['confidence']);
        $this->assertSame('versace-euroitalia', $versace['rule_id']);
        $this->assertSame('year', $versace['result']['precision']);
        $this->assertSame('2015-01', $versace['result']['date_from']);
        $this->assertSame('2015-12', $versace['result']['date_to']);
        $this->assertSame(['2015'], $versace['result']['candidates']);

        $oldVersace = $this->check('versace', '618105')->assertOk()->json('data');
        $this->assertSame(['2006'], $oldVersace['result']['candidates']);

        $ambiguousVersace = $this->check('versace', '03072M')->assertOk()->json('data');
        $this->assertSame('year', $ambiguousVersace['result']['precision']);
        $this->assertSame(['2010', '2020'], $ambiguousVersace['result']['candidates']);
        $this->assertSame('2010-01', $ambiguousVersace['result']['date_from']);
        $this->assertSame('2020-12', $ambiguousVersace['result']['date_to']);

        $futureVersace = $this->check('versace', '2712345')->assertOk()->json('data');
        $this->assertSame('format_recognized', $futureVersace['status']);
        $this->assertNull($futureVersace['result']);
        $this->assertStringNotContainsString('2027', json_encode($futureVersace, JSON_UNESCAPED_UNICODE));

        $dior = $this->check('dior', '0t-02')->assertOk()->json('data');
        $this->assertSame('0T02', $dior['code_normalized']);
        $this->assertSame('medium', $dior['confidence']);
        $this->assertSame('month', $dior['result']['precision']);
        $this->assertSame(['2010-06'], $dior['result']['candidates']);
        $this->assertSame('lvmh-dior', $dior['rule_id']);

        $cyrillic = $this->check('dior', '0Т02')->assertOk()->json('data');
        $this->assertSame('0T02', $cyrillic['code_normalized']);
        $this->assertSame(['2010-06'], $cyrillic['result']['candidates']);

        $diorAlias = $this->check('christian-dior', '0T02')->assertOk()->json('data');
        $this->assertSame(['2010-06'], $diorAlias['result']['candidates']);

        $twoDecades = $this->check('dior', '8A01')->assertOk()->json('data');
        $this->assertSame(['1998-01', '2018-01'], $twoDecades['result']['candidates']);
        $this->assertSame('1998-01', $twoDecades['result']['date_from']);
        $this->assertSame('2018-01', $twoDecades['result']['date_to']);

        $boundary = $this->check('dior', '7M01')->assertOk()->json('data');
        $this->assertSame(['2007-12'], $boundary['result']['candidates']);

        $givenchy = $this->check('givenchy', '0F01')->assertOk()->json('data');
        $this->assertSame(['2020-06'], $givenchy['result']['candidates']);

        $givenchyTwo = $this->check('givenchy', '2F01')->assertOk()->json('data');
        $this->assertSame(['2002-06', '2022-06'], $givenchyTwo['result']['candidates']);

        $givenchy2018 = $this->check('givenchy', '8L01')->assertOk()->json('data');
        $this->assertSame(['2018-11'], $givenchy2018['result']['candidates']);

        $lauder = $this->check('estee-lauder', 'B34')->assertOk()->json('data');
        $this->assertSame('month', $lauder['result']['precision']);
        $this->assertSame(['1994-03', '2004-03', '2014-03', '2024-03'], $lauder['result']['candidates']);
        $this->assertSame('1994-03', $lauder['result']['date_from']);
        $this->assertSame('2024-03', $lauder['result']['date_to']);

        $armani = $this->check('giorgio-armani', '38E')->assertOk()->json('data');
        $this->assertSame('year', $armani['result']['precision']);
        $this->assertSame(['2008'], $armani['result']['candidates']);
        $this->assertSame('2008-01', $armani['result']['date_from']);
        $this->assertSame('2008-12', $armani['result']['date_to']);

        $armaniEnd = $this->check('giorgio-armani', '38R99')->assertOk()->json('data');
        $this->assertSame(['2018'], $armaniEnd['result']['candidates']);

        $armaniUnknown = $this->check('giorgio-armani', '38S99')->assertOk()->json('data');
        $this->assertSame('format_recognized', $armaniUnknown['status']);
        $this->assertNull($armaniUnknown['result']);
        $this->assertStringNotContainsString('2019', json_encode($armaniUnknown['result']));

        $ysl = $this->check('yves-saint-laurent', '62H100')->assertOk()->json('data');
        $this->assertSame(['2011'], $ysl['result']['candidates']);
        $this->assertStringNotContainsString('2008', json_encode($ysl, JSON_UNESCAPED_UNICODE));

        $yslDigit = $this->check('yves-saint-laurent', '9KBA')->assertOk()->json('data');
        $this->assertSame(['2009'], $yslDigit['result']['candidates']);

        $yslEarlyLetter = $this->check('yves-saint-laurent', '38E100')->assertOk()->json('data');
        $this->assertSame('format_recognized', $yslEarlyLetter['status']);
        $this->assertNull($yslEarlyLetter['result']);

        $lancome = $this->check('lancome', '38L')->assertOk()->json('data');
        $this->assertSame(['2014'], $lancome['result']['candidates']);
    }

    public function test_check_format_portal_unsupported_and_invalid_format(): void
    {
        $chanel = $this->check('chanel', '8301')->assertOk()->json('data');
        $this->assertSame('format_recognized', $chanel['status']);
        $this->assertSame('low', $chanel['confidence']);
        $this->assertNull($chanel['result']);
        $this->assertNull($chanel['official_url']);
        $this->assertSame('chanel-fr-4digit', $chanel['rule_id']);
        $encodedChanel = json_encode($chanel, JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('2014', $encodedChanel);
        $this->assertStringNotContainsString('2006', $encodedChanel);

        $clarins = $this->check('clarins', '0422085')->assertOk()->json('data');
        $this->assertSame('manufacturer_portal', $clarins['status']);
        $this->assertNull($clarins['result']);
        $this->assertNull($clarins['confidence']);
        $this->assertSame('https://traceability.trust.clarins.com/en_US', $clarins['official_url']);
        $this->assertStringContainsString('парфюм', mb_strtolower((string) $clarins['period_note']));

        $unsupported = $this->check('clinique', 'K61')->assertOk()->json('data');
        $this->assertSame('not_supported', $unsupported['status']);
        $this->assertSame('Clinique', $unsupported['brand']['name']);
        $this->assertNull($unsupported['result']);
        $this->assertNull($unsupported['rule_id']);
        $this->assertSame([], $unsupported['sources']);

        $invalid = $this->check('dior', '36M')->assertOk()->json('data');
        $this->assertSame('invalid_format', $invalid['status']);
        $this->assertNull($invalid['result']);
        $this->assertSame('lvmh-dior', $invalid['rule_id']);

        $letterI = $this->check('dior', '8I01')->assertOk()->json('data');
        $this->assertSame('invalid_format', $letterI['status']);

        $this->check('dior', '4601234567890')->assertOk()->assertJsonPath('data.status', 'invalid_format');
    }

    public function test_check_rejects_invalid_input(): void
    {
        $this->postJson('/api/batch-code/check', [
            'brand_slug' => 'not-a-brand',
            'code' => '0T02',
        ])->assertUnprocessable()->assertJsonValidationErrors('brand_slug');

        $this->postJson('/api/batch-code/check', [
            'brand_slug' => 'dior',
            'code' => 'x',
        ])->assertUnprocessable()->assertJsonValidationErrors('code');

        $this->postJson('/api/batch-code/check', [
            'brand_slug' => 'dior',
            'code' => 'bad_code',
        ])->assertUnprocessable()->assertJsonValidationErrors('code');

        $this->postJson('/api/batch-code/check', [
            'brand_slug' => 'dior',
            'code' => 'АВ12#',
        ])->assertUnprocessable()->assertJsonValidationErrors('code');

        $this->postJson('/api/batch-code/check', [
            'code' => '0T02',
        ])->assertUnprocessable()->assertJsonValidationErrors('brand_slug');
    }

    public function test_check_is_logged_without_personal_data(): void
    {
        Event::fake([MessageLogged::class]);

        $this->check('versace', '1523456')->assertOk();

        Event::assertDispatched(MessageLogged::class, function (MessageLogged $event): bool {
            return $event->level === 'info'
                && $event->message === 'batch_code.check'
                && $event->context === [
                    'status' => 'approximate',
                    'brand_slug' => 'versace',
                    'rule_id' => 'versace-euroitalia',
                ];
        });
    }

    public function test_submission_requires_consent_and_stores_a_hashed_ip(): void
    {
        $this->postJson('/api/batch-code/submissions', [
            'brand_slug' => 'chanel',
            'code' => '8301',
            'printed_date' => '2026-10',
            'date_kind' => 'production',
        ])->assertUnprocessable()->assertJsonValidationErrors('consent');

        $this->postJson('/api/batch-code/submissions', [
            'brand_slug' => 'chanel',
            'code' => '8301',
            'printed_date' => '2026-10',
            'date_kind' => 'production',
            'consent' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors('consent');

        $this->postJson('/api/batch-code/submissions', [
            'brand_slug' => 'chanel',
            'code' => '8301',
            'printed_date' => '2026-13',
            'date_kind' => 'production',
            'consent' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors('printed_date');

        $this->postJson('/api/batch-code/submissions', [
            'brand_slug' => 'missing-brand',
            'code' => '8301',
            'printed_date' => '2026-10',
            'date_kind' => 'production',
            'consent' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors('brand_slug');

        $created = $this->withHeader('User-Agent', 'BatchTest/1.0')
            ->postJson('/api/batch-code/submissions', [
                'brand_slug' => 'clinique',
                'code' => 'ab-12',
                'printed_date' => '2026-10',
                'date_kind' => 'expiry',
                'consent' => true,
            ]);

        $created->assertCreated();
        $this->assertSame(['id', 'status'], array_keys($created->json('data')));
        $this->assertSame('pending', $created->json('data.status'));

        $row = BatchCodeSubmission::query()->firstOrFail();
        $this->assertSame('clinique', $row->brand_slug);
        $this->assertSame('ab-12', $row->code);
        $this->assertSame('AB12', $row->code_normalized);
        $this->assertSame('2026-10-01', $row->printed_date?->toDateString());
        $this->assertSame('expiry', $row->date_kind);
        $this->assertNull($row->email);
        $this->assertSame('pending', $row->status);
        $this->assertSame('BatchTest/1.0', $row->user_agent);
        $this->assertSame(BatchCodeSubmission::hashIp('127.0.0.1'), $row->ip_hash);
        $this->assertNotSame('127.0.0.1', $row->ip_hash);
        $this->assertStringNotContainsString('127.0.0.1', json_encode($row->getAttributes()));

        $this->postJson('/api/batch-code/submissions', [
            'brand_slug' => 'chanel',
            'code' => '8301',
            'printed_date' => '2026-10-20',
            'date_kind' => 'production',
            'consent' => true,
            'email' => 'buyer@example.com',
        ])->assertCreated();

        $day = BatchCodeSubmission::query()->where('brand_slug', 'chanel')->firstOrFail();
        $this->assertSame('2026-10-20', $day->printed_date?->toDateString());
        $this->assertSame('production', $day->date_kind);
        $this->assertSame('buyer@example.com', $day->email);
    }

    public function test_admin_lists_and_updates_submission_status(): void
    {
        $this->postJson('/api/batch-code/submissions', [
            'brand_slug' => 'chanel',
            'code' => '8301',
            'printed_date' => '2026-10',
            'date_kind' => 'production',
            'consent' => true,
        ])->assertCreated();

        $this->getJson('/api/admin/batch-code/submissions')->assertUnauthorized();

        $manager = $this->userWithRole(Role::MANAGER);
        $this->actingAs($manager, 'sanctum');
        $this->getJson('/api/admin/batch-code/submissions')->assertForbidden();

        $admin = $this->userWithRole(Role::ADMIN);
        $this->actingAs($admin, 'sanctum');

        $id = BatchCodeSubmission::query()->value('id');
        $this->getJson('/api/admin/batch-code/submissions')
            ->assertOk()
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.status', 'pending')
            ->assertJsonPath('data.0.brand_slug', 'chanel');

        $this->patchJson('/api/admin/batch-code/submissions/'.$id, [
            'status' => 'accepted',
        ])->assertOk()->assertJsonPath('data.status', 'accepted');

        $this->assertDatabaseHas('batch_code_submissions', [
            'id' => $id,
            'status' => 'accepted',
        ]);

        $this->patchJson('/api/admin/batch-code/submissions/'.$id, [
            'status' => 'published',
        ])->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    /**
     * @return array<string, mixed>
     */
    private function check(string $slug, string $code): TestResponse
    {
        return $this->postJson('/api/batch-code/check', [
            'brand_slug' => $slug,
            'code' => $code,
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function assertDataShape(array $data): void
    {
        $this->assertSame(
            ['status', 'brand', 'code_normalized', 'result', 'confidence', 'period_note', 'official_url', 'rule_id', 'sources'],
            array_keys($data),
        );
        $this->assertSame(['slug', 'name'], array_keys($data['brand']));
        if (is_array($data['result'])) {
            $this->assertSame(['date_from', 'date_to', 'precision', 'candidates'], array_keys($data['result']));
        }
        $blob = mb_strtolower((string) json_encode($data, JSON_UNESCAPED_UNICODE));
        $this->assertStringNotContainsString('оригинал', $blob);
        $this->assertStringNotContainsString('поддел', $blob);
        $this->assertStringNotContainsString('официальн', $blob);
    }

    private function userWithRole(Role $role): Authenticatable
    {
        $user = User::query()->create([
            'name' => 'User',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password',
            'role' => $role->value,
        ]);
        assert($user instanceof Authenticatable);

        return $user;
    }

    private function seedBrands(): void
    {
        $rows = [
            'versace' => 'Versace',
            'chanel' => 'Chanel',
            'christian-dior' => 'Christian Dior',
            'dior' => 'Dior',
            'givenchy' => 'Givenchy',
            'estee-lauder' => 'Estee Lauder',
            'giorgio-armani' => 'Giorgio Armani',
            'yves-saint-laurent' => 'Yves Saint Laurent',
            'lancome' => 'Lancome',
            'clarins' => 'Clarins',
            'clinique' => 'Clinique',
        ];
        Brand::withoutEvents(function () use ($rows): void {
            foreach ($rows as $slug => $name) {
                Brand::query()->create([
                    'name' => $name,
                    'slug' => $slug,
                    'is_active' => true,
                ]);
            }
        });
    }

    private function createSchema(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('email')->unique();
            $table->string('password');
            $table->string('role');
            $table->string('phone')->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        Schema::create('brands', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $migration = require base_path('Modules/BatchCode/database/migrations/2026_10_20_130000_create_batch_code_submissions_table.php');
        $migration->up();
    }
}
