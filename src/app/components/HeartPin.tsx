interface HeartPinProps {
  user: any;
}

export default function HeartPin({ user }: HeartPinProps) {
  const hasPhoto = user.photo;

  return (
    <div className="relative w-12 h-12">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full drop-shadow-lg"
        style={{ filter: 'drop-shadow(0 0 8px rgba(209, 31, 58, 0.6))' }}
      >
        <defs>
          {hasPhoto && (
            <pattern id={`photo-${user.id}`} width="1" height="1">
              <image href={user.photo} width="100" height="100" preserveAspectRatio="xMidYMid slice" />
            </pattern>
          )}
          <linearGradient id={`gradient-${user.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#d11f3a" />
            <stop offset="50%" stopColor="#9f1730" />
            <stop offset="100%" stopColor="#690f1f" />
          </linearGradient>
        </defs>
        <path
          d="M50,90 C50,90 10,60 10,35 C10,20 20,10 30,10 C40,10 50,20 50,20 C50,20 60,10 70,10 C80,10 90,20 90,35 C90,60 50,90 50,90 Z"
          fill={hasPhoto ? `url(#photo-${user.id})` : `url(#gradient-${user.id})`}
          stroke={hasPhoto ? '#fff' : 'none'}
          strokeWidth={hasPhoto ? '2' : '0'}
        />
      </svg>

      {!hasPhoto && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(209, 31, 58, 0.4), transparent)',
            filter: 'blur(8px)',
          }}
        />
      )}
    </div>
  );
}
