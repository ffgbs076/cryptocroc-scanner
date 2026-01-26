type Props = {
  signal: "CONFIRM" | "NEUTRAL" | "CONFLICT"
  reason?: string
}

export default function OrderbookBadge({ signal, reason }: Props) {
  const map = {
    CONFIRM: { text: "OB Confirm", color: "bg-green-600" },
    NEUTRAL: { text: "OB Neutral", color: "bg-gray-500" },
    CONFLICT: { text: "OB Conflict", color: "bg-red-600" },
  }

  const s = map[signal]

  return (
    <div className="flex flex-col gap-1">
      <span className={`px-2 py-1 text-xs text-white rounded ${s.color}`}>
        {s.text}
      </span>
      {reason && (
        <span className="text-[10px] text-gray-400">
          {reason}
        </span>
      )}
    </div>
  )
}
