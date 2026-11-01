import CheckoutSuccessView from "@/app/checkout/success/checkout-success-view";

type Props = {
    searchParams: Promise<{
        order?: string;
    }>;
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
    const params = await searchParams;
    const orderId = params.order?.trim() ?? "";

    return <CheckoutSuccessView orderId={orderId} />;
}
