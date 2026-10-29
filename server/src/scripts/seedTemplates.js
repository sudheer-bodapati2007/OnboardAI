// server/src/scripts/seedTemplates.js
// Run: node src/scripts/seedTemplates.js
// Creates the three default onboarding templates if they don't already exist.
// Requires MONGODB_URI and the org to already exist (at least one Organization document).

import 'dotenv/config';
import mongoose from 'mongoose';
import { OnboardingTemplate } from '../models/OnboardingTemplate.js';
import { Organization } from '../models/Organization.js';

const DEFAULT_TEMPLATES = [
  {
    name: 'Software Engineer Onboarding',
    description: 'Standard onboarding plan for software engineering roles',
    roleTarget: 'Software Engineer',
    tasks: [
      {
        title: 'Complete employee documentation',
        description: 'Submit signed offer letter, tax forms (W-4), and bank details for payroll.',
        category: 'Documentation',
        dueDayOffset: 0,
        order: 0,
      },
      {
        title: 'Set up company email and accounts',
        description: 'Activate your @company.com email and set up Google Workspace, Slack, and Jira accounts.',
        category: 'IT Setup',
        dueDayOffset: 1,
        order: 1,
      },
      {
        title: 'Configure development environment',
        description: 'Install required tools: Git, Node.js, Docker, and clone the main repositories. Follow the engineering setup guide.',
        category: 'IT Setup',
        dueDayOffset: 2,
        order: 2,
      },
      {
        title: 'Complete security and compliance training',
        description: 'Complete the mandatory security awareness and data privacy training modules.',
        category: 'Compliance',
        dueDayOffset: 3,
        order: 3,
      },
      {
        title: 'Meet with your assigned manager',
        description: 'Schedule a 1:1 with your manager to discuss role expectations, 30-60-90 day goals, and team dynamics.',
        category: 'Meetings',
        dueDayOffset: 3,
        order: 4,
      },
      {
        title: 'Review engineering guidelines and coding standards',
        description: 'Read the engineering handbook, code review guidelines, branching strategy, and deployment processes.',
        category: 'Training',
        dueDayOffset: 5,
        order: 5,
      },
      {
        title: 'Attend team standup and sprint planning',
        description: 'Join the engineering team in daily standups and the first sprint planning session.',
        category: 'Meetings',
        dueDayOffset: 7,
        order: 6,
      },
      {
        title: 'Complete first assigned task or ticket',
        description: 'Pick up a starter ticket from the backlog and complete your first contribution to the codebase.',
        category: 'Training',
        dueDayOffset: 14,
        order: 7,
      },
    ],
  },
  {
    name: 'HR Executive Onboarding',
    description: 'Standard onboarding plan for HR leadership roles',
    roleTarget: 'HR Executive',
    tasks: [
      {
        title: 'Complete employee documentation',
        description: 'Submit all required employment paperwork and personal details for HR records.',
        category: 'Documentation',
        dueDayOffset: 0,
        order: 0,
      },
      {
        title: 'Set up company systems access',
        description: 'Activate HRIS access (BambooHR/Workday), payroll system, and benefits administration platform.',
        category: 'IT Setup',
        dueDayOffset: 1,
        order: 1,
      },
      {
        title: 'Review company HR policies and employee handbook',
        description: 'Thoroughly review the employee handbook, HR policies, PTO policy, and code of conduct.',
        category: 'Training',
        dueDayOffset: 2,
        order: 2,
      },
      {
        title: 'Complete compliance and employment law training',
        description: 'Complete training on employment law basics, anti-discrimination policy, and GDPR/privacy regulations.',
        category: 'Compliance',
        dueDayOffset: 3,
        order: 3,
      },
      {
        title: 'Meet with department heads',
        description: 'Schedule introductory meetings with each department head to understand their teams and HR needs.',
        category: 'Meetings',
        dueDayOffset: 5,
        order: 4,
      },
      {
        title: 'Review current onboarding and offboarding processes',
        description: 'Audit the existing employee onboarding and offboarding workflows and identify improvement areas.',
        category: 'Training',
        dueDayOffset: 7,
        order: 5,
      },
      {
        title: 'Meet with CEO / leadership',
        description: 'Attend an introductory meeting with senior leadership to align on HR strategy and company goals.',
        category: 'Meetings',
        dueDayOffset: 10,
        order: 6,
      },
      {
        title: 'Propose 30-day HR improvement plan',
        description: 'Present a written 30-day plan outlining priorities, quick wins, and strategic HR initiatives.',
        category: 'Documentation',
        dueDayOffset: 30,
        order: 7,
      },
    ],
  },
  {
    name: 'Sales Associate Onboarding',
    description: 'Standard onboarding plan for sales team members',
    roleTarget: 'Sales Associate',
    tasks: [
      {
        title: 'Complete employee documentation',
        description: 'Submit all required employment and payroll paperwork.',
        category: 'Documentation',
        dueDayOffset: 0,
        order: 0,
      },
      {
        title: 'Set up CRM and sales tools',
        description: 'Activate Salesforce / HubSpot CRM access, set up email sequences, and configure sales engagement tools.',
        category: 'IT Setup',
        dueDayOffset: 1,
        order: 1,
      },
      {
        title: 'Product and service training',
        description: 'Complete the product training modules to develop a thorough understanding of the company\'s offerings and value propositions.',
        category: 'Training',
        dueDayOffset: 2,
        order: 2,
      },
      {
        title: 'Review sales playbook and processes',
        description: 'Study the sales playbook, qualification criteria, objection handling scripts, and deal stages.',
        category: 'Training',
        dueDayOffset: 3,
        order: 3,
      },
      {
        title: 'Shadow senior sales calls',
        description: 'Attend at least 5 live sales calls or demos with a senior sales representative to observe techniques.',
        category: 'Meetings',
        dueDayOffset: 5,
        order: 4,
      },
      {
        title: 'Complete compliance and ethics training',
        description: 'Complete training on sales ethics, anti-bribery policies, and data protection for customer information.',
        category: 'Compliance',
        dueDayOffset: 5,
        order: 5,
      },
      {
        title: 'Meet your sales manager and team',
        description: 'Have a formal 1:1 with your sales manager to review targets, territory, and success metrics.',
        category: 'Meetings',
        dueDayOffset: 3,
        order: 6,
      },
      {
        title: 'Make first outbound calls independently',
        description: 'Complete your first set of outbound prospecting calls or demos independently using the playbook.',
        category: 'Training',
        dueDayOffset: 14,
        order: 7,
      },
    ],
  },
];

async function seed() {
  console.log('Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected.');

  // Find the first organization (assumes at least one exists)
  const org = await Organization.findOne().sort({ createdAt: 1 });
  if (!org) {
    console.error('No organization found. Log in via the app first to create one, then re-run this script.');
    process.exit(1);
  }

  console.log(`Seeding templates for organization: ${org.name} (${org._id})`);

  let created = 0;
  let skipped = 0;

  for (const tmpl of DEFAULT_TEMPLATES) {
    const exists = await OnboardingTemplate.findOne({
      organizationId: org._id,
      name: tmpl.name,
    });
    if (exists) {
      console.log(`  SKIP: "${tmpl.name}" already exists`);
      skipped++;
      continue;
    }
    await OnboardingTemplate.create({ organizationId: org._id, ...tmpl });
    console.log(`  CREATED: "${tmpl.name}" (${tmpl.tasks.length} tasks)`);
    created++;
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});

