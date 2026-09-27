// ─────────────────────────────────────────────────────────────────────────────
//  All portfolio content lives here. Edit this file to change what the site says.
//  Empty strings / missing links are hidden automatically.
// ─────────────────────────────────────────────────────────────────────────────

export interface SocialLinks {
  linkedin: string;
  github: string; // full URL, e.g. https://github.com/your-handle
  x: string;
  email: string;
  phone: string; // shown only when showPhone is true
}

export interface Highlight {
  /** Plain text parts and {accent} parts rendered in the handwritten red font. */
  parts: (string | { accent: string } | { strong: string; href?: string })[];
  icon?: 'code' | 'zap' | 'phone' | 'cap' | 'award' | 'heart';
}

export interface Role {
  title: string;
  start: string; // "Apr 2025"
  end: string; // "Present"
  bullets: string[];
}

export interface Experience {
  company: string;
  companyNote?: string; // "formerly ApplicateAI"
  url?: string;
  location: string;
  logo?: string; // path under /public, optional — falls back to a monogram
  monogram: string;
  color: string; // monogram background
  roles: Role[]; // newest first — multiple roles = promotion ladder
  metrics?: { value: number; suffix: string; label: string; prefix?: string; decimals?: number }[];
}

export interface Education {
  school: string;
  location: string;
  degree: string;
  detail: string;
  start: string;
  end: string;
  monogram: string;
  color: string;
}

export interface Project {
  id: string;
  title: string;
  subtitle: string; // red handwritten tagline under the title
  blurb: string;
  bullets: string[];
  tech: string[];
  kind: 'personal' | 'work' | 'this-site';
  image?: string; // optional screenshot under /public/images/projects/
  /** Background tint for the card image area when no screenshot is present */
  tint: string;
  emoji: string; // fallback art glyph
  links: { repo?: string; live?: string; caseStudy?: string };
}

export interface LatelyItem {
  id: string;
  tag: string; // handwritten red label
  tagIcon: 'trophy' | 'rocket' | 'award' | 'zap' | 'phone' | 'radar' | 'coffee';
  title: string;
  blurb: string;
  detail: string; // longer text shown when the card is opened
  date: string;
  tint: string;
  image?: string;
  links?: { label: string; href: string }[];
}

export interface SkillGroup {
  label: string;
  icon: 'code' | 'server' | 'layout' | 'phone' | 'database' | 'zap' | 'cloud' | 'wrench' | 'shield' | 'brain';
  items: string[];
}

export const profile = {
  name: 'Avijit Rana',
  firstName: 'Avijit',
  initials: 'AR',
  role: 'Senior Software Engineer',
  location: 'Gurugram, India',
  /** One line under the name: the first entry is handwritten in red, the rest are plain (keep it short so it fits one line). */
  taglines: ['I make backends fast & calm', 'Senior Software Engineer @ SalesCodeAI'],
  /** One-line pitch for the connect card and other tight spots. */
  pitch:
    'Senior Software Engineer building event-driven Java / Spring Boot backends on Kafka, Redis and AWS, plus Flutter apps used by 500K+ people.',
  /** Short intro used in meta description and the connect card. */
  summary:
    'Backend-focused Senior Software Engineer with 3+ years of experience architecting scalable Java / Spring Boot microservices and Kafka/Redis-driven event architectures on AWS, alongside cross-platform Flutter apps for Fortune 500 clients like Coca-Cola and ITC.',
  /** Photo for the polaroid. Put a square-ish image at public/images/avatar.jpg — until then a doodle is shown. */
  avatar: 'images/avatar.jpg',
  /** GitHub username for the contribution graph. Leave empty to show a sample graph. */
  githubUsername: '',
  showPhone: false,
  openToWork: true,
  socials: {
    linkedin: 'https://www.linkedin.com/in/avijit-rana/',
    github: 'https://github.com/AvijitRana424',
    x: '',
    email: 'ranaavijit80@gmail.com',
    phone: '+91 6296392470',
  } satisfies SocialLinks,

  highlights: [
    {
      icon: 'code',
      parts: [
        'Currently a Senior Software Engineer at ',
        { strong: 'SalesCodeAI', href: 'https://in.linkedin.com/company/salescodeai' },
        ', owning system design for event-driven backend services.',
      ],
    },
    {
      icon: 'zap',
      parts: [
        'Led the move to ',
        { accent: 'Kafka event-driven microservices' },
        ' (+35% throughput) and a Redis caching redesign (−40% API latency).',
      ],
    },
    {
      icon: 'phone',
      parts: ['Shipped Flutter apps for ', { accent: 'Coca-Cola & ITC' }, ': 500K+ downloads, rated 4.6★ on the Play Store.'],
    },
    {
      icon: 'cap',
      parts: ['B.Tech IT from Chitkara University with a ', { accent: '9.51 CGPA' }, ' (2020–2024).'],
    },
    {
      icon: 'heart',
      parts: [
        'I care about ',
        { accent: 'clean architecture' },
        ', SOLID code and mentoring. Good systems should be boring to operate.',
      ],
    },
  ] satisfies Highlight[],

  experience: [
    {
      company: 'SalesCodeAI',
      companyNote: 'formerly ApplicateAI',
      url: 'https://in.linkedin.com/company/salescodeai',
      location: 'Gurugram, India',
      monogram: 'S',
      color: '#1f4e5f',
      metrics: [
        { value: 35, suffix: '%', label: 'more throughput', prefix: '+' },
        { value: 40, suffix: '%', label: 'lower API latency', prefix: '−' },
        { value: 99.5, suffix: '%', label: 'notification delivery', decimals: 1 },
        { value: 500, suffix: 'K+', label: 'app downloads' },
        { value: 98, suffix: '%', label: 'on-time delivery' },
      ],
      roles: [
        {
          title: 'Senior Software Engineer',
          start: 'Apr 2025',
          end: 'Present',
          bullets: [
            'Architected and led the migration to a Kafka-based event-driven microservices architecture, improving system throughput by 35% and enabling horizontal scalability across services.',
            'Redesigned the caching strategy with Redis and optimized database indexing, reducing average API latency by 40% for high-traffic order and inventory endpoints.',
            'Owned system design and architecture reviews for new backend modules, applying SOLID principles and design patterns to improve maintainability and reduce production incidents.',
            'Led code reviews and mentored junior engineers on Spring Boot, concurrency and multithreading, while driving CI/CD improvements on AWS that kept on-time delivery at 98%.',
          ],
        },
        {
          title: 'Software Engineer',
          start: 'Sep 2023',
          end: 'Mar 2025',
          bullets: [
            'Built enterprise-grade Cart & Order Management microservices with Spring Boot and REST APIs, handling complex order lifecycles and real-time inventory validation for thousands of daily transactions.',
            'Developed real-time notification systems using Firebase Cloud Messaging and AWS SNS integrated with Kafka event streams, achieving 99.5% delivery success.',
            'Engineered Flutter cross-platform mobile apps for enterprise clients including Coca-Cola and ITC, delivering 500K+ downloads with a 4.6★ Play Store rating.',
            'Established an offline-first architecture using Hive local storage with delta sync, cutting data-sync time by 45% in low-connectivity conditions, and automated Swagger/OpenAPI docs within Agile/Scrum sprints.',
          ],
        },
      ],
    },
  ] satisfies Experience[],

  education: [
    {
      school: 'Chitkara University',
      location: 'Himachal Pradesh, India',
      degree: 'B.Tech in Information Technology',
      detail: 'CGPA 9.51 / 10',
      start: 'Aug 2020',
      end: 'Aug 2024',
      monogram: 'CU',
      color: '#7a2e2e',
    },
  ] satisfies Education[],

  achievements: [
    { title: 'Exceptional Performer Award', org: 'SalesCodeAI', year: '2025–2026' },
  ],

  skills: [
    { label: 'Languages', icon: 'code', items: ['Java', 'JavaScript', 'Dart'] },
    {
      label: 'Backend',
      icon: 'server',
      items: ['Spring Boot', 'Spring MVC', 'Spring Security', 'Hibernate', 'JPA', 'REST APIs', 'Microservices', 'Event-Driven Architecture'],
    },
    { label: 'Frontend', icon: 'layout', items: ['React.js', 'Next.js', 'HTML', 'CSS'] },
    { label: 'Mobile', icon: 'phone', items: ['Flutter', 'Hive'] },
    { label: 'Databases', icon: 'database', items: ['MySQL', 'PostgreSQL', 'MongoDB'] },
    { label: 'Messaging & Caching', icon: 'zap', items: ['Kafka', 'Redis'] },
    { label: 'Cloud', icon: 'cloud', items: ['AWS EC2', 'AWS S3', 'AWS RDS', 'AWS SNS', 'Firebase'] },
    { label: 'DevOps', icon: 'wrench', items: ['Docker', 'CI/CD', 'Git', 'Maven', 'Gradle', 'CodeMagic'] },
    { label: 'Security', icon: 'shield', items: ['JWT', 'OAuth2', 'RBAC'] },
    {
      label: 'Concepts',
      icon: 'brain',
      items: ['System Design', 'Design Patterns', 'SOLID', 'Concurrency', 'Multithreading', 'Data Structures', 'Algorithms', 'OOP', 'Agile / Scrum'],
    },
  ] satisfies SkillGroup[],

  projects: [
    {
      id: 'ecommerce',
      title: 'E-Commerce Platform',
      subtitle: 'Secure microservices backend',
      blurb: 'Scalable, secure RESTful microservices with JWT/OAuth2 auth and Kafka-driven async order processing.',
      bullets: [
        'Layered Spring Boot microservices with JWT / OAuth2 authentication and authorization.',
        'Kafka for asynchronous order & event processing, which kept it responsive under concurrent load.',
        'Secure email-based password recovery and role-based access control.',
      ],
      tech: ['Spring Boot', 'MySQL', 'JWT', 'Kafka', 'OAuth2', 'Microservices'],
      kind: 'personal',
      tint: '#f6d9c4',
      emoji: '🛒',
      links: {},
    },
    {
      id: 'memory-bank',
      title: 'Memory Bank',
      subtitle: 'Full-stack social platform',
      blurb: 'A social media platform with Google OAuth2 sign-in, posts, likes, comments and fast search.',
      bullets: [
        'Full-stack app with secure Google OAuth2 authentication, posts, likes and comments.',
        'Role-based access control and optimized advanced search for performance at scale.',
      ],
      tech: ['React', 'Node.js', 'Express', 'MongoDB', 'OAuth2'],
      kind: 'personal',
      tint: '#d9d4f6',
      emoji: '📸',
      links: {},
    },
    {
      id: 'order-platform',
      title: 'Cart & Order Engine',
      subtitle: 'Work · SalesCodeAI',
      blurb: 'Enterprise cart & order-management microservices with real-time inventory validation for thousands of daily orders.',
      bullets: [
        'Complex order lifecycles with real-time inventory validation.',
        'Kafka event streams feeding FCM + AWS SNS notifications at 99.5% delivery success.',
        'Redis caching + index tuning: −40% latency on hot endpoints.',
      ],
      tech: ['Java', 'Spring Boot', 'Kafka', 'Redis', 'AWS'],
      kind: 'work',
      tint: '#cfe6d8',
      emoji: '📦',
      links: {},
    },
    {
      id: 'field-app',
      title: 'Offline-first Retail App',
      subtitle: 'Work · Coca-Cola & ITC',
      blurb: 'Cross-platform Flutter apps for Fortune 500 field teams: 500K+ downloads, 4.6★, delta sync that works on bad networks.',
      bullets: [
        'Flutter apps used by enterprise field teams: 500K+ downloads, 4.6★ rating.',
        'Offline-first Hive storage with delta sync: 45% faster sync in low connectivity.',
      ],
      tech: ['Flutter', 'Dart', 'Hive', 'Firebase', 'CodeMagic'],
      kind: 'work',
      tint: '#f7e8a4',
      emoji: '📱',
      links: {},
    },
    {
      id: 'job-radar',
      title: 'Job Radar',
      subtitle: 'The tracker behind this site',
      blurb: 'Watches company career portals every morning, emails me new matching roles, and tracks every application.',
      bullets: [
        'Python scanner for Greenhouse, Lever, Ashby, Workday, SmartRecruiters and custom pages.',
        'Runs daily on GitHub Actions, stores matches in Supabase, sends an email digest.',
        'React dashboard with a kanban board for application status.',
      ],
      tech: ['Python', 'Supabase', 'GitHub Actions', 'React', 'Playwright'],
      kind: 'this-site',
      tint: '#f6c9c4',
      emoji: '📡',
      links: {},
    },
  ] satisfies Project[],

  lately: [
    {
      id: 'award',
      tag: 'award winner',
      tagIcon: 'trophy',
      title: 'Exceptional Performer Award',
      blurb: 'Recognised at SalesCodeAI for the 2025–26 cycle.',
      detail:
        'Recognised by SalesCodeAI (formerly ApplicateAI) as an Exceptional Performer for the 2025–2026 cycle.',
      date: '2025–26',
      tint: '#f7e8a4',
    },
    {
      id: 'promotion',
      tag: 'levelled up',
      tagIcon: 'rocket',
      title: 'Promoted to Senior SWE',
      blurb: 'From Software Engineer to Senior Software Engineer in 19 months.',
      detail:
        'Started at SalesCodeAI (then ApplicateAI) in Sep 2023 building order services and Flutter apps; promoted in Apr 2025 to own system design and architecture reviews.',
      date: 'Apr 2025',
      tint: '#cfe6d8',
    },
    {
      id: 'kafka',
      tag: 'shipped',
      tagIcon: 'zap',
      title: 'Kafka Migration',
      blurb: 'Moved core services to an event-driven architecture: +35% throughput.',
      detail:
        'Architected and led the migration of core services to Kafka-based event-driven microservices, improving throughput by 35% and enabling horizontal scalability across services.',
      date: '2025',
      tint: '#d9d4f6',
    },
    {
      id: 'flutter',
      tag: 'in your pocket',
      tagIcon: 'phone',
      title: '500K+ Downloads',
      blurb: 'Flutter apps for Coca-Cola & ITC, rated 4.6★ on the Play Store.',
      detail:
        'An offline-first architecture with Hive local storage and delta sync cut data-sync time by 45% in low-connectivity conditions.',
      date: '2024',
      tint: '#f6d9c4',
    },
    {
      id: 'radar',
      tag: 'building',
      tagIcon: 'radar',
      title: 'Job Radar',
      blurb: 'A daily scanner + tracker for career portals, which also runs this site.',
      detail:
        'Python + GitHub Actions + Supabase. It checks the ATS boards of companies I care about each morning and emails me only the roles that match.',
      date: 'now',
      tint: '#f6c9c4',
    },
  ] satisfies LatelyItem[],
};

export type Profile = typeof profile;
