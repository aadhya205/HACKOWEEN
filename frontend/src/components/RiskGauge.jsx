import { useEffect, useRef, useState } from "react";

/**
 * Circular risk gauge with animated fill.
 * Severity bands:
 *   0–39: Low (green)
 *   40–69: Medium (amber)
 *   70–89: High (orange)
 *   90–100: Critical (red)
 */
export default function RiskGauge({ risk = 0 }) {
  const [animatedRisk, setAnimatedRisk] = useState(0);
  const animRef = useRef(null);

  useEffect(() => {
    const start = animatedRisk;
    const diff = risk - start;
    const startTime = performance.now();
    const duration = 800;

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedRisk(Math.round(start + diff * eased));
      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risk]);

  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const progress = animatedRisk / 100;
  const dashOffset = circumference * (1 - progress);

  const getColor = (r) => {
    if (r >= 90) return "#FF365D";
    if (r >= 70) return "#FF7832";
    if (r >= 40) return "#FFB547";
    return "#4BE3A4";
  };

  const getSeverityLabel = (r) => {
    if (r >= 90) return "Critical";
    if (r >= 70) return "High";
    if (r >= 40) return "Medium";
    return "Low";
  };

  const color = getColor(animatedRisk);
  const severity = getSeverityLabel(animatedRisk);

  return (
    <div className="risk-gauge">
      <div className="risk-gauge-circle">
        <svg viewBox="0 0 120 120">
          <circle className="gauge-bg" cx="60" cy="60" r={radius} />
          <circle
            className="gauge-fill"
            cx="60"
            cy="60"
            r={radius}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              filter: `drop-shadow(0 0 6px ${color}40)`,
            }}
          />
        </svg>
        <div className="risk-gauge-value">
          <span className="gauge-number" style={{ color }}>
            {animatedRisk}
          </span>
          <span className="gauge-label">RISK</span>
        </div>
      </div>
      <span className={`severity-badge ${severity.toLowerCase()}`}>{severity}</span>
    </div>
  );
}
