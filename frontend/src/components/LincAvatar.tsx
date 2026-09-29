import './LincAvatar.css';

export type LincMood = 'deadpan' | 'skeptical' | 'pleased';

interface LincAvatarProps {
  size?: number;
  mood?: LincMood;
  /** Blink every few seconds. */
  blink?: boolean;
  /** Tilt the head back and forth while Linc works on something. */
  thinking?: boolean;
  /** Raise an arm and wave once when mounted. Remount (change `key`) to wave again. */
  wave?: boolean;
  /** Scale in when mounted. Key the avatar on its mood to pop on every change. */
  pop?: boolean;
  /** Accessible name. Omit when a visible "Linc" label already sits beside the avatar. */
  label?: string;
  className?: string;
}

const INK = '#102319';
const LIME = '#d9ff6f';
const COLLAR = '#2f5a3e';
const SKIN = '#eab896';
const SHADE = '#d39a78';
const HAIR = '#2b1d16';
const LIP = '#8a4434';

const EYES = [83, 117];

function OpenEyes({ mood }: { mood: LincMood }) {
  if (mood === 'pleased') {
    return <>{EYES.map(cx => <g key={cx}><circle cx={cx} cy={96} r={3.6} fill={INK} /><circle cx={cx + 1.2} cy={94.8} r={1.1} fill="#fff" /></g>)}</>;
  }
  // Half-lidded: the look that says he has read your statements.
  return <>{EYES.map(cx => <g key={cx}><path d={`M${cx - 3.6} 95.5 A3.6 3.6 0 0 0 ${cx + 3.6} 95.5 Z`} fill={INK} /><path d={`M${cx - 5.5} 95.3 L${cx + 5.5} 95.3`} stroke={INK} strokeWidth={2.2} strokeLinecap="round" /></g>)}</>;
}

function Mouth({ mood }: { mood: LincMood }) {
  if (mood === 'pleased') {
    return <><path d="M86 122 Q100 138 114 122 Q100 127 86 122 Z" fill={LIP} /><path d="M89 123.5 Q100 127 111 123.5 L110 125.5 Q100 128.5 90 125.5 Z" fill="#fff" /></>;
  }
  return <path d="M88 126 Q101 130 113 122" fill="none" stroke={LIP} strokeWidth={3.2} strokeLinecap="round" />;
}

/** Linc, the Ask Linc persona: sharp, supportive, good with money. */
export default function LincAvatar({
  size = 32,
  mood = 'deadpan',
  blink = true,
  thinking = false,
  wave = false,
  pop = false,
  label,
  className,
}: LincAvatarProps) {
  const classes = ['linc-avatar', blink && 'is-blinking', thinking && 'is-thinking', pop && 'is-popping', className].filter(Boolean).join(' ');
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };

  return (
    <span className={classes} style={{ width: size, height: size }} data-mood={mood} {...a11y}>
      <span className="linc-avatar-face">
        <svg viewBox="0 0 200 200" focusable="false">
          <rect width="200" height="200" fill={LIME} />
          <path d="M22 210 Q26 160 70 148 L130 148 Q174 160 178 210 Z" fill={INK} />
          <path d="M84 118 L116 118 L118 150 Q100 160 82 150 Z" fill={SHADE} />
          <path d="M78 147 Q100 170 122 147" fill="none" stroke={COLLAR} strokeWidth={5} strokeLinecap="round" />
          <g className="linc-avatar-head">
            <ellipse cx="60" cy="100" rx="8" ry="12" fill={SKIN} />
            <ellipse cx="140" cy="100" rx="8" ry="12" fill={SKIN} />
            <ellipse cx="61" cy="101" rx="3.5" ry="6" fill={SHADE} />
            <ellipse cx="139" cy="101" rx="3.5" ry="6" fill={SHADE} />
            <path d="M63 84 Q63 44 100 42 Q137 44 137 84 L137 104 Q135 140 100 145 Q65 140 63 104 Z" fill={SKIN} />
            <path d="M58 94 Q50 50 84 36 Q96 22 120 30 Q150 40 142 94 Q138 74 131 66 Q116 60 100 62 Q84 62 72 68 Q63 76 62 94 Z" fill={HAIR} />
            <path d="M74 48 Q88 24 130 32 Q112 34 104 44 Q90 42 74 48 Z" fill={HAIR} />
            <ellipse cx="77" cy="115" rx="7.5" ry="4.5" fill="#e3907a" opacity={0.45} />
            <ellipse cx="123" cy="115" rx="7.5" ry="4.5" fill="#e3907a" opacity={0.45} />
            <g className="linc-avatar-eyes-open"><OpenEyes mood={mood} /></g>
            <g className="linc-avatar-eyes-closed">{EYES.map(cx => <path key={cx} d={`M${cx - 4} 96 L${cx + 4} 96`} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />)}</g>
            <rect x="70" y="85" width="27" height="21" rx="8" fill="none" stroke={INK} strokeWidth={3.2} />
            <rect x="103" y="85" width="27" height="21" rx="8" fill="none" stroke={INK} strokeWidth={3.2} />
            <path d="M97 92 Q100 89 103 92" fill="none" stroke={INK} strokeWidth={3} />
            <path d="M70 92 L63 90" stroke={INK} strokeWidth={3} strokeLinecap="round" />
            <path d="M130 92 L137 90" stroke={INK} strokeWidth={3} strokeLinecap="round" />
            <path d={mood === 'skeptical' ? 'M72 77 Q82 69 93 75' : 'M72 83 Q82 78 93 81'} fill="none" stroke={HAIR} strokeWidth={4.5} strokeLinecap="round" />
            <path d="M107 81 Q118 78 128 83" fill="none" stroke={HAIR} strokeWidth={4.5} strokeLinecap="round" />
            <path d="M100 101 Q96 113 100 116 Q103 117 106 114" fill="none" stroke={SHADE} strokeWidth={2.8} strokeLinecap="round" />
            <Mouth mood={mood} />
          </g>
        </svg>
      </span>
      {wave && (
        <svg className="linc-avatar-wave" viewBox="0 0 200 200" focusable="false">
          <g className="linc-avatar-arm">
            <path d="M146 176 L176 150" stroke={COLLAR} strokeWidth={27} strokeLinecap="round" />
            <path d="M146 176 L176 150" stroke={INK} strokeWidth={23} strokeLinecap="round" />
            <g className="linc-avatar-hand">
              <path d="M176 150 L184 102" stroke={SKIN} strokeWidth={15} strokeLinecap="round" />
              <rect x="175" y="58" width="7" height="28" rx="3.5" fill={SKIN} />
              <rect x="183" y="53" width="7" height="32" rx="3.5" fill={SKIN} />
              <rect x="191" y="56" width="7" height="30" rx="3.5" fill={SKIN} />
              <rect x="198.5" y="63" width="6.5" height="24" rx="3.25" fill={SKIN} />
              <rect x="163" y="80" width="7" height="20" rx="3.5" fill={SKIN} transform="rotate(-40 167 94)" />
              <path d="M174 80 Q173 104 189 105 Q205 104 205 80 Z" fill={SKIN} />
              <path d="M182 88 Q189 91 196 88" fill="none" stroke={SHADE} strokeWidth={1.8} strokeLinecap="round" />
            </g>
          </g>
        </svg>
      )}
    </span>
  );
}
