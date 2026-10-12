import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
interface CustomerDocument {
  jobId: number;
  reference: string;
  depot: string;
  docType: "collection_sheet" | "consignment_note";
  fileName: string;
  uploadedAt: string;
}

export function CustomerDocuments() {
  const { user } = useAuth();
  const enabled = !!user && ["depot_user", "team_leader"].includes(user.role);
  const query = useQuery({
    queryKey: ["customer-documents", user?.id],
    enabled,
    refetchInterval: 30000,
    queryFn: async (): Promise<CustomerDocument[]> => {
      const response = await fetch(`${base}/api/customer/documents`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load collection documents.");
      return (await response.json()).documents;
    },
  });
  if (!enabled) return null;
  return <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
    <h2 className="text-xl font-bold text-[#0f2744] mb-2">Signed collection documents</h2>
    <p className="text-sm text-slate-500 mb-4">Download the signed consignment note and collection sheet for your permitted locations once uploaded by the collector.</p>
    {query.isLoading ? <p>Loading documents…</p> : query.isError ?
      <p role="alert">Could not load collection documents. <button className="underline" onClick={() => query.refetch()}>Retry</button></p> :
      !query.data?.length ? <p className="text-sm text-slate-500">No signed documents have been uploaded yet.</p> :
      <ul className="divide-y divide-slate-200">{query.data.map(doc =>
        <li key={`${doc.jobId}-${doc.docType}`} className="py-3 flex flex-wrap justify-between gap-3">
          <div><p className="font-medium">{doc.reference} · {doc.depot}</p>
            <p className="text-sm text-slate-500">{doc.docType === "consignment_note" ? "Signed consignment note" : "Signed collection sheet"}</p></div>
          <a className="text-sm underline text-sky-700 self-center"
            href={`${base}/api/jobs/${doc.jobId}/documents/${doc.docType}/download`}>
            Download<span className="sr-only"> {doc.reference} {doc.docType.replace(/_/g, " ")}</span>
          </a>
        </li>)}</ul>}
  </section>;
}
