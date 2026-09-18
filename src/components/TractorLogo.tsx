/**
 * The mark: a tractor, driving and bobbing to the music.
 *
 * "Tracktour" is a tractor if you say it fast enough, so the logo takes the pun
 * literally. It is drawn rather than animated as a GIF so it stays sharp at any
 * size, picks up the album's accent colour like everything else, and holds
 * still for anyone who has asked for reduced motion.
 *
 * The rig and the wheels are separate groups on purpose: the body squashes and
 * stretches on the beat while the wheels stay planted and keep turning, which
 * reads as a vehicle bouncing on its suspension rather than one hopping off the
 * ground.
 */
export function TractorLogo({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="tractor"
      width={(size * 48) / 32}
      height={size}
      viewBox="0 0 48 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g className="tractor-rig">
        {/* Exhaust smoke, puffing on the upbeat. */}
        <g className="tractor-smoke">
          <circle className="tractor-puff tractor-puff-1" cx="27" cy="3.4" r="1.9" />
          <circle className="tractor-puff tractor-puff-2" cx="27" cy="3.4" r="1.5" />
          <circle className="tractor-puff tractor-puff-3" cx="27" cy="3.4" r="1.2" />
        </g>

        {/* Exhaust stack */}
        <rect className="tractor-dark" x="25.6" y="4.6" width="2.6" height="11.4" rx="1.1" />

        {/* Cab */}
        <path
          className="tractor-accent"
          d="M10.5 16V5.6a1.6 1.6 0 0 1 1.6-1.6h8.6a1.6 1.6 0 0 1 1.5 1.1l2 9.4V16z"
        />
        <rect className="tractor-glass" x="13" y="6.7" width="6.6" height="6.6" rx="1.2" />

        {/* Chassis and hood */}
        <path
          className="tractor-accent"
          d="M7.5 16h29.2a1.8 1.8 0 0 1 1.8 1.8v4.4a1.8 1.8 0 0 1-1.8 1.8H7.5z"
        />
        <rect className="tractor-dark" x="30" y="18.4" width="7.4" height="2" rx="1" />
      </g>

      {/* Wheels stay on the ground, and keep rolling regardless of the beat. */}
      <g className="tractor-wheels">
        <circle className="tractor-tyre" cx="34.5" cy="24.5" r="5.2" />
        <circle className="tractor-hub" cx="34.5" cy="24.5" r="1.9" />
        <g className="tractor-spin tractor-spin-front">
          <rect className="tractor-hub" x="33.9" y="19.9" width="1.2" height="9.2" rx="0.6" />
          <rect className="tractor-hub" x="33.9" y="19.9" width="1.2" height="9.2" rx="0.6"
            transform="rotate(60 34.5 24.5)" />
          <rect className="tractor-hub" x="33.9" y="19.9" width="1.2" height="9.2" rx="0.6"
            transform="rotate(120 34.5 24.5)" />
        </g>

        <circle className="tractor-tyre" cx="13.5" cy="21.5" r="8.4" />
        <circle className="tractor-hub" cx="13.5" cy="21.5" r="3" />
        <g className="tractor-spin tractor-spin-rear">
          <rect className="tractor-hub" x="12.8" y="13.6" width="1.4" height="15.8" rx="0.7" />
          <rect className="tractor-hub" x="12.8" y="13.6" width="1.4" height="15.8" rx="0.7"
            transform="rotate(45 13.5 21.5)" />
          <rect className="tractor-hub" x="12.8" y="13.6" width="1.4" height="15.8" rx="0.7"
            transform="rotate(90 13.5 21.5)" />
          <rect className="tractor-hub" x="12.8" y="13.6" width="1.4" height="15.8" rx="0.7"
            transform="rotate(135 13.5 21.5)" />
        </g>
      </g>
    </svg>
  )
}
