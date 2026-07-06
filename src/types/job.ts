// ============================================================
// Job & Company Types
// src/types/job.ts
// ============================================================

import type { MatchReport } from './resume';

export interface Company {
  name: string;
  website?: string;
  industry?: string;
  size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  location?: string;
  description?: string;
  mission?: string;
  values?: string[];
  techStack?: string[];
  glassdoorRating?: number;
  linkedinUrl?: string;
}

export type JobType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'volunteer';
export type RemoteType = 'remote' | 'hybrid' | 'onsite';
export type SeniorityLevel = 'intern' | 'entry' | 'mid' | 'senior' | 'lead' | 'staff' | 'principal' | 'director' | 'vp' | 'executive';

export interface SalaryRange {
  min: number;
  max: number;
  currency: string;
  period: 'hourly' | 'daily' | 'monthly' | 'annual';
}

export interface ParsedJobDescription {
  title: string;
  company: Company;
  location: string;
  type: JobType;
  remote: RemoteType;
  seniority?: SeniorityLevel;
  salaryRange?: SalaryRange;

  rawDescription: string;

  requirements: {
    required: string[];
    preferred: string[];
  };

  responsibilities: string[];
  skills: string[];
  benefits?: string[];

  experienceLevel?: string;
  educationRequirement?: string;

  applicationInstructions?: string;
  postedDate?: string;
  deadline?: string;
}

export interface Job {
  id: string;

  // Metadata
  url: string;
  source: string; // ATS name: 'linkedin', 'greenhouse', 'workday', etc.
  externalId?: string;
  scrapedAt: string;

  // Parsed content
  parsed: ParsedJobDescription;

  // Analysis (computed after matching)
  matchScore?: number;
  matchReport?: MatchReport;

  // Tracking
  saved: boolean;
  savedAt?: string;
  notes?: string;
  tags?: string[];

  createdAt: string;
  updatedAt: string;
}

// Application tracking
export type ApplicationStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted'
  | 'viewed'
  | 'screened'
  | 'phone_screen'
  | 'interview_scheduled'
  | 'interviewing'
  | 'technical_assessment'
  | 'offer'
  | 'negotiating'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'
  | 'archived';

export interface StatusChange {
  from: ApplicationStatus;
  to: ApplicationStatus;
  timestamp: string;
  note?: string;
  source: 'user' | 'auto_detected' | 'system';
}

export interface AnswerVersion {
  content: string;
  timestamp: string;
  source: 'ai_generated' | 'user_edited' | 'from_memory' | 'profile_lookup';
}

export interface ApplicationAnswer {
  questionId: string;
  questionText: string;
  answer: string;
  generatedByAI: boolean;
  editedByUser: boolean;
  confidence: number;
  category: string;
  versions: AnswerVersion[];
}

export interface AutomationLogEntry {
  timestamp: string;
  action: string;
  target?: string;
  result: 'success' | 'failure' | 'skipped' | 'pending';
  details?: string;
  fieldId?: string;
}

export interface CoverLetter {
  id: string;
  jobId: string;
  profileId: string;
  content: string;
  tone: string;
  keyThemes: string[];
  matchedRequirements: string[];
  suggestedSubjectLine: string;
  versions: { content: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface Application {
  id: string;
  jobId: string;
  job: Job; // denormalized for quick access
  profileId: string;
  resumeId: string;
  tailoredResumeId?: string;

  status: ApplicationStatus;
  statusHistory: StatusChange[];

  appliedAt?: string;
  lastUpdated: string;
  createdAt: string;

  answers: ApplicationAnswer[];
  coverLetterId?: string;

  notes: string;
  tags: string[];
  rating?: 1 | 2 | 3 | 4 | 5; // user's interest rating

  automationLog: AutomationLogEntry[];

  // Company contacts
  recruiterName?: string;
  recruiterEmail?: string;
  recruiterLinkedin?: string;

  // Follow-up tracking
  nextFollowUpDate?: string;
  followUpCount: number;

  // Interview tracking
  interviews: Interview[];
}

export interface Interview {
  id: string;
  type: 'phone_screen' | 'video' | 'onsite' | 'technical' | 'behavioral' | 'panel' | 'final';
  scheduledAt: string;
  duration?: number; // minutes
  interviewers?: string[];
  notes?: string;
  feedback?: string;
  outcome?: 'passed' | 'failed' | 'pending';
}
