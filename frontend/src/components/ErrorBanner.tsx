interface Props {
  message: string
  onDismiss?: () => void
}

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div className="bg-red-950 border border-red-700 rounded-xl p-4 flex items-start justify-between gap-4">
      <p className="text-red-300 text-sm">
        <span className="font-semibold">Error: </span>
        {message}
      </p>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-400 hover:text-red-200 text-lg leading-none shrink-0"
          aria-label="Dismiss error"
        >
          ×
        </button>
      )}
    </div>
  )
}
