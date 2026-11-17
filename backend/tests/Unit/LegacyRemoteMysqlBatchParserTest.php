<?php

namespace Tests\Unit;

use Modules\ImportExport\Services\Legacy\LegacyRemoteMysqlClient;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

class LegacyRemoteMysqlBatchParserTest extends TestCase
{
    public function test_newline_inside_field_stays_one_row(): void
    {
        $output = implode("\n", [
            "order_id\tfirstname\tlastname\tcomment\ttotal\tcurrency_code\tcurrency_value",
            "14593\t\t\t305\r\\n447850776, для карты\t279.0000\tBYN\t1.00000000",
            '',
        ]);

        $rows = $this->parse($output);

        $this->assertCount(1, $rows);
        $this->assertSame('14593', $rows[0]['order_id']);
        $this->assertSame("305\r\n447850776, для карты", $rows[0]['comment']);
        $this->assertSame('', $rows[0]['firstname']);
        $this->assertSame('BYN', $rows[0]['currency_code']);
        $this->assertSame('1.00000000', $rows[0]['currency_value']);
    }

    public function test_tab_backslash_null_and_quotes_stay_inside_fields(): void
    {
        $output = "name\tnote\tv\nhello\\tworld\ta\\\\b\t\\012\n\\N\t\\\\N\tsay \"hi\"\n";

        $rows = $this->parse($output);

        $this->assertCount(2, $rows);
        $this->assertSame("hello\tworld", $rows[0]['name']);
        $this->assertSame('a\\b', $rows[0]['note']);
        $this->assertSame("\0"."12", $rows[0]['v']);
        $this->assertNull($rows[1]['name']);
        $this->assertSame('\\N', $rows[1]['note']);
        $this->assertSame('say "hi"', $rows[1]['v']);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function parse(string $output): array
    {
        $method = new ReflectionMethod(LegacyRemoteMysqlClient::class, 'parseMysqlBatchOutput');
        $rows = $method->invoke(new LegacyRemoteMysqlClient(), $output);

        return json_decode(json_encode($rows->all(), JSON_THROW_ON_ERROR), true);
    }
}
