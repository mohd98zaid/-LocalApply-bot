// ============================================================
// Resume & Candidate Types
// src/types/resume.ts
// ============================================================

export interface Address {
  street?: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface Achievement {
  description: string;
  metric?: string;
  impact?: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  description: string;
  bullets: string[];
  skills: string[];
  achievements: Achievement[];
}

export interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  gpa?: number;
  startDate: string;
  endDate?: string;
  honors?: string[];
  coursework?: string[];
}

export interface Skill {
  name: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsOfExperience?: number;
  synonyms: string[];
}

export interface SkillCategory {
  category: string;
  skills: Skill[];
}

export interface Certification {
  name: string;
  issuer: string;
  dateObtained: string;
  expirationDate?: string;
  credentialId?: string;
  url?: string;
}

export interface Project {
  name: string;
  description: string;
  technologies: string[];
  url?: string;
  githubUrl?: string;
  startDate?: string;
  endDate?: string;
  highlights: string[];
}

export interface Award {
  title: string;
  issuer: string;
  date: string;
  description?: string;
}

export interface Publication {
  title: string;
  publisher: string;
  date: string;
  url?: string;
  doi?: string;
  coAuthors?: string[];
}

export interface Language {
  name: string;
  proficiency: 'basic' | 'conversational' | 'professional' | 'native';
}

export interface VolunteerExperience {
  organization: string;
  role: string;
  startDate: string;
  endDate?: string;
  description: string;
  skills: string[];
}

export interface ResumeMetadata {
  totalYearsExperience: number;
  highestEducation: string;
  primaryIndustry: string;
  seniorityLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive';
  atsScore: number;
  lastAnalyzed: string;
  parsingConfidence: number;
}

export interface ParsedResume {
  id: string;
  version: number;
  name: string; // User-friendly name for this resume version
  createdAt: string;
  updatedAt: string;
  rawText: string;
  source: 'pdf' | 'docx' | 'markdown' | 'manual';
  fileName?: string;
  fileData?: number[]; // Original file binary (stored for re-upload)
  fileMimeType?: string; // MIME type of the original file

  contact: {
    fullName: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    location: Address;
    linkedin?: string;
    github?: string;
    portfolio?: string;
    twitter?: string;
  };

  summary?: string;
  objectiveStatement?: string;

  experience: WorkExperience[];
  education: Education[];
  skills: SkillCategory[];
  certifications: Certification[];
  projects: Project[];
  awards: Award[];
  publications: Publication[];
  languages: Language[];
  volunteerWork: VolunteerExperience[];

  metadata: ResumeMetadata;
}

// Profile stored per user
export interface ScreeningAnswer {
  id: string;
  questionPattern: string; // keyword or pattern to match
  answer: string;
  category: string;
  lastUsed: string;
  useCount: number;
}

export interface WorkPreferences {
  desiredTitles: string[];
  desiredLocations: string[];
  remotePreference: 'remote' | 'hybrid' | 'onsite' | 'any';
  salaryExpectation: {
    min: number;
    max: number;
    currency: string;
    period: 'hourly' | 'annual';
  };
  noticePeriod: string;
  availableStartDate?: string;
  willingToRelocate: boolean;
  workAuthorization: string;
  requiresVisaSponsorship: boolean;
  openToContract: boolean;
  openToPartTime: boolean;
}

export interface CandidateProfile {
  id: string;
  name: string; // Profile name (e.g., "Software Engineer", "Frontend Dev")
  resumes: ParsedResume[];
  activeResumeId: string;

  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: Address;
    dateOfBirth?: string;
    nationality?: string;
    pronouns?: string;
  };

  workPreferences: WorkPreferences;
  screeningAnswers: ScreeningAnswer[];

  createdAt: string;
  updatedAt: string;
}

// Matching results
export interface ResumeSuggestion {
  type: 'add_skill' | 'rewrite_bullet' | 'add_keyword' | 'reorder' | 'format_fix';
  target: string;
  suggestion: string;
  impact: 'high' | 'medium' | 'low';
  originalText?: string;
  suggestedText?: string;
}

export interface ATSIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'format' | 'keyword' | 'structure' | 'readability';
  description: string;
  fix: string;
  location?: string;
}

export interface MatchReport {
  overallScore: number;
  breakdown: {
    requiredSkillsScore: number;
    preferredSkillsScore: number;
    experienceScore: number;
    educationScore: number;
    semanticSimilarityScore: number;
    keywordCoverageScore: number;
  };

  matchedSkills: string[];
  missingRequiredSkills: string[];
  missingPreferredSkills: string[];
  experienceGaps: string[];
  strengths: string[];

  suggestions: ResumeSuggestion[];

  atsScore: number;
  atsIssues: ATSIssue[];

  computedAt: string;
}

export interface TailoredBullet {
  originalBullet: string;
  tailoredBullet: string;
  changesExplanation: string;
  keywordsAdded: string[];
}

export interface TailoredResume {
  baseResumeId: string;
  jobId: string;
  tailoredBullets: TailoredBullet[];
  skillsReordered: string[];
  summaryRewrite: string;
  keywordsFromJD: string[];
  keywordsCovered: string[];
  keywordsMissing: string[];
  createdAt: string;
}
