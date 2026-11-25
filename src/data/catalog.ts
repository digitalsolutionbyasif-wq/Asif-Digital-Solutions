import type { CourseItem, ServiceItem } from '../types';

export const AGENCY_SERVICES: ServiceItem[] = [
  {
    index: '01',
    title: 'High-Conversion Website Design',
    tier: 'Core Foundations',
    outcome: 'Sub-second responsive websites engineered for search visibility and clear buyer journeys.',
    deliverables: 'Mobile-first UI · Technical SEO · Conversion Tracking',
  },
  {
    index: '02',
    title: 'Online Store & E-Commerce Setup',
    tier: 'Core Foundations',
    outcome: 'Shopify, WooCommerce, and custom storefronts built for local Pakistani & global checkout.',
    deliverables: 'Payment Gateways · Inventory Sync · Speed Optimization',
  },
  {
    index: '03',
    title: 'Brand Identity & Logo Systems',
    tier: 'Core Foundations',
    outcome: 'Cohesive logos, typography guides, and social media visual kits that earn instant trust.',
    deliverables: 'Brand Guidelines · Print & Digital Assets · Social Kits',
  },
  {
    index: '04',
    title: 'Social Media Management',
    tier: 'Core Foundations',
    outcome: 'Consistent editorial calendars, reel production, and community engagement across channels.',
    deliverables: 'Content Calendar · Monthly Reporting · Community Ops',
  },
  {
    index: '05',
    title: 'Google Business & Local SEO',
    tier: 'Core Foundations',
    outcome: 'Capture local intent across Bahawalpur, Lahore, and nationwide Google Maps searches.',
    deliverables: 'Maps Verification · Citation Cleanup · Review Funnel',
  },
  {
    index: '06',
    title: 'Corporate & Career Training',
    tier: 'Core Foundations',
    outcome: 'Practical cohorts in design, Python, web craft, and AI workflows with portfolio reviews.',
    deliverables: 'Live Mentorship · Capstone Projects · Certificate',
  },
  {
    index: '07',
    title: 'Meta & Performance Social Ads',
    tier: 'Growth & Automation',
    outcome: 'Targeted Facebook and Instagram acquisition campaigns measured by cost per qualified inquiry.',
    deliverables: 'Pixel & CAPI Setup · Creative Testing · ROAS Reporting',
  },
  {
    index: '08',
    title: 'Search Engine & Google Ads',
    tier: 'Growth & Automation',
    outcome: 'High-intent search capture pairing technical site architecture with disciplined ad bidding.',
    deliverables: 'Keyword Architecture · Schema Markup · Search Campaigns',
  },
  {
    index: '09',
    title: 'End-to-End E-Commerce Launch',
    tier: 'Growth & Automation',
    outcome: 'From winning product validation and store build to tracking pixels and scale-up campaigns.',
    deliverables: 'Product Research · Storefront Build · Launch Funnel',
  },
  {
    index: '10',
    title: 'China Sourcing & Supplier Ops',
    tier: 'Growth & Automation',
    outcome: 'Vetted factory sourcing, sample verification, landed-cost modeling, and freight coordination.',
    deliverables: 'Supplier Vetting · QC Checklists · Freight Guidance',
  },
  {
    index: '11',
    title: 'UGC & Video Ad Production',
    tier: 'Growth & Automation',
    outcome: 'Scripted native-style video hooks engineered to stop feeds and convert skeptical buyers.',
    deliverables: 'Hook Scripting · Editing & Captions · A/B Variations',
  },
  {
    index: '12',
    title: 'Custom Web Apps & CRM Automation',
    tier: 'Growth & Automation',
    outcome: 'Bespoke portals, automated WhatsApp lead routing, and CRM pipelines built around your ops.',
    deliverables: 'Full-Stack Apps · Lead Nurturing · API Integrations',
  },
];

export const ACADEMY_COURSES: CourseItem[] = [
  {
    id: 'graphic-design',
    title: 'Graphic Design Mastery',
    track: 'Visual Communication',
    duration: '8 Weeks',
    level: 'Beginner to Portfolio',
    feePkr: 'PKR 15,000',
    format: 'In-Person (Bahawalpur / Lahore) & Live Online',
    image: '/src/assets/images/course_design_craft_1795586786705.jpg',
    summary:
      'Master commercial branding, social media ad creatives, print packaging, and typography systems using Adobe Photoshop, Illustrator, and Figma.',
    outcomes: [
      'Build 6 client-ready brand identity & ad creative case studies',
      'Design high-converting Meta ad carousels and packaging layouts',
      'Prepare print-ready vector deliverables and freelance proposals',
    ],
    syllabus: [
      'Module 01 · Design Principles, Grids & Typography Hierarchy',
      'Module 02 · Adobe Illustrator Vector Systems & Logo Craft',
      'Module 03 · Adobe Photoshop Compositing & Ad Creative Retouching',
      'Module 04 · Social Media Kits, Print Specs & Client Portfolio',
    ],
  },
  {
    id: 'web-design',
    title: 'Web Design & Frontend Craft',
    track: 'UI & Web Engineering',
    duration: '10 Weeks',
    level: 'Beginner to Job-Ready',
    feePkr: 'PKR 18,000',
    format: 'In-Person (Bahawalpur / Lahore) & Live Online',
    image: '/src/assets/images/fyp_engineering_lab_1795587487108.jpg',
    summary:
      'Learn responsive layout systems, Figma wireframing, HTML5, CSS3, Tailwind CSS, WordPress/Elementor, and conversion-focused landing page architecture.',
    outcomes: [
      'Ship 4 responsive business websites and high-conversion landing pages',
      'Master mobile-first CSS Grid, Flexbox, Tailwind, and accessibility standards',
      'Deploy fast, SEO-ready client sites with analytics and lead forms',
    ],
    syllabus: [
      'Module 01 · UX Wireframing, Design Tokens & Figma Prototyping',
      'Module 02 · Semantic HTML5, Modern CSS3 & Tailwind Systems',
      'Module 03 · Interactive JavaScript, Forms & Speed Optimization',
      'Module 04 · WordPress Storefronts, SEO Metadata & Deployment',
    ],
  },
  {
    id: 'python-masterclass',
    title: 'Python Master Class',
    track: 'Software & Automation',
    duration: '12 Weeks',
    level: 'Foundations to Backend',
    feePkr: 'PKR 22,000',
    format: 'In-Person (Bahawalpur / Lahore) & Live Online',
    image: '/src/assets/images/course_python_ai_1795586787742.jpg',
    summary:
      'Go from zero programming experience to building clean Python automation scripts, REST APIs, database workflows, and practical AI/data utilities.',
    outcomes: [
      'Write clean, modular Python 3 code with OOP and automated testing',
      'Build REST APIs with FastAPI/Django and automate Excel/CSV pipelines',
      'Complete a Git-tracked capstone backend ready for FYPs or client work',
    ],
    syllabus: [
      'Module 01 · Python Core, Data Structures & Clean Functions',
      'Module 02 · Object-Oriented Design, Files & Web Scraping',
      'Module 03 · SQL Databases, FastAPI Services & Authentication',
      'Module 04 · Workflow Automation, Testing & Production Deployment',
    ],
  },
  {
    id: 'ai-content-creation',
    title: 'AI Content Creation',
    track: 'Generative Workflows',
    duration: '6 Weeks',
    level: 'Creators & Marketers',
    feePkr: 'PKR 16,000',
    format: 'Live Online & Weekend Studio Labs',
    image: '/src/assets/images/course_python_ai_1795586787742.jpg',
    summary:
      'Design repeatable AI production workflows for ad creatives, short-form video scripts, brand voice consistency, and rapid campaign testing.',
    outcomes: [
      'Build structured prompt libraries for brand-consistent visuals and copy',
      'Produce multi-format ad scripts, reels storyboards, and landing assets',
      'Automate content repurposing pipelines with human quality control',
    ],
    syllabus: [
      'Module 01 · Structured Prompting & Brand Voice Systems',
      'Module 02 · AI Visual Direction, Product Mockups & Ad Variations',
      'Module 03 · Video Scripting, Voiceovers & Short-Form Storyboarding',
      'Module 04 · Ethical Guardrails, Fact-Checking & Agency Delivery',
    ],
  },
  {
    id: 'content-writing',
    title: 'Content Writing & SEO Copy',
    track: 'Editorial & Conversion',
    duration: '6 Weeks',
    level: 'All Skill Levels',
    feePkr: 'PKR 12,000',
    format: 'In-Person & Live Online',
    image: '/src/assets/images/course_seo_copywriting_1795587488105.jpg',
    summary:
      'Write persuasive landing pages, search-ranked articles, academic technical reports, and high-reply LinkedIn/Upwork client proposals.',
    outcomes: [
      'Craft conversion copy for hero sections, emails, and Meta ad hooks',
      'Structure long-form SEO articles backed by search intent research',
      'Build a published writing portfolio for local agencies and remote clients',
    ],
    syllabus: [
      'Module 01 · Reader Psychology, Clarity & Persuasive Structure',
      'Module 02 · Landing Page Copywriting & Email Nurturing Sequences',
      'Module 03 · Search Intent Research & Long-Form SEO Architecture',
      'Module 04 · Technical Documentation & Freelance Client Acquisition',
    ],
  },
];

export const FYP_TRACKS = [
  {
    semester: '7th Semester Track',
    title: 'FYP Planning, Proposal & SRS Architecture',
    hook: 'Start your Final Year Project with supervisor-ready documentation before deadlines hit.',
    deliverables: [
      'Topic selection aligned with current AI, Web, Mobile & IoT industry demand',
      'Complete IEEE-compliant SRS, Use Case, ERD & Architecture diagrams',
      'Feasibility study, sprint milestones, and proposal defense deck',
    ],
  },
  {
    semester: '8th Semester Track',
    title: 'Implementation Support, Debugging & Viva Prep',
    hook: 'Turn partial code into a working, documented project you can explain with confidence.',
    deliverables: [
      '1-on-1 code walkthroughs so you understand every module you present',
      'Bug resolution, database integration, API wiring, and UI polish',
      'Final thesis formatting, test cases, and mock external viva defense',
    ],
  },
  {
    semester: 'Specialized Stacks',
    title: 'Python, AI / ML, Web & Mobile FYP Mentoring',
    hook: 'Hands-on technical guidance across modern engineering stacks used in university panels.',
    deliverables: [
      'Python, Computer Vision, NLP & Machine Learning model pipelines',
      'React, Next.js, Node/Express, Django, Laravel & REST APIs',
      'Flutter / React Native mobile apps with real database backends',
    ],
  },
];

export const IMPACT_METRICS = [
  { value: '420+', label: 'Digital Projects Delivered', detail: 'Websites, stores & growth systems' },
  { value: '1,250+', label: 'Students & Founders Trained', detail: 'Bahawalpur, Lahore & online cohorts' },
  { value: '98.2%', label: 'Client Satisfaction Rate', detail: 'Verified post-launch feedback' },
  { value: '< 15m', label: 'WhatsApp Response Time', detail: 'Direct founder & team coordination' },
];

export interface EstimatorFeatureOption {
  id: string;
  label: string;
  pricePkr: number;
  weeks: number;
}

export interface EstimatorTrackConfig {
  id: 'website' | 'ecommerce' | 'growth' | 'fyp';
  label: string;
  category: 'agency' | 'course' | 'fyp';
  serviceName: string;
  basePricePkr: number;
  baseWeeks: number;
  description: string;
  options: EstimatorFeatureOption[];
}

export const ESTIMATOR_TRACKS: EstimatorTrackConfig[] = [
  {
    id: 'website',
    label: 'Conversion Website',
    category: 'agency',
    serviceName: 'High-Conversion Website Design',
    basePricePkr: 45000,
    baseWeeks: 2,
    description: 'Custom mobile-first responsive site with SEO metadata, A/B readiness, and CRM lead capture.',
    options: [
      { id: 'seo', label: 'Technical SEO & Google Business Setup', pricePkr: 15000, weeks: 1 },
      { id: 'crm', label: 'CRM Webhook & 3-Step Auto-Nurturing', pricePkr: 18000, weeks: 1 },
      { id: 'analytics', label: 'Live Heatmaps & A/B Variant Testing', pricePkr: 14000, weeks: 1 },
      { id: 'copy', label: 'Full Landing Page Conversion Copywriting', pricePkr: 12000, weeks: 1 },
    ],
  },
  {
    id: 'ecommerce',
    label: 'E-Commerce Storefront',
    category: 'agency',
    serviceName: 'End-to-End E-Commerce Launch',
    basePricePkr: 65000,
    baseWeeks: 3,
    description: 'Shopify, WooCommerce, or custom checkout build ready for Pakistani & international payments.',
    options: [
      { id: 'pay', label: 'JazzCash / EasyPaisa / Stripe Integration', pricePkr: 16000, weeks: 1 },
      { id: 'meta', label: 'Meta Pixel, CAPI & Launch Ad Creatives', pricePkr: 24000, weeks: 1 },
      { id: 'ugc', label: '3 Scripted UGC / Product Video Ads', pricePkr: 22000, weeks: 1 },
      { id: 'sourcing', label: 'China Supplier Vetting & Landed-Cost Sheet', pricePkr: 28000, weeks: 2 },
    ],
  },
  {
    id: 'growth',
    label: 'Performance Marketing',
    category: 'agency',
    serviceName: 'Meta & Performance Social Ads',
    basePricePkr: 35000,
    baseWeeks: 2,
    description: 'Monthly creative testing, Google search capture, and WhatsApp/CRM conversion attribution.',
    options: [
      { id: 'gads', label: 'Google Search & Local Intent Campaigns', pricePkr: 20000, weeks: 1 },
      { id: 'social', label: 'Full Monthly Social Media Calendar (16 Posts)', pricePkr: 25000, weeks: 1 },
      { id: 'brand', label: 'Brand Identity Refresh & Ad Templates', pricePkr: 18000, weeks: 1 },
      { id: 'report', label: 'Live Executive Analytics & Heatmap Portal', pricePkr: 15000, weeks: 1 },
    ],
  },
  {
    id: 'fyp',
    label: '7th / 8th Sem FYP',
    category: 'fyp',
    serviceName: '8th Semester Implementation & Viva Prep',
    basePricePkr: 18000,
    baseWeeks: 3,
    description: 'Structured IEEE SRS architecture, full-stack/AI code walkthroughs, and mock viva defense.',
    options: [
      { id: 'srs', label: 'IEEE SRS, ERD, Use Case & Proposal Deck', pricePkr: 8000, weeks: 1 },
      { id: 'ai', label: 'Python AI / Computer Vision / NLP Pipeline', pricePkr: 14000, weeks: 2 },
      { id: 'mobile', label: 'Flutter / React Native Companion App', pricePkr: 15000, weeks: 2 },
      { id: 'viva', label: '3 Mock Viva Sessions & Thesis Formatting', pricePkr: 7000, weeks: 1 },
    ],
  },
];

export const CONSULTATION_SLOTS = [
  '11:00 AM PKT',
  '02:00 PM PKT',
  '04:30 PM PKT',
  '07:00 PM PKT',
];

