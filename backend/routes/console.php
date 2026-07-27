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
    ->onOneServer();

Schedule::command('catalog:warm-cache --pages=3')
    ->dailyAt('03:30')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('veter:sync-cities')
    ->dailyAt('03:10')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground()
    ->when(fn () => (bool) config('services.veter.enabled'));

Schedule::command('orders:notify-overdue-delivery')
    ->dailyAt('06:00')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();

Schedule::command('veter:sync-ticket-statuses')
    ->hourly()
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground()
    ->when(fn () => (bool) config('services.veter.enabled'));
