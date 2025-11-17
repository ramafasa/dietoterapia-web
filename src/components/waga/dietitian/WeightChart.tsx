import { useState } from 'react'
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
import { Line } from 'react-chartjs-2'
import type { ChartPeriod } from '../../../types/patient-details'
import { useChartData } from '../../../hooks/dietitian/useChartData'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

type WeightChartProps = {
  patientId: string
  defaultPeriod?: ChartPeriod
}

/**
 * Weight Chart
 * Line chart with 7-day moving average, outliers and dietitian entries
 */
export default function WeightChart({
  patientId,
  defaultPeriod = 30,
}: WeightChartProps) {
  const [period, setPeriod] = useState<ChartPeriod>(defaultPeriod)
  const { data, isLoading, error } = useChartData({ patientId, period })

  const handlePeriodChange = (newPeriod: ChartPeriod) => {
    setPeriod(newPeriod)
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800 font-semibold mb-2">Wystąpił błąd</p>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Empty state
  if (!data || data.chartData.entries.length === 0) {
    return (
      <div className="bg-neutral-light border border-neutral-dark/10 rounded-lg p-12 text-center">
        <p className="text-neutral-dark/60 text-lg">Brak danych do wyświetlenia</p>
      </div>
    )
  }

  const chartData = data.chartData

  // Prepare chart data
  const labels = chartData.entries.map((entry) => {
    const date = new Date(entry.date)
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
  })

  const weights = chartData.entries.map((entry) => entry.weight)
  const ma7Values = chartData.entries.map((entry) => entry.ma7)

  // Mark outliers with different point style
  const pointBackgroundColors = chartData.entries.map((entry) =>
    entry.isOutlier ? 'rgba(239, 68, 68, 1)' : 'rgba(74, 124, 89, 1)'
  )

  const pointBorderColors = chartData.entries.map((entry) =>
    entry.isOutlier ? 'rgba(239, 68, 68, 1)' : 'rgba(74, 124, 89, 1)'
  )

  const pointRadii = chartData.entries.map((entry) =>
    entry.isOutlier ? 6 : 4
  )

  // Mark dietitian entries with different shape
  const pointStyles = chartData.entries.map((entry) =>
    entry.source === 'dietitian' ? 'triangle' : 'circle'
  ) as ('circle' | 'triangle')[]

  const chartConfig = {
    labels,
    datasets: [
      {
        label: 'Waga (kg)',
        data: weights,
        borderColor: 'rgba(74, 124, 89, 1)',
        backgroundColor: pointBackgroundColors,
        pointBorderColor: pointBorderColors,
        pointBackgroundColor: pointBackgroundColors,
        pointRadius: pointRadii,
        pointStyle: pointStyles,
        tension: 0.1,
      },
      {
        label: 'Średnia 7-dniowa (MA7)',
        data: ma7Values,
        borderColor: 'rgba(244, 164, 96, 0.8)',
        backgroundColor: 'rgba(244, 164, 96, 0.1)',
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0.3,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const entry = chartData.entries[context.dataIndex]
            let label = `${context.dataset.label}: ${context.parsed.y} kg`
            if (entry.isOutlier) {
              label += ' (Anomalia)'
            }
            if (entry.source === 'dietitian') {
              label += ' (Dietetyk)'
            }
            return label
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: 'Waga (kg)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Data',
        },
      },
    },
  }

  return (
    <div>
      {/* Period Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-heading font-semibold text-neutral-dark">
          Wykres wagi
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => handlePeriodChange(30)}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              period === 30
                ? 'bg-primary text-white'
                : 'bg-neutral-light text-neutral-dark hover:bg-neutral-dark/5'
            }`}
          >
            30 dni
          </button>
          <button
            onClick={() => handlePeriodChange(90)}
            className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
              period === 90
                ? 'bg-primary text-white'
                : 'bg-neutral-light text-neutral-dark hover:bg-neutral-dark/5'
            }`}
          >
            90 dni
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-96">
        <Line data={chartConfig} options={options} />
      </div>

      {/* Statistics */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-neutral-light rounded-lg p-4">
          <p className="text-xs text-neutral-dark/60 font-semibold uppercase mb-1">
            Waga początkowa
          </p>
          <p className="text-xl font-heading font-bold text-neutral-dark">
            {chartData.statistics.startWeight} kg
          </p>
        </div>
        <div className="bg-neutral-light rounded-lg p-4">
          <p className="text-xs text-neutral-dark/60 font-semibold uppercase mb-1">
            Waga końcowa
          </p>
          <p className="text-xl font-heading font-bold text-neutral-dark">
            {chartData.statistics.endWeight} kg
          </p>
        </div>
        <div className="bg-neutral-light rounded-lg p-4">
          <p className="text-xs text-neutral-dark/60 font-semibold uppercase mb-1">
            Zmiana
          </p>
          <p className={`text-xl font-heading font-bold ${
            chartData.statistics.change > 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {chartData.statistics.change > 0 ? '+' : ''}{chartData.statistics.change} kg
          </p>
        </div>
        <div className="bg-neutral-light rounded-lg p-4">
          <p className="text-xs text-neutral-dark/60 font-semibold uppercase mb-1">
            Średnia tygodniowa
          </p>
          <p className={`text-xl font-heading font-bold ${
            chartData.statistics.avgWeeklyChange > 0 ? 'text-red-600' : 'text-green-600'
          }`}>
            {chartData.statistics.avgWeeklyChange > 0 ? '+' : ''}{chartData.statistics.avgWeeklyChange.toFixed(2)} kg/tydz
          </p>
        </div>
      </div>
    </div>
  )
}
