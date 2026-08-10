<?php

namespace Modules\Settings\Http\Controllers\Api;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Pages\Models\CmsPage;
use Modules\Settings\Services\ShopSettingService;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Публичная страница /contacts: CMS cms_pages + контакты из shop settings.
 */
class ContactsPagePublicController extends Controller
{
    /** Страница «Контакты» в админке /admin/pages/{id}/edit */
    public const CONTACTS_CMS_PAGE_ID = 3;

    public function show(ShopSettingService $settings): JsonResponse
    {
        $page = CmsPage::query()
            ->where('id', self::CONTACTS_CMS_PAGE_ID)
            ->where('is_active', true)
            ->first();

        if (! $page) {
            throw new NotFoundHttpException('Contacts CMS page not found');
        }

        $site = $settings->publicSiteContent();

        return response()->json([
            'data' => [
                'page' => [
                    'id' => (int) $page->id,
                    'name' => $page->name,
                    'slug' => $page->slug,
                    'h1' => $page->h1,
                    'content' => $page->content,
                    'seo_title' => $page->seo_title,
                    'seo_description' => $page->seo_description,
                    'updated_at' => $page->updated_at,
                ],
                'contact_phone_mts' => $site['contact_phone_mts'],
                'contact_phone_a1' => $site['contact_phone_a1'],
                'contact_phone_life' => $site['contact_phone_life'],
                'contact_email' => $site['contact_email'],
                'contact_telegram_url' => $site['contact_telegram_url'],
                'contact_viber_url' => $site['contact_viber_url'],
            ],
        ]);
    }
}
