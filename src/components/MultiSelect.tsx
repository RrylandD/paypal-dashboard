import { useState, useRef, useEffect } from 'react'

interface MultiSelectProps {
    options: string[]
    selected: string[]
    onChange: (selected: string[]) => void
    label: string
}

const MultiSelect = ({ options, selected, onChange, label }: MultiSelectProps) => {
    const [isOpen, setIsOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const containerRef = useRef<HTMLDivElement>(null)
    const selectAllRef = useRef<HTMLInputElement>(null)

    // Handle clicking outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
                setSearchTerm('') // Clear search when closing
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const isAllSelected = selected.includes('all') || (options.length > 0 && selected.length === options.length)
    const isIndeterminate = selected.length > 0 && !selected.includes('all') && selected.length < options.length

    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = isIndeterminate
        }
    }, [isIndeterminate, isOpen])

    // Filter options based on search term
    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const handleSelectAll = () => {
        if (isAllSelected) {
            onChange([]) // Deselect all
        } else {
            onChange(['all']) // Select all
        }
    }

    const handleOptionClick = (option: string) => {
        let newSelected: string[]

        // If we're currently in "all" mode, clicking an option means we're deselecting it
        // So we need to start with the full list of options
        const currentSelection = selected.includes('all') ? [...options] : selected

        if (currentSelection.includes(option)) {
            newSelected = currentSelection.filter(s => s !== option)
        } else {
            newSelected = [...currentSelection, option]
        }

        // If we ended up selecting all individual options, switch to 'all'
        if (newSelected.length === options.length) {
            onChange(['all'])
        } else {
            onChange(newSelected)
        }
    }

    // Helper to check if an option is effectively selected
    const isSelected = (option: string) => {
        if (selected.includes('all')) return true
        return selected.includes(option)
    }

    const getDisplayText = () => {
        if (selected.includes('all') || (options.length > 0 && selected.length === options.length)) return 'All Merchants'
        if (selected.length === 0) return 'Select Merchants...'
        if (selected.length === 1) return selected[0]
        return (`${selected.length} Merchants Selected`)
    }

    return (
        <div className="relative" ref={containerRef}>
            <label className="mb-2 block text-sm font-medium text-gray-700">
                {label}
            </label>
            <button
                type="button"
                onClick={() => {
                    if (isOpen) setSearchTerm('') // Clear search when closing
                    setIsOpen(!isOpen)
                }}
                className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            >
                <span className="truncate">{getDisplayText()}</span>
                <svg
                    className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                        <input
                            type="text"
                            placeholder="Search merchants..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                    <div className="max-h-48 overflow-auto p-1">
                        <div
                            className="flex cursor-pointer items-center rounded p-2 hover:bg-gray-100"
                            onClick={handleSelectAll}
                        >
                            <input
                                ref={selectAllRef}
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={() => { }} // Handled by div click
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="ml-2 text-sm font-medium text-gray-900">All Merchants</span>
                        </div>
                        <div className="my-1 h-px bg-gray-200" />
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <div
                                    key={option}
                                    className="flex cursor-pointer items-center rounded p-2 hover:bg-gray-100"
                                    onClick={() => handleOptionClick(option)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected(option)}
                                        onChange={() => { }} // Handled by div click
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="ml-2 truncate text-sm text-gray-900">{option}</span>
                                </div>
                            ))
                        ) : (
                            <div className="p-2 text-center text-sm text-gray-500">
                                No merchants found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default MultiSelect
