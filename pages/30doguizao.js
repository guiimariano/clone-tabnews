import Head from 'next/head';
import { useState, useEffect, useMemo } from 'react';

const PARTY_DATE = new Date('2026-05-23T00:00:00');

function Particles({ count = 40 }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1 + Math.random() * 2,
        duration: 4 + Math.random() * 8,
        delay: Math.random() * 6,
        opacity: 0.15 + Math.random() * 0.35,
      })),
    [count],
  );

  return (
    <>
      {dots.map((d) => (
        <div
          key={d.id}
          className="particle"
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: `${d.size}px`,
            height: `${d.size}px`,
            opacity: d.opacity,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </>
  );
}

export default function SaveTheDate() {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    function tick() {
      const now = new Date();
      const diff = PARTY_DATE - now;
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (!timeLeft) return null;

  const units = [
    { value: timeLeft.days, label: 'DIAS' },
    { value: timeLeft.hours, label: 'HRS' },
    { value: timeLeft.minutes, label: 'MIN' },
    { value: timeLeft.seconds, label: 'SEG' },
  ];

  return (
    <>
      <Head>
        <title>? ? ?</title>
        <meta name="robots" content="noindex, nofollow" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@200;300;400;600;800&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="page">
        <Particles />

        {/* Glow orbs */}
        <div className="orb orb-1" />
        <div className="orb orb-2" />

        <div className="content">
          <p className="overline">SAVE THE DATE</p>

          <h1 className="title">23 . 05 . 26</h1>

          <div className="line" />

          <p className="mystery">Algo está por vir.</p>

          <div className="countdown">
            {units.map((u, i) => (
              <div key={u.label} className="unit">
                <span className="number">
                  {String(u.value).padStart(2, '0')}
                </span>
                <span className="label">{u.label}</span>
              </div>
            ))}
          </div>

          <p className="hint">Mais informações em breve...</p>
        </div>
      </div>

      <style jsx>{`
        /* ===== BASE ===== */
        .page {
          position: relative;
          min-height: 100vh;
          background: #050505;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-family: 'Outfit', sans-serif;
          padding: 24px;
        }

        /* ===== AMBIENT ORBS ===== */
        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
        }
        .orb-1 {
          width: 500px;
          height: 500px;
          background: rgba(255, 255, 255, 0.03);
          top: -15%;
          left: -10%;
          animation: drift 18s ease-in-out infinite alternate;
        }
        .orb-2 {
          width: 400px;
          height: 400px;
          background: rgba(255, 255, 255, 0.02);
          bottom: -20%;
          right: -10%;
          animation: drift 22s ease-in-out infinite alternate-reverse;
        }

        /* ===== PARTICLES ===== */
        :global(.particle) {
          position: absolute;
          border-radius: 50%;
          background: #fff;
          animation: float linear infinite;
          pointer-events: none;
        }

        /* ===== CONTENT ===== */
        .content {
          position: relative;
          z-index: 2;
          text-align: center;
          animation: fadeUp 1.2s ease-out both;
        }

        .overline {
          font-size: clamp(0.65rem, 1.5vw, 0.8rem);
          letter-spacing: 6px;
          color: rgba(255, 255, 255, 0.35);
          margin-bottom: 20px;
          font-weight: 300;
        }

        .title {
          font-size: clamp(2.8rem, 10vw, 7rem);
          font-weight: 200;
          color: #fff;
          letter-spacing: 0.15em;
          margin: 0;
          line-height: 1;
          animation: subtle-glow 4s ease-in-out infinite alternate;
        }

        .line {
          width: 50px;
          height: 1px;
          background: rgba(255, 255, 255, 0.15);
          margin: 30px auto;
        }

        .mystery {
          font-size: clamp(0.95rem, 2.5vw, 1.25rem);
          color: rgba(255, 255, 255, 0.5);
          font-weight: 300;
          font-style: italic;
          margin-bottom: 50px;
          letter-spacing: 1px;
        }

        /* ===== COUNTDOWN ===== */
        .countdown {
          display: flex;
          justify-content: center;
          gap: clamp(12px, 4vw, 30px);
          margin-bottom: 50px;
        }

        .unit {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 60px;
        }

        .number {
          font-size: clamp(2rem, 6vw, 3.8rem);
          font-weight: 800;
          color: #fff;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          text-shadow: 0 0 30px rgba(255, 255, 255, 0.08);
        }

        .label {
          font-size: 0.6rem;
          letter-spacing: 3px;
          color: rgba(255, 255, 255, 0.25);
          margin-top: 10px;
          font-weight: 400;
        }

        .hint {
          font-size: clamp(0.7rem, 1.5vw, 0.85rem);
          color: rgba(255, 255, 255, 0.18);
          letter-spacing: 2px;
          font-weight: 300;
          animation: blink 3s ease-in-out infinite;
        }

        /* ===== ANIMATIONS ===== */
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes subtle-glow {
          from {
            text-shadow: 0 0 40px rgba(255, 255, 255, 0.04);
          }
          to {
            text-shadow: 0 0 80px rgba(255, 255, 255, 0.1);
          }
        }

        @keyframes drift {
          from { transform: translate(0, 0); }
          to { transform: translate(40px, 30px); }
        }

        @keyframes float {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0;
          }
          10% {
            opacity: var(--opacity, 0.3);
          }
          90% {
            opacity: var(--opacity, 0.3);
          }
          100% {
            transform: translateY(-100vh) scale(0.5);
            opacity: 0;
          }
        }

        @keyframes blink {
          0%, 100% { opacity: 0.18; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </>
  );
}
