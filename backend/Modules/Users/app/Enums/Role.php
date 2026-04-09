<?php

namespace Modules\Users\Enums;

enum Role: string
{
    case ADMIN = 'admin';
    case MANAGER = 'manager';
    case CEO = 'ceo';
}
