<?php

namespace Tests\Unit;

use App\Support\LogRedaction;
use PHPUnit\Framework\TestCase;

class LogRedactionTest extends TestCase
{
    public function test_masks_phone_keeping_last_four_digits(): void
    {
        $this->assertSame('***1234', LogRedaction::maskPhone('+375 (29) 111-12-34'));
        $this->assertSame('***1234', LogRedaction::maskPhone('375291111234'));
    }

    public function test_masks_digit_runs_of_seven_or_more(): void
    {
        $this->assertSame(
            'status ok phone ***2233 ref 123456 tail',
            LogRedaction::maskDigitRuns('status ok phone 375291112233 ref 123456 tail'),
        );
    }

    public function test_truncates_by_characters(): void
    {
        $long = str_repeat('а', 120);

        $this->assertSame(100, mb_strlen(LogRedaction::truncate($long, 100)));
        $this->assertSame('коротко', LogRedaction::truncate('коротко', 100));
    }
}
