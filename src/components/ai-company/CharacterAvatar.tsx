interface CharacterAvatarProps {
  name: string;
  className?: string;
  /** true = Terminal背景用（低透明度）, false = プロフィール用（通常表示） */
  asBackground?: boolean;
}

export function CharacterAvatar({
  name,
  className = "",
  asBackground = true,
}: CharacterAvatarProps) {
  return (
    <img
      src={`/ai-company/avatars/${name}.jpg`}
      alt={`${name}のアバター`}
      className={`${
        asBackground
          ? "absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
          : "w-full h-full object-cover"
      } ${className}`}
      loading="lazy"
    />
  );
}
