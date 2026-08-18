<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('shop:advance-waiting-discount-delivery-date')
    ->dailyAt('00:01')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer();

Schedule::command('veter:sync-cities')
    ->dailyAt('03:00')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground()
    ->when(fn () => (bool) config('services.veter.enabled'));

Schedule::command('catalog:warm-cache --pages=3')
    ->dailyAt('03:25')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('seo:warm-sitemap')
    ->dailyAt('03:45')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('catalog:refresh-home-recommended')
    ->weeklyOn(1, '04:10')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer();

Schedule::command('catalog:refresh-product-similars --chunk=50')
    ->monthlyOn(1, '04:30')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();

Schedule::command('orders:notify-overdue-delivery')
    ->dailyAt('07:00')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground();

Schedule::command('server:health-report')
    ->dailyAt('07:20')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('server:health-report --weekly')
    ->weeklyOn(1, '09:00')
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('seo:pull-product-ready')
    ->everyTwoMinutes()
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground()
    ->when(fn () => trim((string) config('seo_description.token')) !== '');

Schedule::command('veter:sync-ticket-statuses')
    ->hourly()
    ->timezone('Europe/Minsk')
    ->withoutOverlapping()
    ->onOneServer()
    ->runInBackground()
    ->when(fn () => (bool) config('services.veter.enabled'));
