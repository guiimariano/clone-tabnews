import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';

const BIRTHDAY = new Date('2026-05-21T00:00:00');

function Confetti({ count = 80 }) {
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C00'];
  const pieces = Array.from({ length: count }, (_, i) => {
    const color = colors[i % colors.length];
    const left = Math.random() * 100;
    const delay = Math.random() * 3;
    const duration = 2 + Math.random() * 3;
    const size = 6 + Math.random() * 8;
    const rotation = Math.random() * 360;
    return { color, left, delay, duration, size, rotation, id: i };
  });

  return (
    <div className="confetti-container">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            width: `${p.size}px`,
            height: `${p.size * 1.5}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function Firework({ x, y }) {
  const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#FF8C00', '#DDA0DD'];
  const particles = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 360;
    const color = colors[i % colors.length];
    return { angle, color, id: i };
  });

  return (
    <div className="firework" style={{ left: x, top: y }}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="firework-particle"
          style={{
            backgroundColor: p.color,
            transform: `rotate(${p.angle}deg) translateY(-60px)`,
          }}
        />
      ))}
    </div>
  );
}

export default function Aniversario30() {
  const [timeLeft, setTimeLeft] = useState(null);
  const [isBirthday, setIsBirthday] = useState(false);
  const [fireworks, setFireworks] = useState([]);
  const [showMessage, setShowMessage] = useState(false);
  const fireworkId = useRef(0);

  useEffect(() => {
    function update() {
      const now = new Date();
      const diff = BIRTHDAY - now;

      if (diff <= 0) {
        setIsBirthday(true);
        setTimeLeft(null);
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        const seconds = Math.floor((diff / 1000) % 60);
        setTimeLeft({ days, hours, minutes, seconds });
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isBirthday) return;

    const timeout = setTimeout(() => setShowMessage(true), 500);

    const interval = setInterval(() => {
      const x = `${10 + Math.random() * 80}%`;
      const y = `${10 + Math.random() * 50}%`;
      const id = fireworkId.current++;
      setFireworks((prev) => [...prev, { x, y, id }]);
      setTimeout(() => {
        setFireworks((prev) => prev.filter((f) => f.id !== id));
      }, 1500);
    }, 800);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [isBirthday]);

  if (timeLeft === null && !isBirthday) {
    return null;
  }

  return (
    <>
      <Head>
        <title>30 do Guizão 🎉</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="Página secreta de aniversário" />
      </Head>

      <div className="birthday-page">
        {isBirthday && <Confetti count={100} />}

        <div className="birthday-content">
          {!isBirthday ? (
            <>
              <div className="pre-birthday">
                <h1 className="birthday-title">
                  <span className="emoji-bounce">🎂</span> 30 do Guizão <span className="emoji-bounce">🎂</span>
                </h1>
                <p className="birthday-subtitle">O grande dia está chegando!</p>
                <p className="birthday-date">21 de Maio de 2026</p>

                <div className="countdown">
                  <div className="countdown-item">
                    <span className="countdown-number">{String(timeLeft.days).padStart(2, '0')}</span>
                    <span className="countdown-label">dias</span>
                  </div>
                  <div className="countdown-separator">:</div>
                  <div className="countdown-item">
                    <span className="countdown-number">{String(timeLeft.hours).padStart(2, '0')}</span>
                    <span className="countdown-label">horas</span>
                  </div>
                  <div className="countdown-separator">:</div>
                  <div className="countdown-item">
                    <span className="countdown-number">{String(timeLeft.minutes).padStart(2, '0')}</span>
                    <span className="countdown-label">min</span>
                  </div>
                  <div className="countdown-separator">:</div>
                  <div className="countdown-item">
                    <span className="countdown-number">{String(timeLeft.seconds).padStart(2, '0')}</span>
                    <span className="countdown-label">seg</span>
                  </div>
                </div>

                <div className="fun-facts">
                  <h2>30 fatos sobre ficar mais velho:</h2>
                  <ul>
                    <li>Agora você precisa de 2 dias pra se recuperar de uma festa 🥴</li>
                    <li>Dormir às 22h virou programa de sexta 😴</li>
                    <li>Você já fala "no meu tempo..." sem ironia 👴</li>
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <>
              {fireworks.map((fw) => (
                <Firework key={fw.id} x={fw.x} y={fw.y} />
              ))}

              <div className={`celebration ${showMessage ? 'visible' : ''}`}>
                <h1 className="celebration-title">
                  🎉🎊 PARABÉNS GUIZÃO! 🎊🎉
                </h1>
                <div className="age-badge">
                  <span className="age-number">30</span>
                  <span className="age-text">ANOS</span>
                </div>
                <p className="celebration-message">
                  Trinta anos de pura alegria, código bem escrito e histórias incríveis!
                </p>
                <p className="celebration-sub">
                  Que venham mais 30 com muita saúde, sucesso e deploy sem bug! 🚀
                </p>
                <div className="cake-emoji">🎂🍰🧁🎈🎁🥳</div>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .birthday-page {
          min-height: 100vh;
          background: ${isBirthday
            ? 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)'
            : 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)'};
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          position: relative;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          padding: 20px;
        }

        .birthday-content {
          text-align: center;
          z-index: 10;
          position: relative;
        }

        /* ========== PRE-BIRTHDAY ========== */
        .birthday-title {
          font-size: clamp(2rem, 6vw, 4rem);
          color: #FFD700;
          text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
          margin-bottom: 10px;
          animation: glow 2s ease-in-out infinite alternate;
        }

        .emoji-bounce {
          display: inline-block;
          animation: bounce 1s ease-in-out infinite;
        }

        .birthday-subtitle {
          font-size: clamp(1rem, 3vw, 1.5rem);
          color: #ccc;
          margin-bottom: 5px;
        }

        .birthday-date {
          font-size: clamp(0.9rem, 2.5vw, 1.2rem);
          color: #4ECDC4;
          font-weight: bold;
          margin-bottom: 40px;
        }

        /* Countdown */
        .countdown {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 50px;
        }

        .countdown-item {
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 215, 0, 0.3);
          border-radius: 16px;
          padding: 20px 24px;
          min-width: 80px;
        }

        .countdown-number {
          display: block;
          font-size: clamp(2rem, 6vw, 3.5rem);
          font-weight: 800;
          color: #FFD700;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        .countdown-label {
          display: block;
          font-size: 0.85rem;
          color: #aaa;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-top: 8px;
        }

        .countdown-separator {
          font-size: 2.5rem;
          color: #FFD700;
          font-weight: bold;
          padding-bottom: 20px;
        }

        /* Fun Facts */
        .fun-facts {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 30px;
          max-width: 500px;
          margin: 0 auto;
        }

        .fun-facts h2 {
          color: #FF6B6B;
          font-size: 1.2rem;
          margin-bottom: 15px;
        }

        .fun-facts ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .fun-facts li {
          color: #ddd;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 1rem;
          line-height: 1.5;
        }

        .fun-facts li:last-child {
          border-bottom: none;
        }

        /* ========== CELEBRATION ========== */
        .celebration {
          opacity: 0;
          transform: scale(0.8);
          transition: all 1s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .celebration.visible {
          opacity: 1;
          transform: scale(1);
        }

        .celebration-title {
          font-size: clamp(1.8rem, 5vw, 3.5rem);
          color: #FFD700;
          text-shadow: 0 0 30px rgba(255, 215, 0, 0.6);
          animation: glow 1.5s ease-in-out infinite alternate;
          margin-bottom: 30px;
        }

        .age-badge {
          width: 160px;
          height: 160px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FFD700, #FF8C00);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin: 0 auto 30px;
          box-shadow: 0 0 40px rgba(255, 215, 0, 0.4), 0 0 80px rgba(255, 140, 0, 0.2);
          animation: pulse 2s ease-in-out infinite;
        }

        .age-number {
          font-size: 4.5rem;
          font-weight: 900;
          color: #1a1a2e;
          line-height: 1;
        }

        .age-text {
          font-size: 1rem;
          font-weight: 700;
          color: #1a1a2e;
          letter-spacing: 4px;
        }

        .celebration-message {
          font-size: clamp(1rem, 2.5vw, 1.4rem);
          color: #eee;
          max-width: 600px;
          margin: 0 auto 15px;
          line-height: 1.6;
        }

        .celebration-sub {
          font-size: clamp(0.9rem, 2vw, 1.1rem);
          color: #4ECDC4;
          margin-bottom: 30px;
        }

        .cake-emoji {
          font-size: 3rem;
          letter-spacing: 10px;
          animation: bounce 2s ease-in-out infinite;
        }

        /* ========== ANIMATIONS ========== */
        @keyframes glow {
          from { text-shadow: 0 0 20px rgba(255, 215, 0, 0.4); }
          to { text-shadow: 0 0 40px rgba(255, 215, 0, 0.8), 0 0 60px rgba(255, 215, 0, 0.3); }
        }

        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 40px rgba(255, 215, 0, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 60px rgba(255, 215, 0, 0.6); }
        }
      `}</style>

      <style jsx>{`
        :global(.confetti-container) {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 5;
          overflow: hidden;
        }

        :global(.confetti-piece) {
          position: absolute;
          top: -20px;
          border-radius: 2px;
          animation: confetti-fall linear infinite;
        }

        @keyframes confetti-fall {
          0% {
            top: -10%;
            transform: rotate(0deg) translateX(0);
            opacity: 1;
          }
          100% {
            top: 110%;
            transform: rotate(720deg) translateX(100px);
            opacity: 0.6;
          }
        }

        :global(.firework) {
          position: fixed;
          z-index: 6;
          pointer-events: none;
        }

        :global(.firework-particle) {
          position: absolute;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          animation: firework-explode 1.5s ease-out forwards;
          transform-origin: center center;
        }

        @keyframes firework-explode {
          0% {
            opacity: 1;
            transform: rotate(var(--angle, 0deg)) translateY(0);
          }
          100% {
            opacity: 0;
            transform: rotate(var(--angle, 0deg)) translateY(-100px);
          }
        }
      `}</style>
    </>
  );
}
