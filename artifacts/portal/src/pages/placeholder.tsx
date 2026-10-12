import { SidebarLayout } from "@/components/sidebar-layout";
import { Construction } from "lucide-react";

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <SidebarLayout title={title} subtitle="Coming soon">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#f1f5f9] flex items-center justify-center mb-4">
          <Construction className="w-8 h-8 text-[#94a3b8]" />
        </div>
        <h2 className="text-2xl font-bold text-[#1e293b] mb-2">{title}</h2>
        <p className="text-[#64748b] max-w-md">
          This page is under development and will be available soon.
        </p>
      </div>
    </SidebarLayout>
  );
}
