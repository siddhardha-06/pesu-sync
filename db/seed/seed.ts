/**
 * Demo data for PESU-Sync. Everything goes through the same SQL the app uses
 * (transactions, CALL sp_accept_join_request / sp_lock_team, triggers), so the
 * audit trail and team statuses are produced by the database itself.
 *
 *   npm run db:seed        (run `npm run vector:sync` afterwards)
 *
 * All demo accounts share the password  Pesu@2026  (test credentials only).
 */
import '../../scripts/load-env';
import { hash as bcryptHash } from 'bcryptjs';
import type { PoolClient } from 'pg';
import { closePool, query, queryOne, withTransaction } from '../../src/lib/db';

export const DEMO_PASSWORD = 'Pesu@2026';

const SKILLS: Record<string, string[]> = {
  LANGUAGE: ['Python', 'Java', 'C++', 'JavaScript', 'TypeScript', 'Go', 'Kotlin'],
  FRAMEWORK: ['React', 'Next.js', 'Node.js', 'Express', 'Django', 'FastAPI', 'Spring Boot', 'Flutter', 'React Native'],
  DATABASE: ['SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Neo4j'],
  AI_ML: ['Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'PyTorch', 'TensorFlow', 'LLMs', 'Data Analysis'],
  DESIGN: ['UI/UX Design', 'Figma'],
  DEVOPS: ['Docker', 'Kubernetes', 'AWS', 'Linux', 'CI/CD', 'Git'],
  DOMAIN: ['IoT', 'Embedded Systems', 'Cybersecurity', 'Blockchain', 'Healthcare', 'FinTech'],
  SOFT_SKILL: ['Project Management', 'Public Speaking', 'Technical Writing'],
};

type Staff = { key: string; name: string; email: string; role: 'ADMIN' | 'FACULTY'; dept: string };
const STAFF: Staff[] = [
  { key: 'admin', name: 'Campus Admin', email: 'admin@pes.edu', role: 'ADMIN', dept: 'Administration' },
  { key: 'kavya', name: 'Dr. Kavya Rao', email: 'kavya.rao@pes.edu', role: 'FACULTY', dept: 'CSE' },
  { key: 'arjunM', name: 'Prof. Arjun Mehta', email: 'arjun.mehta@pes.edu', role: 'FACULTY', dept: 'CSE (AI & ML)' },
  { key: 'sneha', name: 'Dr. Sneha Iyer', email: 'sneha.iyer@pes.edu', role: 'FACULTY', dept: 'ECE' },
  { key: 'rahulN', name: 'Prof. Rahul Nair', email: 'rahul.nair@pes.edu', role: 'FACULTY', dept: 'CSE' },
];

type Student = {
  key: string;
  name: string;
  srn: string;
  sem: number;
  dept: string;
  bio: string;
  skills: Array<[string, number]>;
  projects?: Array<{ title: string; description: string; year: number }>;
};

const STUDENTS: Student[] = [
  { key: 'aarav', name: 'Aarav Sharma', srn: 'PES1UG23CS101', sem: 7, dept: 'CSE',
    bio: 'Backend developer who loves designing relational schemas and REST APIs. Usually the one who sets up the database, migrations and deployment for the team.',
    skills: [['PostgreSQL', 5], ['SQL', 5], ['Node.js', 4], ['Express', 4], ['TypeScript', 4], ['Docker', 3]],
    projects: [{ title: 'Library Management API', description: 'REST API with PostgreSQL, JWT auth and role-based access for the department library', year: 2025 }] },
  { key: 'diya', name: 'Diya Menon', srn: 'PES1UG23CS102', sem: 7, dept: 'CSE',
    bio: 'Frontend engineer focused on accessible, fast React interfaces. I enjoy turning Figma designs into polished, responsive UIs.',
    skills: [['React', 5], ['JavaScript', 5], ['Next.js', 4], ['TypeScript', 4], ['Figma', 3], ['UI/UX Design', 3]],
    projects: [{ title: 'Club Portal', description: 'Next.js site for 30+ campus clubs with event calendars', year: 2025 }] },
  { key: 'rohan', name: 'Rohan Kulkarni', srn: 'PES1UG23CS103', sem: 7, dept: 'CSE',
    bio: 'Machine learning enthusiast working on medical image classification. Comfortable with PyTorch, data pipelines and model evaluation.',
    skills: [['Python', 5], ['Machine Learning', 4], ['Deep Learning', 4], ['PyTorch', 4], ['Computer Vision', 4], ['Healthcare', 3]],
    projects: [{ title: 'Pneumonia detection', description: 'CNN classifier on chest X-ray images with Grad-CAM explanations', year: 2025 }] },
  { key: 'ananya', name: 'Ananya Reddy', srn: 'PES1UG23CS104', sem: 7, dept: 'CSE',
    bio: 'NLP and LLM tinkerer. Built a retrieval-augmented chatbot that answers course FAQs from lecture notes.',
    skills: [['NLP', 5], ['Python', 5], ['LLMs', 4], ['Machine Learning', 4], ['FastAPI', 3]],
    projects: [{ title: 'CourseBot', description: 'RAG chatbot over lecture PDFs using embeddings and a vector store', year: 2026 }] },
  { key: 'karthik', name: 'Karthik Iyer', srn: 'PES1UG23CS105', sem: 7, dept: 'CSE',
    bio: 'Embedded systems and IoT hobbyist. I build sensor networks with ESP32 boards and MQTT, and like soldering as much as coding.',
    skills: [['IoT', 5], ['Embedded Systems', 4], ['C++', 4], ['Python', 3], ['Linux', 3]] },
  { key: 'snehaP', name: 'Sneha Patil', srn: 'PES1UG23CS106', sem: 7, dept: 'CSE',
    bio: 'Cloud and DevOps person: I automate deployments with Docker, Kubernetes and GitHub Actions on AWS.',
    skills: [['Docker', 5], ['Kubernetes', 4], ['AWS', 4], ['CI/CD', 4], ['Linux', 4], ['Go', 3]] },
  { key: 'vikram', name: 'Vikram Joshi', srn: 'PES1UG23CS107', sem: 7, dept: 'CSE',
    bio: 'Competitive programmer who enjoys systems programming, algorithms and performance tuning.',
    skills: [['C++', 5], ['Java', 4], ['Git', 4], ['Linux', 3], ['Computer Vision', 2]] },
  { key: 'meera', name: 'Meera Nair', srn: 'PES1UG23CS108', sem: 7, dept: 'CSE',
    bio: 'Product designer: user research, wireframes and usability testing for student-facing apps.',
    skills: [['UI/UX Design', 5], ['Figma', 5], ['Public Speaking', 4], ['Technical Writing', 3]] },
  { key: 'arjunR', name: 'Arjun Rao', srn: 'PES1UG23CS109', sem: 7, dept: 'CSE',
    bio: 'Mobile developer (Flutter and Kotlin). Shipped a campus bus tracker app used by 500+ students.',
    skills: [['Flutter', 5], ['Kotlin', 4], ['React Native', 3], ['MongoDB', 3]] },
  { key: 'ishita', name: 'Ishita Gupta', srn: 'PES1UG23CS110', sem: 7, dept: 'CSE',
    bio: 'Security nerd — CTFs, web application pentesting and designing secure authentication flows.',
    skills: [['Cybersecurity', 5], ['Python', 4], ['Linux', 4], ['JavaScript', 3]] },
  { key: 'nikhil', name: 'Nikhil Bhat', srn: 'PES1UG23CS111', sem: 7, dept: 'CSE',
    bio: 'Data analyst who likes dashboards and storytelling with data; I write SQL and pandas every day.',
    skills: [['Data Analysis', 5], ['SQL', 4], ['Python', 4], ['MySQL', 3]] },
  { key: 'pooja', name: 'Pooja Hegde', srn: 'PES1UG23CS112', sem: 7, dept: 'CSE',
    bio: 'Full-stack MERN developer; built an event ticketing platform for the college fest.',
    skills: [['JavaScript', 5], ['MongoDB', 4], ['Express', 4], ['React', 4], ['Node.js', 4]] },
  { key: 'rahulV', name: 'Rahul Verma', srn: 'PES1UG24AM120', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Computer vision for agriculture: detecting crop disease from drone imagery.',
    skills: [['Computer Vision', 4], ['TensorFlow', 4], ['Python', 4], ['IoT', 2]] },
  { key: 'sanya', name: 'Sanya Kapoor', srn: 'PES1UG24AM121', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Graph databases and recommendation systems; exploring Neo4j for course recommendations.',
    skills: [['Neo4j', 4], ['Python', 4], ['Machine Learning', 3], ['SQL', 3]] },
  { key: 'aditya', name: 'Aditya Shetty', srn: 'PES1UG24AM122', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Blockchain developer building transparent fund disbursement with smart contracts.',
    skills: [['Blockchain', 4], ['JavaScript', 4], ['TypeScript', 3], ['FinTech', 3]] },
  { key: 'kavyaS', name: 'Kavya Srinivas', srn: 'PES1UG24AM123', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Java backend developer (Spring Boot + MySQL), interested in fintech and payment systems.',
    skills: [['Java', 5], ['Spring Boot', 4], ['MySQL', 4], ['FinTech', 3]] },
  { key: 'harsh', name: 'Harsh Agarwal', srn: 'PES1UG24AM124', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'The project manager type: I keep teams on schedule, write the reports and pitch to judges.',
    skills: [['Project Management', 5], ['Public Speaking', 5], ['Technical Writing', 4], ['Data Analysis', 2]] },
  { key: 'tanvi', name: 'Tanvi Desai', srn: 'PES1UG24AM125', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Deep learning for speech and audio; built a Kannada speech-to-text prototype.',
    skills: [['Python', 5], ['Deep Learning', 4], ['NLP', 4], ['PyTorch', 4]] },
  { key: 'siddharth', name: 'Siddharth Menon', srn: 'PES1UG24AM126', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Redis, caching and distributed systems. I like making slow APIs fast.',
    skills: [['Redis', 4], ['Go', 4], ['PostgreSQL', 3], ['Docker', 3]] },
  { key: 'neha', name: 'Neha Kulkarni', srn: 'PES1UG24AM127', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Healthcare informatics: hospital records, FHIR standards and patient-facing web apps.',
    skills: [['Healthcare', 4], ['Django', 4], ['Python', 3], ['PostgreSQL', 3]] },
  { key: 'manoj', name: 'Manoj Kumar', srn: 'PES1UG24AM128', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Web developer learning Next.js; I enjoy hackathons and building quick MVPs.',
    skills: [['JavaScript', 4], ['Next.js', 3], ['React', 3], ['Git', 3]] },
  { key: 'ritu', name: 'Ritu Singh', srn: 'PES1UG24AM129', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Robotics and embedded C for autonomous rovers; ROS beginner.',
    skills: [['Embedded Systems', 4], ['C++', 4], ['IoT', 3], ['Python', 3]] },
  { key: 'yash', name: 'Yash Patel', srn: 'PES1UG24AM130', sem: 5, dept: 'CSE (AI & ML)',
    bio: "Django + PostgreSQL developer; built the department's lab booking system.",
    skills: [['Django', 5], ['Python', 5], ['PostgreSQL', 4], ['SQL', 4]] },
  { key: 'aisha', name: 'Aisha Khan', srn: 'PES1UG24AM131', sem: 5, dept: 'CSE (AI & ML)',
    bio: 'Technical writer and UX researcher: documentation, user interviews and accessibility audits.',
    skills: [['Technical Writing', 5], ['UI/UX Design', 4], ['Figma', 3]] },
  { key: 'gaurav', name: 'Gaurav Hegde', srn: 'PES2UG23EC140', sem: 7, dept: 'ECE',
    bio: 'VLSI and FPGA design; signal processing for IoT sensor nodes.',
    skills: [['Embedded Systems', 5], ['IoT', 4], ['C++', 3]] },
];

type EventDef = {
  key: string; title: string; type: string; organizer: string; description: string;
  start: number; end: number; reg: number; min: number; max: number;
};
// start/end/reg are day offsets from today, so the demo always has open and completed events
const EVENTS: EventDef[] = [
  { key: 'hack', title: 'PESU Hackathon 2026', type: 'HACKATHON', organizer: 'kavya', start: 20, end: 21, reg: 14, min: 2, max: 4,
    description: '24-hour campus hackathon on sustainability and campus life. Teams of 2-4.' },
  { key: 'dbms', title: 'UE24CS351A DBMS Mini Project', type: 'COURSEWORK', organizer: 'rahulN', start: -30, end: 40, reg: 7, min: 2, max: 2,
    description: 'Two-member teams for the DBMS Level-3 experiential learning project.' },
  { key: 'capstone', title: 'Capstone 2026-27 (Batch 2023)', type: 'CAPSTONE', organizer: 'arjunM', start: 5, end: 200, reg: 25, min: 3, max: 4,
    description: 'Final-year capstone team formation. Teams of 3-4 must pitch an idea for faculty approval.' },
  { key: 'genai', title: 'GenAI Build Weekend', type: 'HACKATHON', organizer: 'sneha', start: -40, end: -38, reg: -45, min: 1, max: 4,
    description: 'Weekend build sprint on generative AI applications (completed).' },
  { key: 'iot', title: 'Smart Campus IoT Challenge', type: 'COMPETITION', organizer: 'sneha', start: 35, end: 60, reg: 28, min: 2, max: 5,
    description: 'Design sensor-driven solutions for campus energy, water and safety.' },
  { key: 'secure', title: 'Secure Coding Workshop', type: 'WORKSHOP', organizer: 'rahulN', start: 10, end: 10, reg: 8, min: 1, max: 3,
    description: 'Hands-on OWASP Top-10 workshop. Optional pairs.' },
];

type TeamDef = {
  key: string; event: string; leader: string; name: string; category: string; max: number;
  description: string; skills: string[]; members?: string[]; direct?: string[];
};
const TEAMS: TeamDef[] = [
  { key: 'ecotrack', event: 'hack', leader: 'pooja', name: 'EcoTrack', category: 'WEB', max: 4,
    description: 'Carbon-footprint tracker for hostels: students log commutes and meals and we visualise the impact. Need a designer and someone good with charts.',
    skills: ['React', 'Node.js', 'UI/UX Design', 'Data Analysis'], members: ['manoj'] },
  { key: 'campuseats', event: 'hack', leader: 'ananya', name: 'CampusEats AI', category: 'AI_ML', max: 4,
    description: 'Predict canteen demand from order history to cut food waste, with a web dashboard for canteen staff. Looking for a backend dev comfortable with databases and a frontend dev.',
    skills: ['Machine Learning', 'Python', 'PostgreSQL', 'Next.js'] },
  { key: 'safewalk', event: 'hack', leader: 'arjunR', name: 'SafeWalk', category: 'MOBILE', max: 3,
    description: 'Night-time safe-walk companion app with live location sharing and an SOS button wired to campus security.',
    skills: ['Flutter', 'Cybersecurity', 'MongoDB'], members: ['ishita'] },
  { key: 'greengrid', event: 'hack', leader: 'karthik', name: 'GreenGrid', category: 'IOT', max: 4,
    description: 'Smart energy meters for classrooms built on ESP32, with a real-time dashboard and anomaly alerts for wasted power.',
    skills: ['IoT', 'Embedded Systems', 'Data Analysis', 'React'], members: ['ritu', 'nikhil', 'gaurav'] },
  { key: 'querycrafters', event: 'dbms', leader: 'yash', name: 'QueryCrafters', category: 'DATA', max: 2,
    description: 'DBMS project: hostel mess management with PostgreSQL triggers and a Next.js front end.',
    skills: ['PostgreSQL', 'Next.js'], members: ['siddharth'] },
  { key: 'schemasquad', event: 'dbms', leader: 'kavyaS', name: 'SchemaSquad', category: 'WEB', max: 2,
    description: 'Looking for a frontend partner for a DBMS project on library management using Next.js and MySQL.',
    skills: ['React', 'Next.js'] },
  { key: 'mediscan', event: 'capstone', leader: 'rohan', name: 'MediScan', category: 'AI_ML', max: 4,
    description: 'Capstone: AI-assisted triage of chest X-rays for rural clinics, with a portal where doctors review and correct predictions.',
    skills: ['Deep Learning', 'Computer Vision', 'Django', 'Healthcare'], members: ['neha', 'tanvi'] },
  { key: 'agrisense', event: 'capstone', leader: 'rahulV', name: 'AgriSense', category: 'IOT', max: 4,
    description: 'Capstone: drone imagery plus soil sensors for crop health monitoring, with a farmer-facing mobile app in Kannada.',
    skills: ['IoT', 'Computer Vision', 'Flutter', 'AWS'], members: ['karthik', 'arjunR'] },
  { key: 'ledgeraid', event: 'capstone', leader: 'aditya', name: 'LedgerAid', category: 'SECURITY', max: 3,
    description: 'Capstone: transparent scholarship disbursement on a permissioned blockchain with tamper-evident audit dashboards.',
    skills: ['Blockchain', 'Spring Boot', 'Cybersecurity'], members: ['kavyaS'] },
  { key: 'coursegraph', event: 'capstone', leader: 'sanya', name: 'CourseGraph', category: 'DATA', max: 4,
    description: 'Capstone: elective recommendation using a knowledge graph of prerequisites and past student outcomes.',
    skills: ['Neo4j', 'Machine Learning', 'React', 'Python'], members: ['harsh'] },
  { key: 'promptcrafters', event: 'genai', leader: 'ananya', name: 'PromptCrafters', category: 'AI_ML', max: 3,
    description: 'Built an LLM study assistant that turns lecture slides into quizzes during the GenAI weekend.',
    skills: ['LLMs', 'NLP', 'React'], direct: ['tanvi', 'diya'] },
  { key: 'visionvoyagers', event: 'genai', leader: 'rohan', name: 'VisionVoyagers', category: 'AI_ML', max: 3,
    description: 'Generated accessible alt-text for campus notices using vision-language models.',
    skills: ['Computer Vision', 'Deep Learning'], direct: ['rahulV'] },
  { key: 'roverrangers', event: 'iot', leader: 'ritu', name: 'Rover Rangers', category: 'IOT', max: 5,
    description: 'Autonomous rover that maps campus pathways and reports broken lights and potholes to facilities.',
    skills: ['Embedded Systems', 'C++', 'Computer Vision', 'Linux'], members: ['gaurav'] },
  { key: 'quickhack', event: 'iot', leader: 'manoj', name: 'QuickHack Duplicate', category: 'OTHER', max: 3,
    description: 'Placeholder listing created twice by mistake; kept only to demonstrate admin moderation.',
    skills: ['IoT'] },
];

const PENDING: Array<[student: string, team: string, message: string]> = [
  ['aarav', 'campuseats', 'I design PostgreSQL schemas and build Node APIs — happy to own the backend and database.'],
  ['diya', 'campuseats', 'I can build the canteen dashboard in Next.js.'],
  ['meera', 'safewalk', 'I would love to run user research and design the SOS flow.'],
  ['manoj', 'schemasquad', 'Learning Next.js and need a DBMS partner!'],
  ['ishita', 'ledgeraid', 'Security reviews of the smart contracts and auth, count me in.'],
  ['vikram', 'roverrangers', 'Can write the path-planning code in C++.'],
  ['aisha', 'coursegraph', 'I can do the user interviews and write the report.'],
];

type CapstoneDef = {
  proposer: string; team?: string; title: string; domain: string; tech: string; abstract: string;
  daysAgo: number; review?: { by: string; status: 'APPROVED' | 'REJECTED'; mentor?: string; feedback: string; afterHours: number };
};
const CAPSTONES: CapstoneDef[] = [
  { proposer: 'rohan', team: 'mediscan', title: 'AI-Assisted Chest X-ray Triage for Rural Clinics', domain: 'Healthcare',
    tech: 'PyTorch, Django, PostgreSQL, Docker', daysAgo: 12,
    abstract: 'Rural primary health centres often lack radiologists. We propose a deep-learning triage system that flags chest X-rays showing signs of pneumonia or tuberculosis, prioritising them for remote review. A doctor-facing portal lets clinicians confirm or correct predictions, and those corrections are fed back for periodic retraining.',
    review: { by: 'arjunM', status: 'APPROVED', mentor: 'arjunM', feedback: 'Strong social impact. Partner with a PHC for real data.', afterHours: 30 } },
  { proposer: 'rahulV', team: 'agrisense', title: 'Drone and Soil-Sensor Crop Health Monitoring', domain: 'Agriculture',
    tech: 'TensorFlow, ESP32, Flutter, AWS IoT', daysAgo: 4,
    abstract: 'Smallholder farmers detect crop disease too late. AgriSense combines low-cost soil-moisture sensors with drone imagery analysed by a computer-vision model to detect stress and disease early, and sends alerts in Kannada through a simple mobile app.' },
  { proposer: 'aditya', team: 'ledgeraid', title: 'Blockchain-based Transparent Scholarship Disbursement', domain: 'FinTech',
    tech: 'Hyperledger Fabric, Spring Boot, React', daysAgo: 3,
    abstract: 'Scholarship funds pass through several offices and delays are hard to trace. We record every approval and transfer on a permissioned blockchain so students, sponsors and auditors can verify where the money is, while personal data stays off-chain.' },
  { proposer: 'sanya', team: 'coursegraph', title: 'Knowledge-Graph Course Recommender for Electives', domain: 'EdTech',
    tech: 'Neo4j, Python, scikit-learn, React', daysAgo: 20,
    abstract: 'Students pick electives with little information about prerequisites or outcomes. We build a knowledge graph of courses, prerequisites, skills and anonymised past grades, and recommend electives that fit a student\'s background and career goals.',
    review: { by: 'kavya', status: 'APPROVED', mentor: 'kavya', feedback: 'Approved. Make sure grade data is anonymised.', afterHours: 52 } },
  { proposer: 'tanvi', title: 'Kannada Speech-to-Text for Government Helplines', domain: 'NLP',
    tech: 'PyTorch, wav2vec2, FastAPI', daysAgo: 6,
    abstract: 'Citizen helplines in Karnataka receive many calls in Kannada and its dialects. We fine-tune a speech recognition model for Kannada call audio so that complaints can be transcribed, categorised and routed automatically.' },
  { proposer: 'ananya', title: 'Mental Health Support Chatbot for Students using RAG', domain: 'Healthcare',
    tech: 'LLMs, LangChain, Qdrant, Next.js', daysAgo: 15,
    abstract: 'Students hesitate to approach counsellors. We propose a retrieval-augmented chatbot grounded in vetted wellbeing resources that offers first-level support and escalates risky conversations to the campus counselling cell.',
    review: { by: 'sneha', status: 'REJECTED', feedback: 'Needs a clinical partner and a safety review; overlaps with existing counselling services. Please revise the scope.', afterHours: 70 } },
  { proposer: 'vikram', title: 'Smart Parking Space Detection with Computer Vision', domain: 'Smart Campus',
    tech: 'OpenCV, YOLO, Raspberry Pi, React', daysAgo: 2,
    abstract: 'Finding parking near the main block wastes time every morning. Cameras on lamp posts run a lightweight object-detection model on a Raspberry Pi to count free spaces and publish live availability to a campus map.' },
  { proposer: 'neha', title: 'Pneumonia Detection from Chest X-ray Images using CNNs', domain: 'Healthcare',
    tech: 'TensorFlow, Keras, Flask', daysAgo: 1,
    abstract: 'Pneumonia is a leading cause of death that is diagnosed from chest radiographs. We train a convolutional neural network on public chest X-ray datasets to classify images as normal or pneumonia and present the prediction with a heat-map to assist doctors.' },
];

const MESSAGES: Array<[team: string, sender: string, body: string]> = [
  ['mediscan', 'rohan', 'Welcome Neha and Tanvi! Shall we meet Thursday 4 pm in the CSE lab to split the work?'],
  ['mediscan', 'neha', 'Works for me. I will bring notes on the FHIR format for the doctor portal.'],
  ['mediscan', 'tanvi', 'I can set up the training pipeline and data loaders this week.'],
  ['greengrid', 'karthik', 'ESP32 boards arrived. Ritu and Gaurav, can you test the current sensors?'],
  ['greengrid', 'nikhil', 'I will mock the dashboard with last month\'s electricity bills meanwhile.'],
];

// ---------------------------------------------------------------------
async function tx<T>(actorId: number, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(fn, { actorId });
}

async function main() {
  console.log('Resetting data ...');
  await query(`TRUNCATE audit_logs, team_messages, capstone_projects, join_requests, team_members,
               team_required_skills, teams, events, past_projects, user_skills, skills, users,
               campus_events, campus_event_syncs
               RESTART IDENTITY CASCADE`);

  // skills
  const skillId: Record<string, number> = {};
  for (const [category, names] of Object.entries(SKILLS)) {
    for (const name of names) {
      const row = await queryOne<{ skill_id: number }>(
        'INSERT INTO skills (name, category) VALUES ($1, $2) RETURNING skill_id',
        [name, category],
      );
      skillId[name] = row!.skill_id;
    }
  }

  // users
  const hash = await bcryptHash(DEMO_PASSWORD, 10);
  const uid: Record<string, number> = {};
  for (const s of STAFF) {
    const row = await queryOne<{ user_id: number }>(
      `INSERT INTO users (full_name, email, password_hash, role, department) VALUES ($1, $2, $3, $4, $5) RETURNING user_id`,
      [s.name, s.email, hash, s.role, s.dept],
    );
    uid[s.key] = row!.user_id;
  }
  for (const s of STUDENTS) {
    const row = await queryOne<{ user_id: number }>(
      `INSERT INTO users (full_name, email, password_hash, role, srn, department, semester, bio, last_login_at)
       VALUES ($1, $2, $3, 'STUDENT', $4, $5, $6, $7, NOW() - (random() * INTERVAL '5 days'))
       RETURNING user_id`,
      [s.name, `${s.srn.toLowerCase()}@stu.pes.edu`, hash, s.srn, s.dept, s.sem, s.bio],
    );
    uid[s.key] = row!.user_id;
    for (const [skill, level] of s.skills) {
      await query('INSERT INTO user_skills (user_id, skill_id, proficiency) VALUES ($1, $2, $3)', [uid[s.key], skillId[skill], level]);
    }
    for (const p of s.projects ?? []) {
      await query('INSERT INTO past_projects (user_id, title, description, year) VALUES ($1, $2, $3, $4)', [
        uid[s.key], p.title, p.description, p.year,
      ]);
    }
  }
  console.log(`  ${Object.keys(skillId).length} skills, ${STAFF.length + STUDENTS.length} users`);

  // events
  const eid: Record<string, number> = {};
  for (const e of EVENTS) {
    const row = await queryOne<{ event_id: number }>(
      `INSERT INTO events (title, event_type, description, organizer_id, start_date, end_date,
                           registration_deadline, min_team_size, max_team_size, created_at)
       VALUES ($1, $2, $3, $4, CURRENT_DATE + $5::INT, CURRENT_DATE + $6::INT, CURRENT_DATE + $7::INT, $8, $9,
               NOW() - INTERVAL '60 days')
       RETURNING event_id`,
      [e.title, e.type, e.description, uid[e.organizer], e.start, e.end, e.reg, e.min, e.max],
    );
    eid[e.key] = row!.event_id;
  }

  // teams: team + leader + required skills in one transaction (as the leader)
  const tid: Record<string, number> = {};
  for (const t of TEAMS) {
    tid[t.key] = await tx(uid[t.leader], async (c) => {
      const { rows } = await c.query<{ team_id: number }>(
        `INSERT INTO teams (event_id, leader_id, name, description, category, max_members)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING team_id`,
        [eid[t.event], uid[t.leader], t.name, t.description, t.category, t.max],
      );
      await c.query(`INSERT INTO team_members (team_id, user_id, member_role) VALUES ($1, $2, 'LEADER')`, [
        rows[0].team_id, uid[t.leader],
      ]);
      await c.query('INSERT INTO team_required_skills (team_id, skill_id) SELECT $1, UNNEST($2::INT[])', [
        rows[0].team_id, t.skills.map((s) => skillId[s]),
      ]);
      return rows[0].team_id;
    });

    // members of open events: request -> leader accepts through the stored procedure
    for (const m of t.members ?? []) {
      const req = await tx(uid[m], async (c) => {
        const { rows } = await c.query<{ request_id: number }>(
          `INSERT INTO join_requests (team_id, user_id, message) VALUES ($1, $2, 'Would love to join!') RETURNING request_id`,
          [tid[t.key], uid[m]],
        );
        return rows[0].request_id;
      });
      await tx(uid[t.leader], (c) => c.query('CALL sp_accept_join_request($1, $2)', [req, uid[t.leader]]));
    }
    // members of the completed event were added directly (registration already closed)
    for (const m of t.direct ?? []) {
      await tx(uid[t.leader], (c) =>
        c.query(`INSERT INTO team_members (team_id, user_id, member_role) VALUES ($1, $2, 'MEMBER')`, [tid[t.key], uid[m]]),
      );
    }
  }

  // final rosters
  for (const key of ['querycrafters', 'promptcrafters', 'visionvoyagers']) {
    const leader = TEAMS.find((t) => t.key === key)!.leader;
    await tx(uid[leader], (c) => c.query('CALL sp_lock_team($1, $2)', [tid[key], uid[leader]]));
  }

  // pending requests (match_score is filled in by `npm run vector:sync`)
  for (const [student, team, message] of PENDING) {
    await tx(uid[student], (c) =>
      c.query('INSERT INTO join_requests (team_id, user_id, message) VALUES ($1, $2, $3)', [tid[team], uid[student], message]),
    );
  }
  // one rejected request for the audit trail
  await tx(uid.siddharth, (c) =>
    c.query(`INSERT INTO join_requests (team_id, user_id, message) VALUES ($1, $2, 'Can help with caching')`, [tid.ecotrack, uid.siddharth]),
  );
  await tx(uid.pooja, (c) =>
    c.query(
      `UPDATE join_requests SET status = 'REJECTED', decided_at = NOW(), decided_by = $2
        WHERE team_id = $1 AND user_id = $3 AND status = 'PENDING'`,
      [tid.ecotrack, uid.pooja, uid.siddharth],
    ),
  );

  // admin moderation: disband the duplicate listing
  await tx(uid.admin, (c) => c.query(`UPDATE teams SET status = 'DISBANDED' WHERE team_id = $1`, [tid.quickhack]));

  // capstone pitches + faculty reviews
  for (const cp of CAPSTONES) {
    const id = await tx(uid[cp.proposer], async (c) => {
      const { rows } = await c.query<{ capstone_id: number }>(
        `INSERT INTO capstone_projects (title, abstract, domain, tech_stack, proposer_id, team_id, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - make_interval(days => $7))
         RETURNING capstone_id`,
        [cp.title, cp.abstract, cp.domain, cp.tech, uid[cp.proposer], cp.team ? tid[cp.team] : null, cp.daysAgo],
      );
      return rows[0].capstone_id;
    });
    if (cp.review) {
      const r = cp.review;
      await tx(uid[r.by], (c) =>
        c.query(
          `UPDATE capstone_projects
              SET status = $2, feedback = $3, mentor_id = $4, reviewed_by = $5,
                  reviewed_at = submitted_at + make_interval(hours => $6)
            WHERE capstone_id = $1`,
          [id, r.status, r.feedback, r.mentor ? uid[r.mentor] : null, uid[r.by], r.afterHours],
        ),
      );
    }
  }

  // team messages
  for (const [team, sender, body] of MESSAGES) {
    await query('INSERT INTO team_messages (team_id, sender_id, body) VALUES ($1, $2, $3)', [tid[team], uid[sender], body]);
  }

  await query('REFRESH MATERIALIZED VIEW mv_skill_demand');

  const summary = await queryOne(
    `SELECT (SELECT COUNT(*) FROM users)             AS users,
            (SELECT COUNT(*) FROM events)            AS events,
            (SELECT COUNT(*) FROM teams)             AS teams,
            (SELECT COUNT(*) FROM team_members)      AS memberships,
            (SELECT COUNT(*) FROM join_requests)     AS join_requests,
            (SELECT COUNT(*) FROM capstone_projects) AS capstones,
            (SELECT COUNT(*) FROM audit_logs)        AS audit_rows`,
  );
  console.log('  seeded:', summary);
  const statuses = await query('SELECT name, status FROM teams ORDER BY team_id');
  console.log('  team statuses:', statuses.map((s) => `${s.name}=${s.status}`).join(', '));
  console.log(`\nDemo password for every account: ${DEMO_PASSWORD}`);
  console.log('Next: npm run vector:sync');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closePool());
