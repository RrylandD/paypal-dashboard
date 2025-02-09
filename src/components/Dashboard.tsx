'use client'

import { useState, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import Papa from 'papaparse'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
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

const Dashboard = () => {
  const [rawTransactions, setRawTransactions] = useState<RawTransaction[]>([])
  const [selectedMerchant, setSelectedMerchant] = useState<string>('all')
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
    return ['all', ...Array.from(names)].filter(name => name && name !== '')
  }, [rawTransactions])

  // Filter and process transactions based on selected merchant
  const transactions = useMemo(() => {
    let filteredTransactions = rawTransactions
      .filter(transaction => 
        // Only include completed transactions
        transaction.status === 'Completed' &&
        transaction.amount !== 0 &&
        !transaction.type.includes('Currency Conversion') &&
        transaction.name !== '' &&
        // Filter out authorization entries and card deposits
        !transaction.type.includes('General Authorization') &&
        !transaction.type.includes('General Card Deposit') &&
        !transaction.type.includes('Bank Deposit to PP Account') &&
        (selectedMerchant === 'all' || transaction.name === selectedMerchant)
      )
      .map(t => ({
        ...t,
        date: parseDate(t.date),
        cumulativeAmount: 0
      }))
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
  }, [rawTransactions, selectedMerchant])

  const processCSVFile = (file: File): Promise<RawTransaction[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (results) => {
          const parsedTransactions = results.data
            .slice(1) // Skip header row
            .map((row: any) => ({
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
      const allTransactions = await Promise.all(
        Array.from(files).map(file => processCSVFile(file))
      )

      // Combine all transactions
      const combinedTransactions = allTransactions.flat()
      setRawTransactions(combinedTransactions)
      setSelectedMerchant('all') // Reset merchant filter when new files are uploaded
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
    labels: transactions.map(t => formatDate(t.date)),
    datasets: [
      {
        label: 'Cumulative Value',
        data: transactions.map(t => t.cumulativeAmount),
        borderColor: 'rgb(59, 130, 246)', // Blue
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.1,
        fill: true,
        pointRadius: 2,
        pointHoverRadius: 4,
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: selectedMerchant === 'all' 
          ? 'Cumulative Transaction Value' 
          : `Cumulative Transaction Value - ${selectedMerchant}`
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const transaction = transactions[context.dataIndex]
            if (!transaction) return []
            return [
              `Cumulative: ${formatCurrency(transaction.cumulativeAmount, transaction.currency)}`,
              `Transaction: ${formatCurrency(transaction.amount, transaction.currency)}`,
              `Name: ${transaction.name}`,
              `Type: ${transaction.type}`
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
        title: {
          display: true,
          text: 'Date'
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
      </div>

      {rawTransactions.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <label 
              htmlFor="merchantFilter" 
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Filter by Merchant
            </label>
            <select
              id="merchantFilter"
              value={selectedMerchant}
              onChange={(e) => setSelectedMerchant(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              {merchants.map(merchant => (
                <option key={merchant} value={merchant}>
                  {merchant === 'all' ? 'All Merchants' : merchant}
                </option>
              ))}
            </select>
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
                {selectedMerchant !== 'all' && ` for ${selectedMerchant}`}
              </p>
            </div>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard 