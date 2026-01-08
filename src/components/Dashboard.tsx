'use client'

import { useState, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import Papa from 'papaparse'
import 'chartjs-adapter-date-fns'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js'
import MultiSelect from './MultiSelect'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
)

interface Transaction {
  date: Date
  name: string
  type: string
  currency: string
  amount: number
  status: string
  cumulativeAmount: number
}

interface RawTransaction extends Omit<Transaction, 'date' | 'cumulativeAmount'> {
  date: string
}

type ViewMode = 'transaction' | 'timeline'

const Dashboard = () => {
  const [rawTransactions, setRawTransactions] = useState<RawTransaction[]>([])
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>(['all'])
  const [viewMode, setViewMode] = useState<ViewMode>('transaction')
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  const parseDate = (dateStr: string) => {
    const [day, month, year] = dateStr.split('/').map(num => parseInt(num))
    return new Date(year, month - 1, day)
  }

  const parseAmount = (amountStr: string) => {
    if (!amountStr) return 0
    // Remove any spaces and commas, then convert to float
    return parseFloat(amountStr.replace(/[,\s]/g, ''))
  }

  // Get unique merchant names from transactions
  const merchants = useMemo(() => {
    const names = new Set(rawTransactions.map(t => t.name))
    return Array.from(names).filter(name => name && name !== '')
  }, [rawTransactions])

  // Filter and process transactions based on selected merchant
  const transactions = useMemo(() => {
    const filteredTransactions = rawTransactions
      .map(t => ({
        ...t,
        date: parseDate(t.date),
        cumulativeAmount: 0
      }))
      .filter(transaction => {
        // Only include completed transactions
        const isCompleted = transaction.status === 'Completed' &&
          transaction.amount !== 0 &&
          !transaction.type.includes('Currency Conversion') &&
          transaction.name !== '' &&
          // Filter out authorization entries and card deposits
          !transaction.type.includes('General Authorization') &&
          !transaction.type.includes('General Card Deposit') &&
          !transaction.type.includes('Bank Deposit to PP Account')

        const matchesMerchant = selectedMerchants.includes('all') || selectedMerchants.includes(transaction.name)

        let matchesDate = true
        if (startDate) {
          const start = new Date(startDate)
          start.setHours(0, 0, 0, 0)
          matchesDate = matchesDate && transaction.date >= start
        }
        if (endDate) {
          const end = new Date(endDate)
          end.setHours(23, 59, 59, 999)
          matchesDate = matchesDate && transaction.date <= end
        }

        return isCompleted && matchesMerchant && matchesDate
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    // Calculate cumulative amount
    let cumulativeAmount = 0
    return filteredTransactions.map(transaction => {
      cumulativeAmount += transaction.amount
      return {
        ...transaction,
        cumulativeAmount
      }
    })
  }, [rawTransactions, selectedMerchants, startDate, endDate])

  const processCSVFile = (file: File): Promise<RawTransaction[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (results: Papa.ParseResult<string[]>) => {
          const parsedTransactions = results.data
            .slice(1) // Skip header row
            .map((row: string[]) => ({
              date: row[0],
              name: row[3],
              type: row[4],
              status: row[5],
              currency: row[6],
              amount: parseAmount(row[7])
            }))
          resolve(parsedTransactions)
        },
        error: (error) => {
          reject(error)
        },
        header: false
      })
    })
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    setIsLoading(true)
    try {
      // Process all files and combine their transactions
      const fileArray = Array.from(files)
      const allTransactions = await Promise.all(
        fileArray.map(file => processCSVFile(file))
      )

      // Combine all transactions
      const combinedTransactions = allTransactions.flat()
      setRawTransactions(combinedTransactions)
      setUploadedFiles(fileArray.map(f => f.name))
      setSelectedMerchants(['all']) // Reset merchant filter when new files are uploaded
    } catch (error) {
      console.error('Error processing CSV files:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const chartData = {
    labels: transactions.map(t => t.date), // Pass raw Date objects for 'time' scale, but 'category' scale needs strings usually? Chart.js handles Dates for 'time' scale. For 'category', we might need to format them.
    // Actually for 'category' scale (Transaction View), we want simple index-based or just label-based.
    // Ideally we pass formatted strings for labels if 'transaction', and Date objects if 'timeline'.
    // Let's condition the labels based on viewMode.
    datasets: [
      {
        label: 'Cumulative Value',
        data: transactions.map(t => {
          if (viewMode === 'timeline') {
            return { x: t.date, y: t.cumulativeAmount }
          }
          return t.cumulativeAmount
        }),
        borderColor: 'rgb(59, 130, 246)', // Blue
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1,
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 4,
      }
    ]
  }

  // Conditionally set labels only for category/transaction mode
  if (viewMode === 'transaction') {
    // @ts-expect-error - ChartJS types are strict about labels, but we're dynamically adjusting
    chartData.labels = transactions.map(t => formatDate(t.date))
  } else {
    // For time scale, we don't strictly *need* labels array if data has x/y, but providing them helps sometimes.
    // However, if we pass {x,y} points, we don't need top-level labels for the x-axis to work in time scale.
    // Let's leave labels undefined or empty for timeline to rely on x-values.
    // @ts-expect-error - ChartJS types are strict about labels
    chartData.labels = undefined
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false, // Hide legend as requested ("Cumulative view bits")
      },
      title: {
        display: false, // Hide title as requested
      },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: (context: any) => {
            const transaction = transactions[context.dataIndex]
            if (!transaction) return []
            return [
              `Cumulative: ${formatCurrency(transaction.cumulativeAmount, transaction.currency)}`,
              `Transaction: ${formatCurrency(transaction.amount, transaction.currency)}`,
              `Name: ${transaction.name}`,
              `Type: ${transaction.type}`,
              `Date: ${formatDate(transaction.date)}`
            ]
          }
        }
      }
    },
    scales: {
      y: {
        title: {
          display: true,
          text: 'Cumulative Value (CAD)'
        }
      },
      x: {
        type: viewMode === 'timeline' ? 'time' : 'category',
        title: {
          display: true,
          text: 'Date'
        },
        time: viewMode === 'timeline' ? {
          unit: 'month', // Auto-scaling works well usually, but we can set defaults. Let's rely on auto for now.
          displayFormats: {
            day: 'MMM d, yyyy'
          }
        } : undefined,
        ticks: {
          // For transaction view, we might want to limit ticks if there are too many?
          // ChartJS auto-skips usually.
          autoSkip: true,
          maxTicksLimit: 20
        }
      }
    }
  }

  // Calculate statistics
  const totalIncoming = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  const totalOutgoing = Math.abs(
    transactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + t.amount, 0)
  )

  const netAmount = transactions.length > 0
    ? transactions[transactions.length - 1].cumulativeAmount
    : 0

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4">
          <label
            htmlFor="csvFile"
            className="mb-2 block text-sm font-medium text-gray-700"
          >
            Upload PayPal Transaction CSV Files
          </label>
          <input
            type="file"
            id="csvFile"
            accept=".csv"
            multiple
            onChange={handleFileUpload}
            className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-900 focus:outline-none"
            aria-label="Upload PayPal transaction CSV files"
          />
        </div>
        <p className="text-sm text-gray-500">
          Upload one or more PayPal transaction history CSV files to visualize your cumulative transaction value
        </p>

        {uploadedFiles.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-sm font-medium text-gray-700">Uploaded Files:</h4>
            <ul className="list-inside list-disc text-sm text-gray-600">
              {uploadedFiles.map((file, index) => (
                <li key={index}>{file}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {rawTransactions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:w-1/2">
              <MultiSelect
                options={merchants}
                selected={selectedMerchants}
                onChange={setSelectedMerchants}
                label="Filter by Merchant"
              />
            </div>

            <div className="flex items-center space-x-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => setViewMode('transaction')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'transaction'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                Transaction View
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'timeline'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:bg-gray-200'
                  }`}
              >
                Timeline View
              </button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-gray-100 pt-6 sm:grid-cols-2">
            <div>
              <label htmlFor="startDate" className="mb-2 block text-sm font-medium text-gray-700">
                Start Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 pl-3 pr-10 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setStartDate('')}
                  disabled={!startDate}
                  title="Clear Start Date"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 disabled:invisible disabled:opacity-0"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="endDate" className="mb-2 block text-sm font-medium text-gray-700">
                End Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 pl-3 pr-10 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setEndDate('')}
                  disabled={!endDate}
                  title="Clear End Date"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-red-500 disabled:invisible disabled:opacity-0"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-center text-gray-500">Processing files...</p>
        </div>
      ) : transactions.length > 0 && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-500">Total Incoming</h3>
              <p className="mt-2 text-lg font-semibold text-green-600">
                {formatCurrency(totalIncoming, 'CAD')}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-500">Total Outgoing</h3>
              <p className="mt-2 text-lg font-semibold text-red-600">
                {formatCurrency(totalOutgoing, 'CAD')}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-medium text-gray-500">Net Amount</h3>
              <p className={`mt-2 text-lg font-semibold ${netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(netAmount, 'CAD')}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-sm text-gray-500">
                Showing {transactions.length} completed transactions
                {selectedMerchants.includes('all')
                  ? ''
                  : selectedMerchants.length === 1
                    ? ` for ${selectedMerchants[0]}`
                    : ` for ${selectedMerchants.length} merchants`}
              </p>
            </div>
            <div className="h-[600px]">
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard 