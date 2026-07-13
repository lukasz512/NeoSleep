import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const promptsDir = resolve(__dirname, '../../../.claude/commands')

function loadPrompt(file: string): string {
  return readFileSync(resolve(promptsDir, file), 'utf-8')
}

export interface Skill {
  id: string
  command: string
  name: string
  fullName: string
  emoji: string
  description: string
  systemPrompt: string
}

export const SKILLS: Skill[] = [
  {
    id: 'po',
    command: 'po',
    name: 'Ania',
    fullName: 'Product Owner — Ania',
    emoji: '📋',
    description: 'User stories, acceptance criteria, prioritization',
    systemPrompt: loadPrompt('po.md'),
  },
  {
    id: 'developer',
    command: 'dev',
    name: 'Kamil',
    fullName: 'Senior Full-Stack Developer — Kamil',
    emoji: '💻',
    description: 'Code, architecture decisions, code review',
    systemPrompt: loadPrompt('developer.md'),
  },
  {
    id: 'pm',
    command: 'pm',
    name: 'Tomek',
    fullName: 'Project Manager — Tomek',
    emoji: '📅',
    description: 'Timeline, risks, blockers, delivery',
    systemPrompt: loadPrompt('pm.md'),
  },
  {
    id: 'architect',
    command: 'arch',
    name: 'Piotr',
    fullName: 'Software Architect — Piotr',
    emoji: '🏗️',
    description: 'Structural decisions, ADRs, system design',
    systemPrompt: loadPrompt('architect.md'),
  },
  {
    id: 'ux',
    command: 'ux',
    name: 'Kasia',
    fullName: 'UX/UI Designer — Kasia',
    emoji: '🎨',
    description: 'Interface critique, accessibility, mobile-first',
    systemPrompt: loadPrompt('ux.md'),
  },
  {
    id: 'rep',
    command: 'rep',
    name: 'Paweł',
    fullName: 'Sales Rep — Paweł',
    emoji: '🚗',
    description: 'End-user perspective, field rep feedback',
    systemPrompt: loadPrompt('rep.md'),
  },
  {
    id: 'tester',
    command: 'qa',
    name: 'Marta',
    fullName: 'QA Engineer — Marta',
    emoji: '🔍',
    description: 'Test scenarios, edge cases, quality gates',
    systemPrompt: loadPrompt('tester.md'),
  },
  {
    id: 'cto',
    command: 'cto',
    name: 'Łukasz',
    fullName: 'CEO NeoSleep — Łukasz',
    emoji: '🎯',
    description: 'Strategy, business priorities, first revenue',
    systemPrompt: loadPrompt('ceo-neosleep.md'),
  },
  {
    id: 'alfred',
    command: 'ceo',
    name: 'Alfred',
    fullName: 'Alfred — Strategic Partner Interview',
    emoji: '🎙️',
    description: 'Structured interview with business partner Alfred',
    systemPrompt: loadPrompt('alfred.md'),
  },
  {
    id: 'legal',
    command: 'legal',
    name: 'Joanna',
    fullName: 'Legal & Compliance — Joanna',
    emoji: '⚖️',
    description: 'GDPR, LFPDPPP, pharma compliance, DPA',
    systemPrompt: loadPrompt('legal.md'),
  },
  {
    id: 'hcp',
    command: 'hcp',
    name: 'Dr. Anna',
    fullName: 'HCP — Dr. Anna Kowalska',
    emoji: '🩺',
    description: 'Healthcare professional perspective',
    systemPrompt: loadPrompt('hcp.md'),
  },
  {
    id: 'partner',
    command: 'partner',
    name: 'Stefan',
    fullName: 'White-Label Partner CEO — Stefan',
    emoji: '🤝',
    description: 'Pharma client evaluation, demo questions',
    systemPrompt: loadPrompt('ceo-partner.md'),
  },
  {
    id: 'cybersec',
    command: 'cybersec',
    name: 'Bartek',
    fullName: 'Cybersecurity Mentor — Bartek',
    emoji: '🔒',
    description: 'Security concepts, attack/defense, GDPR implementation',
    systemPrompt: loadPrompt('cybersec.md'),
  },
]

export const SKILL_BY_COMMAND = new Map<string, Skill>(
  SKILLS.map((s) => [s.command, s]),
)
