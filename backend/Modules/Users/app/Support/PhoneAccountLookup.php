<?php

namespace Modules\Users\Support;

use App\Support\Phone;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Modules\Users\Models\Client;
use Modules\Users\Models\User;

final class PhoneAccountLookup
{
    public static function findClient(string $phone): ?Client
    {
        $normalized = Phone::normalize($phone);
        if ($normalized === '') {
            return null;
        }

        $exact = Client::query()->where('phone', $normalized)->first();
        if ($exact instanceof Client) {
            return $exact;
        }

        $matched = self::findByNormalizedPhone(Client::query(), $normalized);

        return $matched instanceof Client ? $matched : null;
    }

    public static function findStaffUser(string $phone): ?User
    {
        $normalized = Phone::normalize($phone);
        if ($normalized === '') {
            return null;
        }

        $exact = User::query()->where('phone', $normalized)->first();
        if ($exact instanceof User) {
            return $exact;
        }

        $matched = self::findByNormalizedPhone(User::query(), $normalized);

        return $matched instanceof User ? $matched : null;
    }

    public static function clientExists(string $phone): bool
    {
        return self::findClient($phone) instanceof Client;
    }

  /**
     * @param  Builder<Model>  $query
     */
    private static function findByNormalizedPhone(Builder $query, string $normalized): ?Model
    {
        $suffix = strlen($normalized) >= 9 ? substr($normalized, -9) : $normalized;
        if ($suffix === '') {
            return null;
        }

        return $query
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->where('phone', 'like', '%'.$suffix.'%')
            ->orderBy('id')
            ->limit(50)
            ->get()
            ->first(fn (Model $candidate) => Phone::normalize((string) ($candidate->phone ?? '')) === $normalized);
    }
}
