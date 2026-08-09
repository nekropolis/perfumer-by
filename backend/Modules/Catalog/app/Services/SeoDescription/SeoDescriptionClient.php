<?php

namespace Modules\Catalog\Services\SeoDescription;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Throwable;

class SeoDescriptionClient
{
    /** @var list<string> */
    private const STATUSES = ['pending', 'researching', 'generating', 'completed', 'failed'];

    /**
     * @param  array<string, mixed>  $payload
     * @return array{job_id: string, status: string}
     */
    public function dispatch(array $payload): array
    {
        try {
            $response = $this->request()->post('generate', $payload);
        } catch (SeoDescriptionException $e) {
            throw $e;
        } catch (ConnectionException) {
            throw new SeoDescriptionException('SEO API недоступен: ошибка подключения.');
        } catch (Throwable) {
            throw new SeoDescriptionException('Не удалось отправить запрос в SEO API.');
        }

        if ($response->status() !== 202) {
            throw new SeoDescriptionException('SEO API dispatch request failed (HTTP '.$response->status().').');
        }

        $data = $this->jsonObject($response, 'dispatch');
        $jobId = $data['job_id'] ?? null;
        $status = $data['status'] ?? null;
        if (! is_string($jobId) || trim($jobId) === '' || $status !== 'pending') {
            throw new SeoDescriptionException('SEO API dispatch response has an invalid contract.');
        }

        return ['job_id' => $jobId, 'status' => $status];
    }

    /**
     * @return array{job_id: string, status: string, result: array<string, mixed>|null, error: string|null}
     */
    public function status(string $jobId): array
    {
        try {
            $response = $this->request()
                ->retry(
                    max(1, (int) config('seo_description.get_retries', 2) + 1),
                    max(0, (int) config('seo_description.retry_delay_ms', 250)),
                    static fn (Throwable $e): bool => $e instanceof ConnectionException
                        || ($e instanceof RequestException && $e->response->serverError()),
                    throw: false,
                )
                ->get('generate/'.rawurlencode($jobId));
        } catch (SeoDescriptionException $e) {
            throw $e;
        } catch (ConnectionException) {
            throw new SeoDescriptionException('SEO API недоступен: ошибка подключения.', retryable: true);
        } catch (Throwable) {
            throw new SeoDescriptionException('SEO API status request failed.', retryable: true);
        }

        if (! $response->successful()) {
            throw new SeoDescriptionException(
                'SEO API status request failed (HTTP '.$response->status().').',
                retryable: $response->serverError(),
            );
        }

        $data = $this->jsonObject($response, 'status');
        $responseJobId = $data['job_id'] ?? null;
        $status = $data['status'] ?? null;
        $result = $data['result'] ?? null;
        $error = $data['error'] ?? null;

        if (
            ! is_string($responseJobId)
            || $responseJobId !== $jobId
            || ! is_string($status)
            || ! in_array($status, self::STATUSES, true)
            || (! is_null($result) && ! is_array($result))
            || (! is_null($error) && ! is_string($error))
        ) {
            throw new SeoDescriptionException('SEO API status response has an invalid contract.');
        }

        if ($status === 'completed' && ! is_array($result)) {
            throw new SeoDescriptionException('SEO API completed response has no result.');
        }

        return [
            'job_id' => $responseJobId,
            'status' => $status,
            'result' => $result,
            'error' => $error,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $products
     * @return array{
     *     batch_id: string|null,
     *     accepted: int,
     *     queued: int,
     *     raw: array<string, mixed>
     * }
     */
    public function submitWork(array $products, bool $force = false): array
    {
        $payload = ['products' => $products];
        if ($force) {
            $payload['force'] = true;
        }

        try {
            $response = $this->request()->post('products/work', $payload);
        } catch (SeoDescriptionException $e) {
            throw $e;
        } catch (ConnectionException) {
            throw new SeoDescriptionException('SEO API недоступен: ошибка подключения.');
        } catch (Throwable) {
            throw new SeoDescriptionException('Не удалось отправить пачку в SEO API.');
        }

        if (! $response->successful()) {
            throw new SeoDescriptionException($this->httpFailureMessage($response, 'work'));
        }

        $data = $this->jsonObject($response, 'work');
        $batchId = $data['batch_id'] ?? $data['id'] ?? null;
        if ($batchId !== null && ! is_string($batchId) && ! is_int($batchId)) {
            throw new SeoDescriptionException('SEO API work response has an invalid batch_id.');
        }

        return [
            'batch_id' => $batchId === null ? null : (string) $batchId,
            'accepted' => (int) ($data['accepted'] ?? $data['accepted_count'] ?? count($products)),
            'queued' => (int) ($data['queued'] ?? $data['queued_count'] ?? $data['accepted'] ?? count($products)),
            'raw' => $data,
        ];
    }

    /**
     * @return list<array{external_id: string, result: array<string, mixed>}>
     */
    public function fetchReady(int $limit = 100): array
    {
        try {
            $response = $this->request()
                ->retry(
                    max(1, (int) config('seo_description.get_retries', 2) + 1),
                    max(0, (int) config('seo_description.retry_delay_ms', 250)),
                    static fn (Throwable $e): bool => $e instanceof ConnectionException
                        || ($e instanceof RequestException && $e->response->serverError()),
                    throw: false,
                )
                ->get('products/ready', ['limit' => max(1, min($limit, 500))]);
        } catch (SeoDescriptionException $e) {
            throw $e;
        } catch (ConnectionException) {
            throw new SeoDescriptionException('SEO API недоступен: ошибка подключения.', retryable: true);
        } catch (Throwable) {
            throw new SeoDescriptionException('SEO API ready request failed.', retryable: true);
        }

        if (! $response->successful()) {
            throw new SeoDescriptionException(
                'SEO API ready request failed (HTTP '.$response->status().').',
                retryable: $response->serverError(),
            );
        }

        $data = $this->jsonObject($response, 'ready');
        $rows = $data['data'] ?? $data['products'] ?? $data['items'] ?? null;
        if (! is_array($rows)) {
            throw new SeoDescriptionException('SEO API ready response has an invalid contract.');
        }

        $items = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $externalId = $row['external_id'] ?? null;
            $result = $row['result'] ?? null;
            if (! is_string($externalId) && ! is_int($externalId)) {
                continue;
            }
            if (! is_array($result)) {
                continue;
            }
            $items[] = [
                'external_id' => (string) $externalId,
                'result' => $result,
            ];
        }

        return $items;
    }

    /**
     * @param  list<string>  $externalIds
     * @return array<string, mixed>
     */
    public function acknowledge(array $externalIds): array
    {
        $ids = array_values(array_unique(array_filter(array_map(
            static fn ($id): string => trim((string) $id),
            $externalIds,
        ))));
        if ($ids === []) {
            return ['acked' => 0];
        }

        try {
            $response = $this->request()->post('products/ack', [
                'external_ids' => $ids,
            ]);
        } catch (SeoDescriptionException $e) {
            throw $e;
        } catch (ConnectionException) {
            throw new SeoDescriptionException('SEO API недоступен: ошибка подключения.');
        } catch (Throwable) {
            throw new SeoDescriptionException('Не удалось подтвердить готовые SEO-результаты.');
        }

        if (! $response->successful()) {
            throw new SeoDescriptionException(
                'SEO API ack request failed (HTTP '.$response->status().').',
            );
        }

        return $this->jsonObject($response, 'ack');
    }

    /**
     * @return array<string, mixed>
     */
    public function stats(): array
    {
        try {
            $response = $this->request()
                ->retry(
                    max(1, (int) config('seo_description.get_retries', 2) + 1),
                    max(0, (int) config('seo_description.retry_delay_ms', 250)),
                    static fn (Throwable $e): bool => $e instanceof ConnectionException
                        || ($e instanceof RequestException && $e->response->serverError()),
                    throw: false,
                )
                ->get('products/stats');
        } catch (SeoDescriptionException $e) {
            throw $e;
        } catch (ConnectionException) {
            throw new SeoDescriptionException('SEO API недоступен: ошибка подключения.', retryable: true);
        } catch (Throwable) {
            throw new SeoDescriptionException('SEO API stats request failed.', retryable: true);
        }

        if (! $response->successful()) {
            throw new SeoDescriptionException(
                'SEO API stats request failed (HTTP '.$response->status().').',
                retryable: $response->serverError(),
            );
        }

        return $this->jsonObject($response, 'stats');
    }

    private function request(): PendingRequest
    {
        $token = trim((string) config('seo_description.token'));
        if ($token === '') {
            throw new SeoDescriptionException('Токен SEO API не настроен.');
        }

        return Http::baseUrl(rtrim((string) config('seo_description.url'), '/'))
            ->acceptJson()
            ->asJson()
            ->withToken($token)
            ->connectTimeout(max(1, (int) config('seo_description.connect_timeout', 5)))
            ->timeout(max(1, (int) config('seo_description.request_timeout', 20)));
    }

    /**
     * @return array<string, mixed>
     */
    private function jsonObject(Response $response, string $operation): array
    {
        $data = $response->json();
        if (! is_array($data)) {
            throw new SeoDescriptionException('SEO API '.$operation.' response is not a JSON object.');
        }

        return $data;
    }

    private function httpFailureMessage(Response $response, string $operation): string
    {
        $status = $response->status();
        $apiMessage = $response->json('message');
        $suffix = is_string($apiMessage) && trim($apiMessage) !== ''
            ? ': '.mb_substr(trim($apiMessage), 0, 300)
            : '';

        return match ($status) {
            401 => 'SEO API: неверный или отсутствующий токен (HTTP 401).'.$suffix,
            403 => 'SEO API: доступ запрещён для сайта/тарифа (HTTP 403).'.$suffix,
            413 => 'SEO API: слишком большой запрос (HTTP 413). Уменьшите размер чанка.',
            422 => 'SEO API: невалидный запрос (HTTP 422).'.$suffix,
            default => 'SEO API '.$operation.' request failed (HTTP '.$status.').'.$suffix,
        };
    }
}
