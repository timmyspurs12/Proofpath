import { cn } from '../../lib/utils';

export function ContourArt({
  className,
  inverse = false,
}: {
  className?: string;
  inverse?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 640 360"
      fill="none"
      className={cn('pointer-events-none', inverse ? 'text-lime' : 'text-teal', className)}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <g stroke="currentColor" strokeWidth="1" opacity="0.26">
        <path d="M-35 264C35 163 142 165 192 211c44 40 77 59 143 17 91-58 132-179 348-110" />
        <path d="M-40 285C37 179 133 183 180 225c52 47 91 65 163 18 97-63 142-168 339-105" />
        <path d="M-43 308C43 197 129 202 172 242c56 52 101 70 178 19 104-69 151-155 337-102" />
        <path d="M-47 334C49 216 126 223 166 260c60 55 110 72 191 19 112-73 163-146 335-99" />
        <path d="M54 108c45-80 163-98 229-35 38 36 44 92 100 100 72 11 118-56 200-35 44 11 70 40 93 75" />
        <path d="M79 113c40-62 138-77 194-25 43 40 48 104 111 112 71 9 110-52 187-36 46 9 78 39 105 76" />
        <path d="M107 117c34-45 105-53 148-13 46 43 54 114 126 123 67 8 104-44 174-32 50 8 88 39 118 79" />
        <path d="M139 120c26-26 71-29 99-3 48 44 60 124 142 133 62 7 97-37 160-30 57 7 99 40 132 83" />
        <path d="M213 279c18-39 73-55 111-30 29 19 24 58 56 72 41 19 83-15 121 4 25 12 31 39 25 61" />
        <path d="M234 281c14-25 52-34 77-17 31 21 23 64 63 82 39 17 77-10 111 7 22 11 29 32 27 52" />
      </g>
      <g stroke="currentColor" opacity="0.5">
        <circle cx="381" cy="227" r="5" fill="currentColor" />
        <circle cx="381" cy="227" r="13" strokeDasharray="2 4" />
        <path d="M381 205v-13m0 70v-13m-22-22h-13m70 0h-13" strokeDasharray="2 3" />
      </g>
    </svg>
  );
}
