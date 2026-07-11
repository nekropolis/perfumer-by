<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('server:health-report')
    ->dailyAt('07:00')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('server:health-report --weekly')
    ->weeklyOn(1, '09:00')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('shop:advance-waiting-discount-delivery-date')
    ->dailyAt('00:01')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->runInBackground();
