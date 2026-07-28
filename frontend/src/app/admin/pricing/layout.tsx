import AdminPricingShell from "@/components/admin/pricing/admin-pricing-shell";

export default function AdminPricingLayout({ children }: { children: React.ReactNode }) {
    return <AdminPricingShell>{children}</AdminPricingShell>;
}
