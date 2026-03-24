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
        <title>Jenny & Gui Fazem 30</title>
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
          <p className="overline">JENNY & GUI FAZEM</p>

          <h1 className="title">30</h1>

          <p className="date-sub">23 . 05 . 26</p>

          <p className="roman">XXX</p>

          <div className="line" />

          <div className="location">
            <span className="location-pin">📍</span>
            <p className="location-text">Rua Capitão Amaral, 80 (Stay)</p>
            <p className="location-hood">Santana</p>
          </div>

          <div className="lineup">
            <p className="lineup-label">LINE UP</p>
            <p className="lineup-name">???</p>
            <p className="lineup-genre">Nostalgic Musics</p>
          </div>

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

          <div className="clues">
            <span className="clue">+18</span>
            <span className="clue-dot" />
            <span className="clue">se for beber, vá de uber</span>
          </div>

          <div className="eq">
            <span className="eq-bar" style={{ height: '12px', animationDelay: '0s' }} />
            <span className="eq-bar" style={{ height: '20px', animationDelay: '0.15s' }} />
            <span className="eq-bar" style={{ height: '16px', animationDelay: '0.3s' }} />
            <span className="eq-bar" style={{ height: '24px', animationDelay: '0.1s' }} />
            <span className="eq-bar" style={{ height: '14px', animationDelay: '0.25s' }} />
          </div>

          <p className="hint">Line up completo em breve...</p>

          <p className="dj-hint">▶ press play when ready</p>
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
          font-size: clamp(4.5rem, 18vw, 12rem);
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

        .date-sub {
          font-size: clamp(0.8rem, 2vw, 1.1rem);
          letter-spacing: 0.3em;
          color: rgba(255, 255, 255, 0.25);
          font-weight: 200;
          margin: 12px 0 0;
        }

        .location {
          text-align: center;
          margin-bottom: 30px;
        }

        .location-pin {
          font-size: 1rem;
          display: block;
          margin-bottom: 8px;
          opacity: 0.5;
        }

        .location-text {
          font-size: clamp(0.75rem, 1.8vw, 0.95rem);
          color: rgba(255, 255, 255, 0.45);
          font-weight: 300;
          letter-spacing: 1.5px;
          margin: 0;
        }

        .location-hood {
          font-size: clamp(0.6rem, 1.2vw, 0.75rem);
          color: rgba(255, 255, 255, 0.2);
          font-weight: 200;
          letter-spacing: 3px;
          text-transform: uppercase;
          margin: 6px 0 0;
        }

        .lineup {
          margin-bottom: 40px;
          text-align: center;
        }

        .lineup-label {
          font-size: clamp(0.55rem, 1.2vw, 0.7rem);
          letter-spacing: 5px;
          color: rgba(255, 255, 255, 0.25);
          font-weight: 300;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .lineup-name {
          font-size: clamp(1.1rem, 3vw, 1.5rem);
          color: rgba(255, 255, 255, 0.5);
          font-weight: 300;
          letter-spacing: 2px;
          margin: 0 0 6px;
          animation: blink 3s ease-in-out infinite;
        }

        .lineup-genre {
          font-size: clamp(0.6rem, 1.2vw, 0.75rem);
          color: rgba(255, 255, 255, 0.2);
          font-weight: 200;
          font-style: italic;
          letter-spacing: 2px;
          margin: 0;
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

        /* ===== CLUES ===== */
        .roman {
          font-size: clamp(0.6rem, 1.2vw, 0.75rem);
          letter-spacing: 8px;
          color: rgba(255, 255, 255, 0.12);
          margin: 8px 0 0;
          font-weight: 200;
        }

        .clues {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          margin-bottom: 50px;
        }

        .clue {
          font-size: clamp(0.55rem, 1.2vw, 0.7rem);
          letter-spacing: 3px;
          color: rgba(255, 255, 255, 0.14);
          font-weight: 300;
          text-transform: uppercase;
        }

        .clue-dot {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
        }

        /* ===== EQ BARS ===== */
        .eq {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 3px;
          margin-bottom: 40px;
          height: 28px;
          opacity: 0.12;
        }

        .eq-bar {
          display: block;
          width: 2px;
          background: #fff;
          border-radius: 1px;
          animation: eqPulse 1.2s ease-in-out infinite alternate;
        }

        .dj-hint {
          font-size: 0.55rem;
          letter-spacing: 4px;
          color: rgba(255, 255, 255, 0.08);
          font-weight: 300;
          text-transform: uppercase;
          margin-top: 30px;
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

        @keyframes eqPulse {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }

        :global(html),
        :global(body) {
          margin: 0;
          padding: 0;
          background: #050505;
        }
      `}</style>
    </>
  );
}
