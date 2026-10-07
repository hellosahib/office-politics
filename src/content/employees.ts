import type { EmployeeDef } from '../engine/types';

// §76 roster. ids are kebab-case names.
export const EMPLOYEES: EmployeeDef[] = [
  // Engineering
  { id: 'sahib-singh',   deptId: 'engineering', name: 'Sahib Singh', pronoun: 'he',   role: 'Senior Backend Engineer', permanentTrait: 'Ambitious',    visual: 'Mechanical keyboard case and achievement stickers' },
  { id: 'riya-shah',     deptId: 'engineering', name: 'Riya Shah', pronoun: 'she',     role: 'Mobile Engineer',         permanentTrait: 'Loyal',        visual: 'Organized laptop setup and team-branded notebook' },
  { id: 'kabir-anand',   deptId: 'engineering', name: 'Kabir Anand', pronoun: 'he',   role: 'QA Engineer',             permanentTrait: 'ByTheBook',    visual: 'Checklist pad and meticulous workspace' },
  { id: 'mehul-sethi',   deptId: 'engineering', name: 'Mehul Sethi', pronoun: 'he',   role: 'DevOps Engineer',         permanentTrait: 'RiskTaking',   visual: 'Hoodie, multiple monitors, constantly experimenting' },
  // Product
  { id: 'neha-kapoor',   deptId: 'product', name: 'Neha Kapoor', pronoun: 'she',   role: 'Product Manager',  permanentTrait: 'Gossip',       visual: 'Tablet full of notes and changing chat bubbles' },
  { id: 'vikram-rao',    deptId: 'product', name: 'Vikram Rao', pronoun: 'he',    role: 'UX Researcher',    permanentTrait: 'Loyal',        visual: 'Interview notebook and headphones' },
  { id: 'tanya-jain',    deptId: 'product', name: 'Tanya Jain', pronoun: 'she',   role: 'Product Designer', permanentTrait: 'CreditHungry', visual: 'Sketchbook and presentation clicker' },
  { id: 'yash-malhotra', deptId: 'product', name: 'Yash Malhotra', pronoun: 'he', role: 'Business Analyst', permanentTrait: 'Ambitious',    visual: 'Formal notebook and KPI dashboard' },
  // Sales
  { id: 'sameer-khanna', deptId: 'sales', name: 'Sameer Khanna', pronoun: 'he', role: 'Account Executive',    permanentTrait: 'CreditHungry', visual: 'Phone headset and polished presentation deck' },
  { id: 'pooja-nair',    deptId: 'sales', name: 'Pooja Nair', pronoun: 'she',    role: 'Enterprise Sales',     permanentTrait: 'Ambitious',    visual: 'Premium notebook and confident posture' },
  { id: 'rohit-bedi',    deptId: 'sales', name: 'Rohit Bedi', pronoun: 'he',    role: 'Sales Operations',     permanentTrait: 'ByTheBook',    visual: 'Spreadsheet-heavy laptop and rule checklist' },
  { id: 'simran-arora',  deptId: 'sales', name: 'Simran Arora', pronoun: 'she',  role: 'Business Development', permanentTrait: 'Gossip',       visual: 'Phone, coffee and constant message notifications' },
  // Marketing
  { id: 'aisha-khan',    deptId: 'marketing', name: 'Aisha Khan', pronoun: 'she',  role: 'Brand Manager',      permanentTrait: 'RiskTaking', visual: 'Camera and campaign mood-board' },
  { id: 'dev-oberoi',    deptId: 'marketing', name: 'Dev Oberoi', pronoun: 'he',  role: 'Growth Marketer',    permanentTrait: 'Ambitious',  visual: 'Analytics dashboard and smartwatch' },
  { id: 'nitin-jain',    deptId: 'marketing', name: 'Nitin Jain', pronoun: 'he',  role: 'Content Strategist', permanentTrait: 'Loyal',      visual: 'Notebook and long-form writing setup' },
  { id: 'isha-verma',    deptId: 'marketing', name: 'Isha Verma', pronoun: 'she',  role: 'Social Media Lead',  permanentTrait: 'Gossip',     visual: 'Smartphone tripod and social-feed interface' },
  // Finance
  { id: 'kunal-gupta',   deptId: 'finance', name: 'Kunal Gupta', pronoun: 'he',   role: 'Finance Manager',        permanentTrait: 'ByTheBook', visual: 'Calculator, spreadsheet and formal folder' },
  { id: 'nandini-jain',  deptId: 'finance', name: 'Nandini Jain', pronoun: 'she',   role: 'FP&A Analyst',           permanentTrait: 'Loyal',     visual: 'Organized reports and coffee mug' },
  { id: 'aditya-sen',    deptId: 'finance', name: 'Aditya Sen', pronoun: 'he',    role: 'Procurement Specialist', permanentTrait: 'Cautious',  visual: 'Comparison sheets and vendor folders' },
  { id: 'lavanya-iyer',  deptId: 'finance', name: 'Lavanya Iyer', pronoun: 'she',  role: 'Financial Controller',   permanentTrait: 'Ambitious', visual: 'Formal attire and approval dashboard' },
  // Operations
  { id: 'manav-kapoor',  deptId: 'operations', name: 'Manav Kapoor', pronoun: 'he',  role: 'Operations Manager',     permanentTrait: 'Loyal',      visual: 'Operations board and company ID badge' },
  { id: 'sakshi-chawla', deptId: 'operations', name: 'Sakshi Chawla', pronoun: 'she', role: 'Project Coordinator',    permanentTrait: 'Gossip',     visual: 'Planner covered in meeting notes' },
  { id: 'raghav-singh',  deptId: 'operations', name: 'Raghav Singh', pronoun: 'he',  role: 'Facilities Coordinator', permanentTrait: 'Lazy',       visual: 'Coffee cup, relaxed posture and unfinished task list' },
  { id: 'ananya-bose',   deptId: 'operations', name: 'Ananya Bose', pronoun: 'she',   role: 'Supply Chain Lead',      permanentTrait: 'RiskTaking', visual: 'Logistics dashboard and travel bag' },
  // People & HR
  { id: 'farhan-ali',    deptId: 'people', name: 'Farhan Ali', pronoun: 'he',  role: 'HR Business Partner',     permanentTrait: 'Private',   visual: 'Closed notebook and one-on-one meeting setup' },
  { id: 'priya-sethi',   deptId: 'people', name: 'Priya Sethi', pronoun: 'she', role: 'Recruiter',               permanentTrait: 'Gossip',    visual: 'Candidate list and phone' },
  { id: 'karan-gill',    deptId: 'people', name: 'Karan Gill', pronoun: 'he',  role: 'L&D Manager',             permanentTrait: 'Loyal',     visual: 'Training material and presentation screen' },
  { id: 'mitali-das',    deptId: 'people', name: 'Mitali Das', pronoun: 'she',  role: 'Compensation & Benefits', permanentTrait: 'ByTheBook', visual: 'Policy binder and structured spreadsheet' },
];
