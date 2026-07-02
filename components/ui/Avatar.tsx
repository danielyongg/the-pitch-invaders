interface Props {
  url?: string | null
  username: string
  size?: number
  className?: string
}

export default function Avatar({ url, username, size = 40, className = '' }: Props) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={username}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className={`rounded-full bg-[var(--color-input)] border border-[rgba(174,198,255,0.3)] flex items-center justify-center font-bold text-[var(--color-text-primary)] flex-shrink-0 ${className}`}
    >
      {username[0].toUpperCase()}
    </div>
  )
}
