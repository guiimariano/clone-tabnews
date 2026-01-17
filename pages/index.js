import Head from 'next/head';

const contact = {
  phone: '+55 11 97320-8536',
  email: 'pro.gmariano@gmail.com',
  linkedin: {
    label: 'linkedin.com/in/guiimariano21',
    url: 'https://www.linkedin.com/in/guiimariano21',
  },
  location: 'São Paulo, São Paulo, Brasil',
};

const summary = {
  pt: 'Engenheiro de Frontend com mais de 7 anos construindo produtos Angular para empresas enterprise. Na Avanade lidero iniciativas de micro frontends, evoluo design systems e acelero squads com foco em performance e acessibilidade. Conecto métricas de negócio a jornadas intuitivas, mentoro o time em melhores práticas modernas e uso testes e observabilidade para garantir releases confiáveis.',
  en: 'Frontend Engineer with 7+ years building Angular products for enterprise teams. At Avanade I drive micro frontend initiatives, evolve design systems, and accelerate squads through performance and accessibility audits. I partner with stakeholders to turn business metrics into intuitive journeys, mentor engineers on modern tooling, and rely on testing plus observability to ship reliable releases.',
};

const skills = ['Angular', 'TypeScript', 'JavaScript', 'NgRx', 'Jest', 'Jasmine', 'Git', 'NextJs', 'CI/CD', 'Micro Frontends', 'Performance Optimization', 'Accessibility'];

const certifications = ['Técnico em Informática (ETESP)', 'Microsoft Certified: Conceitos básicos da IA do Azure', 'Análise e Desenvolvimento de Sistemas (IFSP)'];

const experiences = [
  {
    company: 'Avanade',
    role: 'Software Engineer',
    period: 'Fevereiro de 2020 – Atual',
    projects: [
      {
        name: 'Gol Linhas Aéreas',
        bullets: [
          'Atuação na Squad de Pós Vendas',
          'Desenvolvimento de soluções para gestão de viagens',
          'Angular 17 com arquitetura de Micro Frontends',
          'Ferramentas: Jira, Azure DevOps, GitHub Copilot',
        ],
      },
      {
        name: 'Prudential do Brasil',
        bullets: [
          'Manutenção e criação de telas em sistemas de propostas e apólices',
          'Angular 12+',
          'Squads ágeis',
          'Ferramentas: Azure DevOps, Git, Jira, SonarQube',
        ],
      },
      {
        name: 'Santander Financiamento',
        bullets: [
          'Desenvolvimento de componentes reutilizáveis',
          'AngularJS, Angular 8, Bootstrap',
          'Foco em performance e responsividade',
        ],
      },
      {
        name: 'Mapfre Seguradora',
        bullets: [
          'Criação e manutenção de portais web e institucionais',
          'Angular 12, WordPress, HTML, CSS, JavaScript',
        ],
      },
    ],
  },
  {
    company: 'Empflex Technologies',
    role: 'Software Engineer (Fullstack)',
    period: 'Abril de 2019 – Janeiro de 2020',
    bullets: [
      'Desenvolvimento de sistemas ERP Web',
      'PHP e MS SQL Server',
      'Atendimento ao cliente',
    ],
  },
  {
    company: 'TWO-S Motion Solutions',
    role: 'Analista e Desenvolvedor de Sistemas',
    period: 'Dezembro de 2017 – Abril de 2019',
    bullets: [
      'Análise de sistemas em projetos inovadores',
      'Desenvolvimento em PHP',
      'WebServices em .NET',
      'Aplicativos com Xamarin',
    ],
  },
  {
    company: 'NN Autocam',
    role: 'IT Trainee',
    period: 'Maio de 2015 – Agosto de 2016',
    bullets: [],
  },
];

const education = {
  institution: 'Instituto Federal de Educação, Ciência e Tecnologia de São Paulo (IFSP)',
  course: 'Análise e Desenvolvimento de Sistemas',
  period: '2014 – 2019',
};

const birthDate = new Date('1996-05-21T00:00:00');

function getAge(date) {
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
}

function Home() {
  const age = getAge(birthDate);
  const personalLife = {
    pt: `Tenho ${age} anos, moro na Zona Norte de São Paulo, sou casado e não tenho filhos. Possuo mobilidade reduzida e caminho com o auxílio de uma bengala, o que me torna ainda mais atento a rotinas cuidadosamente planejadas e ambientes verdadeiramente inclusivos.`,
    en: `I'm ${age} years old, live in the North Zone of São Paulo, married and without kids. I move with reduced mobility and rely on a cane, which makes me even more intentional about well-planned routines and genuinely inclusive environments.`,
  };
  return (
    <>
      <Head>
        <title>Guilherme Mariano</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <main>
        <header className="hero">
          <h1>Guilherme Mariano</h1>
          <h2>Software Engineer · Senior Frontend Developer · Angular</h2>
          <p className="location">{contact.location}</p>
        </header>

        <section className="card split">
          <div>
            <h3>Contato</h3>
            <ul className="contact-list">
              <li>
                <span>Telefone</span>
                <a href={`tel:${contact.phone.replace(/\s+/g, '')}`}>{contact.phone}</a>
              </li>
              <li>
                <span>Email</span>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
              <li>
                <span>LinkedIn</span>
                <a href={contact.linkedin.url} target="_blank" rel="noreferrer">
                  {contact.linkedin.label}
                </a>
              </li>
            </ul>
            <div className="profile-card">
              <img src="/assets/profile/guilherme-mariano.jpg" alt="Foto profissional de Guilherme Mariano" />
              <p className="profile-caption">Software Engineer · Frontend Leadership</p>
            </div>
          </div>
          <div>
            <h3>Resumo Profissional</h3>
            <div className="language-card">
              <span className="language-pill">PT-BR</span>
              <p className="summary">{summary.pt}</p>
            </div>
            <div className="language-card">
              <span className="language-pill">EN</span>
              <p className="summary">{summary.en}</p>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Vida Pessoal</h3>
          <div className="language-card">
            <span className="language-pill">PT-BR</span>
            <p className="personal-text">{personalLife.pt}</p>
          </div>
          <div className="language-card">
            <span className="language-pill">EN</span>
            <p className="personal-text">{personalLife.en}</p>
          </div>
        </section>

        <section className="card grid">
          <div>
            <h3>Principais Competências</h3>
            <ul className="tag-list">
              {skills.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Certificações</h3>
            <ul>
              {certifications.map((cert) => (
                <li key={cert}>{cert}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card">
          <h3>Experiência Profissional</h3>
          <div className="timeline">
            {experiences.map((experience) => (
              <article key={experience.company}>
                <header>
                  <h4>{experience.company}</h4>
                  <p>
                    <strong>{experience.role}</strong>
                    <span> · {experience.period}</span>
                  </p>
                </header>
                {experience.projects ? (
                  experience.projects.map((project) => (
                    <div key={`${experience.company}-${project.name}`} className="project">
                      <p className="project-name">{project.name}</p>
                      <ul>
                        {project.bullets.map((item) => (
                          <li key={`${project.name}-${item}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <ul>
                    {(experience.bullets || []).length ? (
                      experience.bullets?.map((item) => (
                        <li key={`${experience.company}-${item}`}>{item}</li>
                      ))
                    ) : (
                      <li>Período de formação e imersão em tecnologia.</li>
                    )}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Formação Acadêmica</h3>
          <p className="education">
            <strong>{education.institution}</strong>
            <br />
            {education.course}
            <br />
            {education.period}
          </p>
        </section>
      </main>
      <style jsx global>{`
        :root {
          --bg: #030711;
          --bg-accent: #0b111f;
          --card: rgba(12, 17, 32, 0.92);
          --accent: #ff6f3c;
          --accent-soft: #ffd4c0;
          --text: #f4f6fa;
          --muted: #b8c2d6;
          --border: rgba(255, 255, 255, 0.08);
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
          background: radial-gradient(circle at top, #14244c 0%, var(--bg) 45%), var(--bg-accent);
          color: var(--text);
          min-height: 100vh;
        }

        main {
          max-width: 1000px;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .hero {
          text-align: center;
          padding: 3rem 1.5rem;
          background: linear-gradient(135deg, rgba(255, 111, 60, 0.12), rgba(255, 255, 255, 0));
          border-radius: 32px;
          border: 1px solid var(--border);
          backdrop-filter: blur(12px);
        }

        .hero h1 {
          margin: 0.5rem 0 0;
          font-size: clamp(2.4rem, 4vw, 3.5rem);
        }

        .hero h2 {
          margin: 0.5rem 0 0;
          font-weight: 500;
          color: var(--muted);
        }

        .location {
          margin-top: 0.75rem;
          color: var(--muted);
        }

        .card {
          padding: 2rem;
          border-radius: 28px;
          background: var(--card);
          border: 1px solid var(--border);
          backdrop-filter: blur(10px);
        }

        h3 {
          margin: 0 0 1rem;
          font-size: 1.25rem;
        }

        .split {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1.5rem;
        }

        .contact-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .contact-list li {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .contact-list span {
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.15em;
          color: var(--muted);
        }

        a {
          color: var(--accent);
          text-decoration: none;
        }

        .summary {
          color: var(--muted);
          line-height: 1.6;
          margin: 0;
        }

        .language-card {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 18px;
          padding: 1rem 1.25rem;
          background: rgba(255, 255, 255, 0.02);
          margin-bottom: 1rem;
        }

        .language-card:last-child {
          margin-bottom: 0;
        }

        .language-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          background: rgba(255, 111, 60, 0.15);
          color: var(--accent-soft);
          font-size: 0.75rem;
          letter-spacing: 0.1em;
        }

        .profile-card {
          margin-bottom: 1.25rem;
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
        }

        .profile-card img {
          width: 100%;
          display: block;
          height: auto;
        }

        .profile-caption {
          margin: 0;
          padding: 0.85rem 1rem;
          text-align: center;
          color: var(--muted);
          font-size: 0.95rem;
        }

        .personal-text {
          color: var(--muted);
          line-height: 1.7;
          margin: 0;
        }

        .tag-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-wrap: wrap;
          gap: 0.75rem;
        }

        .tag-list li {
          padding: 0.4rem 0.9rem;
          border-radius: 999px;
          background: rgba(255, 111, 60, 0.1);
          color: var(--accent-soft);
          border: 1px solid rgba(255, 111, 60, 0.3);
          font-size: 0.95rem;
        }

        .timeline article + article {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--border);
        }

        .timeline h4 {
          margin: 0;
          font-size: 1.2rem;
        }

        .timeline header p {
          margin: 0.25rem 0 0;
          color: var(--muted);
        }

        .timeline ul {
          margin: 0.75rem 0 0;
          padding-left: 1.2rem;
          color: var(--muted);
        }

        .project {
          margin-top: 1rem;
          padding: 1rem;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(255, 255, 255, 0.02);
        }

        .project-name {
          margin: 0;
          font-weight: 600;
          color: var(--accent-soft);
        }

        .education {
          color: var(--muted);
          line-height: 1.6;
        }

        @media (max-width: 600px) {
          main {
            padding: 2rem 1rem 3rem;
          }

          .card {
            padding: 1.5rem;
          }
        }
      `}</style>
    </>
  );
}

export default Home;
