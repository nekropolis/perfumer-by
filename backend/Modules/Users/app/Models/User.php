<?php

namespace Modules\Users\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;
use Modules\Users\Enums\Role;

class User extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'users';

    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'phone_verified_at',
        'role',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'email_verified_at' => 'datetime',
        'phone_verified_at' => 'datetime',
        'password' => 'hashed',
    ];

    public function hasRole(Role|string $role): bool
    {
        return $this->role === ($role instanceof Role ? $role->value : $role);
    }

    public function hasAnyRole(array $roles): bool
    {
        $roleValues = array_map(function ($role) {
            return $role instanceof Role ? $role->value : $role;
        }, $roles);

        return in_array($this->role, $roleValues, true);
    }
}
