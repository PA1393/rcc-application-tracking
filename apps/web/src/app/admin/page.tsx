import prisma from "@/lib/prisma"; 
import ImportButton from "@/components/importButton"

export default async function AdminPage() {
  // 1. Fetch all applications and "Include" the applicant details (Name/Email)
  const applications = await prisma.application.findMany({
    include: {
      applicant: true, 
    },
    orderBy: {
      applied_at: "desc", // Newest first
    },
  });

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto">
        
        {/* Header Section */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Applicant Tracking</h1>
            <p className="text-gray-500">Manage incoming applications and statuses.</p>
          </div>
          <ImportButton />
        </div>

        {/* The List Container */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {applications.map((app) => (
              <li key={app.id} className="p-6 hover:bg-gray-50 transition">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {app.applicant.name}
                    </h2>
                    <p className="text-sm text-gray-500">{app.applicant.email}</p>
                  </div>
                  
                  <div className="text-right">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {app.status}
                    </span>
                    <p className="text-xs text-gray-400 mt-1">{app.role}</p>
                  </div>
                </div>
              </li>
            ))}

            {/* Empty State */}
            {applications.length === 0 && (
              <p className="p-10 text-center text-gray-500">No applications found. Try importing a CSV!</p>
            )}
          </ul>
        </div>
      </div>
    </main>
  );
}