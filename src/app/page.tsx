import Dashboard from '@/components/Dashboard'

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-8 text-3xl font-bold text-gray-900">Transaction Dashboard</h1>
        <Dashboard />
      </div>
    </main>
  )
}
