<?php

namespace Modules\Catalog\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Modules\Catalog\Models\VanilleImportJob;
use Modules\ImportExport\Services\Vanille\VanilleImportService;

class VanilleImportQueueCommand extends Command
{
    protected $signature = 'catalog:vanille-queue
        {action=status : status|run-pending|resume}
        {--job-id= : Explicit VanilleImportJob id for run-pending/resume}';

    protected $description = 'Диагностика и восстановление очереди импорта Vanille';

    public function handle(VanilleImportService $service): int
    {
        return match ($this->argument('action')) {
            'status' => $this->showStatus(),
            'run-pending' => $this->runPending($service),
            'resume' => $this->resume($service),
            default => $this->fail('Unknown action: ' . $this->argument('action')),
        };
    }

    protected function showStatus(): int
    {
        $connection = (string) config('queue.default');
        $queueName = (string) (config('queue.connections.' . $connection . '.queue') ?? 'default');

        $this->info('Queue connection: ' . $connection);
        $this->info('Default queue name: ' . $queueName);

        if ($connection === 'database') {
            $jobsTable = (string) (config('queue.connections.database.table') ?? 'jobs');
            try {
                $pending = DB::table($jobsTable)->count();
                $this->line("Таблица {$jobsTable}: {$pending} записей.");
            } catch (\Throwable $e) {
                $this->warn("Не удалось прочитать {$jobsTable}: " . $e->getMessage());
            }

            try {
                $failed = DB::table('failed_jobs')->count();
                $this->line("Таблица failed_jobs: {$failed} записей.");
            } catch (\Throwable $e) {
                $this->warn('Не удалось прочитать failed_jobs: ' . $e->getMessage());
            }
        } elseif ($connection === 'null') {
            $this->error('QUEUE_CONNECTION=null — все dispatch-и молча теряются. Поставь database или redis.');
        } elseif ($connection === 'sync') {
            $this->warn('QUEUE_CONNECTION=sync — задачи выполняются синхронно в процессе диспатча.');
        }

        $this->newLine();
        $this->info('Последние VanilleImportJob:');
        $rows = VanilleImportJob::query()->orderByDesc('id')->limit(10)->get([
            'id', 'type', 'status', 'progress', 'started_at', 'finished_at', 'updated_at',
        ]);

        if ($rows->isEmpty()) {
            $this->line('— пусто.');
            return self::SUCCESS;
        }

        $this->table(
            ['id', 'type', 'status', 'progress', 'started_at', 'finished_at', 'updated_at'],
            $rows->map(fn ($r) => [
                $r->id,
                $r->type,
                $r->status,
                $r->progress,
                (string) $r->started_at,
                (string) $r->finished_at,
                (string) $r->updated_at,
            ])->all(),
        );

        $active = VanilleImportJob::query()
            ->whereIn('status', ['pending', 'running'])
            ->orderByDesc('id')
            ->first();

        if ($active) {
            $this->warn("Активная задача: id={$active->id}, status={$active->status}.");
            $this->line('Запусти синхронно: php artisan catalog:vanille-queue run-pending');
        }

        return self::SUCCESS;
    }

    protected function runPending(VanilleImportService $service): int
    {
        $jobId = $this->option('job-id');

        if ($jobId === null) {
            $job = VanilleImportJob::query()
                ->whereIn('status', ['pending', 'running'])
                ->orderByDesc('id')
                ->first();
        } else {
            $job = VanilleImportJob::query()->find((int) $jobId);
        }

        if (!$job) {
            $this->warn('Активная задача не найдена.');
            return self::SUCCESS;
        }

        $this->info("Запускаю синхронно VanilleImportJob id={$job->id} (type={$job->type}, status={$job->status}).");

        try {
            $result = $service->runJobToCompletionSync($job->id);
        } catch (\Throwable $e) {
            $this->error('Ошибка выполнения: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->line(sprintf(
            'Финал: status=%s, progress=%d%%, message=%s',
            $result->status,
            (int) $result->progress,
            (string) $result->message,
        ));

        return $result->status === 'completed' ? self::SUCCESS : self::FAILURE;
    }

    /**
     * Возобновляет импорт с того offset'а, на котором он остановился.
     * Работает в том числе для джобов в статусе failed / completed=false / running со stale updated_at.
     * Сохранённое result.state.offset не трогаем — оттуда и продолжится.
     */
    protected function resume(VanilleImportService $service): int
    {
        $jobId = $this->option('job-id');

        if ($jobId === null) {
            // Последний не-completed джоб — он и есть кандидат на резюм.
            $job = VanilleImportJob::query()
                ->whereIn('status', ['pending', 'running', 'failed'])
                ->orderByDesc('id')
                ->first();
        } else {
            $job = VanilleImportJob::query()->find((int) $jobId);
        }

        if (!$job) {
            $this->warn('Джоб для возобновления не найден.');
            return self::SUCCESS;
        }

        if ($job->status === 'completed') {
            $this->info("Джоб id={$job->id} уже завершён (completed). Возобновлять нечего.");
            return self::SUCCESS;
        }

        $state = is_array($job->result['state'] ?? null) ? $job->result['state'] : [];
        $offset = (int) ($state['offset'] ?? 0);

        $this->info(sprintf(
            'Возобновляю джоб id=%d (type=%s, был в статусе %s, offset=%d).',
            $job->id,
            $job->type,
            $job->status,
            $offset,
        ));

        // Переводим в pending, чтобы runQueuedJob не отскочил по защите "terminal_status_skip".
        $job->update([
            'status' => 'pending',
            'error' => null,
            'finished_at' => null,
            'message' => sprintf(
                '%s: возобновление с offset=%d',
                $job->message ?: 'Импорт Vanille',
                $offset,
            ),
        ]);

        try {
            $result = $service->runJobToCompletionSync($job->id);
        } catch (\Throwable $e) {
            $this->error('Ошибка возобновления: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->line(sprintf(
            'Финал: status=%s, progress=%d%%, message=%s',
            $result->status,
            (int) $result->progress,
            (string) $result->message,
        ));

        return $result->status === 'completed' ? self::SUCCESS : self::FAILURE;
    }
}
