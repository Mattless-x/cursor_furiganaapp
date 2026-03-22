'use strict';

// ============================================================
// STATIC GAME DATA
// ============================================================

const EMPLOYEE_POOL = [
  {
    id: 'emp_1', name: 'Alex Chen', role: 'Developer', level: 1,
    speed: 4, quality: 0.70, cost: 3000, morale: 0.80,
    bio: 'Junior dev with solid foundations in web tech.'
  },
  {
    id: 'emp_2', name: 'Blake Morrison', role: 'Developer', level: 2,
    speed: 6, quality: 0.76, cost: 4500, morale: 0.85,
    bio: 'Mid-level full-stack developer, reliable and fast.'
  },
  {
    id: 'emp_3', name: 'Casey Rivera', role: 'Developer', level: 3,
    speed: 9, quality: 0.87, cost: 7000, morale: 0.90,
    bio: 'Senior developer with strong architecture skills.'
  },
  {
    id: 'emp_4', name: 'Dana Park', role: 'Developer', level: 2,
    speed: 5, quality: 0.82, cost: 4000, morale: 0.75,
    bio: 'Backend specialist, methodical and precise.'
  },
  {
    id: 'emp_5', name: 'Eli Thompson', role: 'QA', level: 1,
    speed: 3, quality: 0.90, cost: 2500, morale: 0.80,
    bio: 'Detail-oriented QA engineer, great bug hunter.'
  },
  {
    id: 'emp_6', name: 'Faye Nakamura', role: 'QA', level: 2,
    speed: 5, quality: 0.95, cost: 3800, morale: 0.88,
    bio: 'Senior QA with automation expertise.'
  },
  {
    id: 'emp_7', name: 'Gray Wilson', role: 'Manager', level: 2,
    speed: 2, quality: 0.80, cost: 5500, morale: 0.92,
    bio: 'Experienced PM who keeps teams motivated.'
  },
  {
    id: 'emp_8', name: 'Harper Davis', role: 'Developer', level: 1,
    speed: 3, quality: 0.65, cost: 2800, morale: 0.70,
    bio: 'Entry-level developer, eager and improving fast.'
  },
  {
    id: 'emp_9', name: 'Iris Lambert', role: 'Developer', level: 3,
    speed: 8, quality: 0.88, cost: 6500, morale: 0.85,
    bio: 'Full-stack expert, 8 years of production experience.'
  },
  {
    id: 'emp_10', name: 'Jordan Lee', role: 'Manager', level: 1,
    speed: 1, quality: 0.75, cost: 4000, morale: 0.85,
    bio: 'Junior manager, organized and ambitious.'
  },
  {
    id: 'emp_11', name: 'Kim Santos', role: 'Developer', level: 2,
    speed: 7, quality: 0.78, cost: 5200, morale: 0.82,
    bio: 'Frontend specialist who delivers polished UIs.'
  },
  {
    id: 'emp_12', name: 'Lee Morgan', role: 'QA', level: 3,
    speed: 6, quality: 0.97, cost: 5000, morale: 0.88,
    bio: 'Lead QA engineer, near-zero defect rate.'
  }
];

// Starting employees given to the player at game start
const STARTING_EMPLOYEE_IDS = ['emp_1', 'emp_5'];

const PROJECT_POOL = [
  {
    id: 'proj_1',
    title: 'Corporate Blog Platform',
    type: 'Website', difficulty: 'Easy', difficultyMod: 1.2, bugMod: 0.8,
    budget: 12000, deadlineDays: 18,
    features: ['CMS Integration', 'User Authentication', 'Comment System'],
    qualityTarget: 55, riskLevel: 'Low',
    description: 'A clean, professional blog platform for a mid-size corporation.'
  },
  {
    id: 'proj_2',
    title: 'E-Commerce Store',
    type: 'Website', difficulty: 'Medium', difficultyMod: 1.0, bugMod: 1.0,
    budget: 22000, deadlineDays: 25,
    features: ['Product Catalog', 'Shopping Cart', 'Payment Gateway', 'Order Tracking'],
    qualityTarget: 65, riskLevel: 'Low',
    description: 'Full-featured online store for a growing retail client.'
  },
  {
    id: 'proj_3',
    title: 'Mobile Fitness App',
    type: 'App', difficulty: 'Medium', difficultyMod: 1.0, bugMod: 1.0,
    budget: 28000, deadlineDays: 30,
    features: ['Workout Tracker', 'Nutrition Log', 'Progress Charts', 'Social Feed'],
    qualityTarget: 70, riskLevel: 'High',
    description: 'Cross-platform fitness tracking application for health-conscious users.'
  },
  {
    id: 'proj_4',
    title: 'Internal HR Tool',
    type: 'Tool', difficulty: 'Easy', difficultyMod: 1.2, bugMod: 0.8,
    budget: 18000, deadlineDays: 22,
    features: ['Employee Profiles', 'Leave Management', 'Performance Reviews'],
    qualityTarget: 60, riskLevel: 'Low',
    description: 'HR management system for a 200-person company.'
  },
  {
    id: 'proj_5',
    title: 'Healthcare Patient Portal',
    type: 'App', difficulty: 'Hard', difficultyMod: 0.75, bugMod: 1.3,
    budget: 45000, deadlineDays: 40,
    features: ['Patient Records', 'Appointment Scheduling', 'Secure Messaging', 'Lab Results', 'Rx Management'],
    qualityTarget: 80, riskLevel: 'High',
    description: 'HIPAA-compliant patient management portal for a regional hospital.'
  },
  {
    id: 'proj_6',
    title: 'Real-Time Analytics Dashboard',
    type: 'Tool', difficulty: 'Hard', difficultyMod: 0.75, bugMod: 1.3,
    budget: 38000, deadlineDays: 35,
    features: ['Data Pipeline', 'Interactive Charts', 'Alert System', 'Export Reports'],
    qualityTarget: 75, riskLevel: 'High',
    description: 'Enterprise analytics platform with live streaming data.'
  },
  {
    id: 'proj_7',
    title: 'Social Media Scheduler',
    type: 'Tool', difficulty: 'Medium', difficultyMod: 1.0, bugMod: 1.0,
    budget: 20000, deadlineDays: 24,
    features: ['Post Scheduling', 'Multi-Platform Support', 'Analytics', 'Team Collaboration'],
    qualityTarget: 65, riskLevel: 'Low',
    description: 'Marketing tool for managing posts across multiple social platforms.'
  },
  {
    id: 'proj_8',
    title: 'Restaurant Ordering App',
    type: 'App', difficulty: 'Easy', difficultyMod: 1.2, bugMod: 0.8,
    budget: 15000, deadlineDays: 20,
    features: ['Menu Browser', 'Order System', 'Table Reservations', 'Payment'],
    qualityTarget: 60, riskLevel: 'Low',
    description: 'Mobile ordering and reservation app for a restaurant chain.'
  },
  {
    id: 'proj_9',
    title: 'Inventory Management SaaS',
    type: 'Tool', difficulty: 'Medium', difficultyMod: 1.0, bugMod: 1.0,
    budget: 25000, deadlineDays: 28,
    features: ['Stock Tracking', 'Supplier Portal', 'Barcode Scanning', 'Reports'],
    qualityTarget: 70, riskLevel: 'Low',
    description: 'Cloud-based inventory management for small to mid-size warehouses.'
  },
  {
    id: 'proj_10',
    title: 'EdTech Learning Platform',
    type: 'App', difficulty: 'Hard', difficultyMod: 0.75, bugMod: 1.2,
    budget: 42000, deadlineDays: 38,
    features: ['Course Builder', 'Video Streaming', 'Quizzes', 'Certificates', 'Forums'],
    qualityTarget: 78, riskLevel: 'High',
    description: 'Full-featured e-learning platform for an educational startup.'
  }
];

const EVENT_POOL = [
  {
    id: 'evt_1',
    name: 'Critical Bug Discovered',
    description: 'QA found a show-stopping bug in the core module. How do you respond?',
    icon: '🐛',
    options: [
      {
        text: 'Fix it immediately',
        subtext: '-5% progress, removes 4 bugs',
        effect: { progress: -5, bugs: -4, morale: 0.02 }
      },
      {
        text: 'Log it and continue',
        subtext: 'Adds 3 bugs, -8 quality at end',
        effect: { bugs: 3, qualityPenalty: 8 }
      }
    ]
  },
  {
    id: 'evt_2',
    name: 'Client Requests Feature Change',
    description: 'The client wants to swap one feature for another. This will impact the schedule.',
    icon: '📋',
    options: [
      {
        text: 'Negotiate a higher budget',
        subtext: '+$5,000 budget reward',
        effect: { budgetBonus: 5000, morale: 0.02 }
      },
      {
        text: 'Accept and extend deadline',
        subtext: '+3 days to deadline',
        effect: { deadlineBonus: 3, morale: -0.03 }
      }
    ]
  },
  {
    id: 'evt_3',
    name: 'Developer Burnout',
    description: 'Your team is showing signs of fatigue. Productivity and morale are suffering.',
    icon: '😓',
    options: [
      {
        text: 'Give the team a half-day off',
        subtext: '+0.15 morale, -3% progress today',
        effect: { morale: 0.15, progress: -3 }
      },
      {
        text: 'Push through the deadline',
        subtext: '-0.12 morale',
        effect: { morale: -0.12 }
      }
    ]
  },
  {
    id: 'evt_4',
    name: 'Tech Stack Breakthrough',
    description: 'A developer found a library that dramatically speeds up this feature!',
    icon: '⚡',
    options: [
      {
        text: 'Integrate it now',
        subtext: '+8% progress, +0.05 morale',
        effect: { progress: 8, morale: 0.05 }
      },
      {
        text: 'Stick with the current approach',
        subtext: 'No risk, no change',
        effect: { morale: -0.02 }
      }
    ]
  },
  {
    id: 'evt_5',
    name: 'Security Vulnerability Found',
    description: 'An audit reveals a vulnerability in the authentication system.',
    icon: '🔐',
    options: [
      {
        text: 'Patch it immediately',
        subtext: '-4% progress, removes 5 bugs, +5 quality',
        effect: { progress: -4, bugs: -5, qualityBonus: 5 }
      },
      {
        text: 'Document and defer to post-launch',
        subtext: '+5 bugs, -10 quality',
        effect: { bugs: 5, qualityPenalty: 10 }
      }
    ]
  },
  {
    id: 'evt_6',
    name: 'Client Praises the Demo',
    description: 'The client saw the latest build and they love it! Great news for the team.',
    icon: '🎉',
    options: [
      {
        text: 'Celebrate and share the news',
        subtext: '+0.15 morale, +2 reputation',
        effect: { morale: 0.15, reputationBonus: 2 }
      },
      {
        text: 'Keep heads down and keep shipping',
        subtext: 'No change',
        effect: {}
      }
    ]
  },
  {
    id: 'evt_7',
    name: 'Dev Server Outage',
    description: 'The development server went down. Work is halted.',
    icon: '💥',
    options: [
      {
        text: 'Upgrade the server ($3,000)',
        subtext: '-$3,000, loses 2% progress today',
        effect: { cashCost: 3000, progress: -2 }
      },
      {
        text: 'Wait for the free fix',
        subtext: 'Loses a full day of progress',
        effect: { progress: -6 }
      }
    ]
  },
  {
    id: 'evt_8',
    name: 'Star Developer Got a Job Offer',
    description: 'Your top developer received an offer from a competitor. They might leave!',
    icon: '💼',
    options: [
      {
        text: 'Counter-offer a bonus ($2,500)',
        subtext: '-$2,500, +0.10 morale',
        effect: { cashCost: 2500, morale: 0.10 }
      },
      {
        text: 'Wish them well',
        subtext: 'Developer leaves, -0.15 team morale',
        effect: { removeTopDev: true, morale: -0.15 }
      }
    ]
  }
];
