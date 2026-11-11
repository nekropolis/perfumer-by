<?php

namespace Modules\ImportExport\Support\ElParfume;

final class ElParfumeArtifactBackup
{
    /**
     * Copy an existing file next to itself as `{name}.bak-YYYYMMDD-HHMMSS` before overwrite.
     * Returns the backup path or null if there was nothing to copy.
     */
    public static function backupIfExists(string $path): ?string
    {
        if ($path === '' || ! is_file($path) || filesize($path) === 0) {
            return null;
        }

        $backup = $path.'.bak-'.date('Ymd-His');
        if (! @copy($path, $backup)) {
            return null;
        }

        return $backup;
    }
}
