<?php

namespace Modules\Catalog\Services;

use Modules\Catalog\Models\ProductImage;

/**
 * Детект watermark через template matching (PNG в storage/app/private/watermark-templates).
 * Без шаблонов — статус needs_review, изображение без изменений.
 */
class ImageWatermarkService
{
    private const float MATCH_THRESHOLD = 0.72;

    private const int CROP_PADDING = 4;

    /**
     * @return array{0: string, 1: string, 2: array<string, mixed>} binary, watermark_status, watermark_meta
     */
    public function processImageBinary(string $binary): array
    {
        $templates = $this->loadTemplatePaths();
        if ($templates === [] || ! extension_loaded('gd')) {
            return [
                $binary,
                ProductImage::WATERMARK_NEEDS_REVIEW,
                ['reason' => $templates === [] ? 'no_templates' : 'gd_missing'],
            ];
        }

        $src = @imagecreatefromstring($binary);
        if ($src === false) {
            return [$binary, ProductImage::WATERMARK_NEEDS_REVIEW, ['reason' => 'decode_failed']];
        }

        $sw = imagesx($src);
        $sh = imagesy($src);
        if ($sw < 40 || $sh < 40) {
            return [$binary, ProductImage::WATERMARK_NEEDS_REVIEW, ['reason' => 'too_small']];
        }

        $bestScore = 0.0;
        $bestBox = null;
        $bestTemplate = null;

        foreach ($templates as $tplPath) {
            $tpl = @imagecreatefrompng($tplPath);
            if ($tpl === false) {
                continue;
            }
            $tw = imagesx($tpl);
            $th = imagesy($tpl);
            if ($tw < 8 || $th < 8 || $tw > $sw || $th > $sh) {
                continue;
            }

            $regionH = (int) max($th + 20, (int) round($sh * 0.35));
            $y0 = $sh - $regionH;
            $step = 3;
            for ($y = $y0; $y <= $sh - $th; $y += $step) {
                for ($x = 0; $x <= $sw - $tw; $x += $step) {
                    $score = $this->normalizedCorrelation($src, $tpl, $x, $y, $tw, $th);
                    if ($score > $bestScore) {
                        $bestScore = $score;
                        $bestBox = [$x, $y, $tw, $th];
                        $bestTemplate = basename($tplPath);
                    }
                }
            }
        }

        if ($bestBox === null || $bestScore < self::MATCH_THRESHOLD) {
            return [
                $binary,
                ProductImage::WATERMARK_NEEDS_REVIEW,
                [
                    'best_score' => round($bestScore, 4),
                    'threshold' => self::MATCH_THRESHOLD,
                ],
            ];
        }

        [$x, $y, $tw, $th] = $bestBox;
        $src2 = @imagecreatefromstring($binary);
        if ($src2 === false) {
            return [
                $binary,
                ProductImage::WATERMARK_DETECTED,
                [
                    'bbox' => ['x' => $x, 'y' => $y, 'w' => $tw, 'h' => $th],
                    'confidence' => round($bestScore, 4),
                    'template' => $bestTemplate,
                ],
            ];
        }

        // Убираем нижнюю полосу от верхней границы watermark (типичный кейс: знак внизу).
        $cutY = max(1, $y - self::CROP_PADDING);
        if ($cutY >= $sh - 10) {
            return [
                $binary,
                ProductImage::WATERMARK_NEEDS_REVIEW,
                ['reason' => 'crop_too_aggressive', 'confidence' => round($bestScore, 4)],
            ];
        }

        $nw = $sw;
        $nh = $cutY;
        $cropX = 0;
        $cropY = 0;
        $cropW = $nw;
        $cropH = $nh;
        $dst = imagecreatetruecolor($nw, $nh);
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagecopy($dst, $src2, 0, 0, 0, 0, $nw, $nh);

        ob_start();
        imagepng($dst);
        $out = (string) ob_get_clean();

        return [
            $out,
            ProductImage::WATERMARK_CROPPED,
            [
                'bbox' => ['x' => $x, 'y' => $y, 'w' => $tw, 'h' => $th],
                'confidence' => round($bestScore, 4),
                'template' => $bestTemplate,
                'crop' => ['x' => $cropX, 'y' => $cropY, 'w' => $cropW, 'h' => $cropH],
            ],
        ];
    }

    /**
     * @return list<string>
     */
    private function loadTemplatePaths(): array
    {
        $dir = storage_path('app/private/watermark-templates');
        if (! is_dir($dir)) {
            return [];
        }
        $paths = glob($dir.'/*.png') ?: [];

        return array_values(array_filter($paths, 'is_file'));
    }

    private function normalizedCorrelation(\GdImage $src, \GdImage $tpl, int $x0, int $y0, int $tw, int $th): float
    {
        $sumS = 0.0;
        $sumT = 0.0;
        $sumST = 0.0;
        $sumS2 = 0.0;
        $sumT2 = 0.0;
        $n = 0;

        for ($y = 0; $y < $th; $y++) {
            for ($x = 0; $x < $tw; $x++) {
                $rgbS = imagecolorat($src, $x0 + $x, $y0 + $y);
                $rgbT = imagecolorat($tpl, $x, $y);
                $gs = (($rgbS >> 16) & 0xFF) * 0.299 + (($rgbS >> 8) & 0xFF) * 0.587 + ($rgbS & 0xFF) * 0.114;
                $gt = (($rgbT >> 16) & 0xFF) * 0.299 + (($rgbT >> 8) & 0xFF) * 0.587 + ($rgbT & 0xFF) * 0.114;
                $sumS += $gs;
                $sumT += $gt;
                $sumST += $gs * $gt;
                $sumS2 += $gs * $gs;
                $sumT2 += $gt * $gt;
                $n++;
            }
        }
        if ($n === 0) {
            return 0.0;
        }
        $num = $n * $sumST - $sumS * $sumT;
        $den = sqrt(max(1e-9, ($n * $sumS2 - $sumS * $sumS) * ($n * $sumT2 - $sumT * $sumT)));

        return $num / $den;
    }
}
