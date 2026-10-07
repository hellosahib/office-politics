import type { EmployeeDef } from '../engine/types';

// §76 roster. ids are kebab-case names.
export const EMPLOYEES: EmployeeDef[] = [
  // Engineering
  { id: 'sahib-singh',   deptId: 'engineering', name: 'Sahib Singh',   role: 'Senior Backend Engineer', permanentTrait: 'Ambitious',    visual: 'Mechanical keyboard case and achievement stickers' },
  { id: 'riya-shah',     deptId: 'engineering', name: 'Riya Shah',     role: 'Mobile Engineer',         permanentTrait: 'Loyal',        visual: 'Organized laptop setup and team-branded notebook' },
  { id: 'kabir-anand',   deptId: 'engineering', name: 'Kabir Anand',   role: 'QA Engineer',             permanentTrait: 'ByTheBook',    visual: 'Checklist pad and meticulous workspace' },
  { id: 'mehul-sethi',   deptId: 'engineering', name: 'Mehul Sethi',   role: 'DevOps Engineer',         permanentTrait: 'RiskTaking',   visual: 'Hoodie, multiple monitors, constantly experimenting' },
  // Product
  { id: 'neha-kapoor',   deptId: 'product', name: 'Neha Kapoor',   role: 'Product Manager',  permanentTrait: 'Gossip',       visual: 'Tablet full of notes and changing chat bubbles' },
  { id: 'vikram-rao',    deptId: 'product', name: 'Vikram Rao',    role: 'UX Researcher',    permanentTrait: 'Loyal',        visual: 'Interview notebook and headphones' },
  { id: 'tanya-jain',    deptId: 'product', name: 'Tanya Jain',   role: 'Product Designer', permanentTrait: 'CreditHungry', visual: 'Sketchbook and presentation clicker' },
  { id: 'yash-malhotra', deptId: 'product', name: 'Yash Malhotra', role: 'Business Analyst', permanentTrait: 'Ambitious',    visual: 'Formal notebook and KPI dashboard' },
  // Sales
  { id: 'sameer-khanna', deptId: 'sales', name: 'Sameer Khanna', role: 'Account Executive',    permanentTrait: 'CreditHungry', visual: 'Phone headset and polished presentation deck' },
  { id: 'pooja-nair',    deptId: 'sales', name: 'Pooja Nair',    role: 'Enterprise Sales',     permanentTrait: 'Ambitious',    visual: 'Premium notebook and confident posture' },
  { id: 'rohit-bedi',    deptId: 'sales', name: 'Rohit Bedi',    role: 'Sales Operations',     permanentTrait: 'ByTheBook',    visual: 'Spreadsheet-heavy laptop and rule checklist' },
  { id: 'simran-arora',  deptId: 'sales', name: 'Simran Arora',  role: 'Business Development', permanentTrait: 'Gossip',       visual: 'Phone, coffee and constant message notifications' },
  // Marketing
  { id: 'aisha-khan',    deptId: 'marketing', name: 'Aisha Khan',  role: 'Brand Manager',      permanentTrait: 'RiskTaking', visual: 'Camera and campaign mood-board' },
  { id: 'dev-oberoi',    deptId: 'marketing', name: 'Dev Oberoi',  role: 'Growth Marketer',    permanentTrait: 'Ambitious',  visual: 'Analytics dashboard and smartwatch' },
  { id: 'nitin-jain',    deptId: 'marketing', name: 'Nitin Jain',  role: 'Content Strategist', permanentTrait: 'Loyal',      visual: 'Notebook and long-form writing setup' },
  { id: 'isha-verma',    deptId: 'marketing', name: 'Isha Verma',  role: 'Social Media Lead',  permanentTrait: 'Gossip',     visual: 'Smartphone tripod and social-feed interface' },
  // Finance
  { id: 'kunal-gupta',   deptId: 'finance', name: 'Kunal Gupta',   role: 'Finance Manager',        permanentTrait: 'ByTheBook', visual: 'Calculator, spreadsheet and formal folder' },
  { id: 'nandini-jain',  deptId: 'finance', name: 'Nandini Jain',   role: 'FP&A Analyst',           permanentTrait: 'Loyal',     visual: 'Organized reports and coffee mug' },
  { id: 'aditya-sen',    deptId: 'finance', name: 'Aditya Sen',    role: 'Procurement Specialist', permanentTrait: 'Cautious',  visual: 'Comparison sheets and vendor folders' },
  { id: 'lavanya-iyer',  deptId: 'finance', name: 'Lavanya Iyer',  role: 'Financial Controller',   permanentTrait: 'Ambitious', visual: 'Formal attire and approval dashboard' },
  // Operations
  { id: 'manav-kapoor',  deptId: 'operations', name: 'Manav Kapoor',  role: 'Operations Manager',     permanentTrait: 'Loyal',      visual: 'Operations board and company ID badge' },
  { id: 'sakshi-chawla', deptId: 'operations', name: 'Sakshi Chawla', role: 'Project Coordinator',    permanentTrait: 'Gossip',     visual: 'Planner covered in meeting notes' },
  { id: 'raghav-singh',  deptId: 'operations', name: 'Raghav Singh',  role: 'Facilities Coordinator', permanentTrait: 'Lazy',       visual: 'Coffee cup, relaxed posture and unfinished task list' },
  { id: 'ananya-bose',   deptId: 'operations', name: 'Ananya Bose',   role: 'Supply Chain Lead',      permanentTrait: 'RiskTaking', visual: 'Logistics dashboard and travel bag' },
  // People & HR
  { id: 'farhan-ali',    deptId: 'people', name: 'Farhan Ali',  role: 'HR Business Partner',     permanentTrait: 'Private',   visual: 'Closed notebook and one-on-one meeting setup' },
  { id: 'priya-sethi',   deptId: 'people', name: 'Priya Sethi', role: 'Recruiter',               permanentTrait: 'Gossip',    visual: 'Candidate list and phone' },
  { id: 'karan-gill',    deptId: 'people', name: 'Karan Gill',  role: 'L&D Manager',             permanentTrait: 'Loyal',     visual: 'Training material and presentation screen' },
  { id: 'mitali-das',    deptId: 'people', name: 'Mitali Das',  role: 'Compensation & Benefits', permanentTrait: 'ByTheBook', visual: 'Policy binder and structured spreadsheet' },
];
