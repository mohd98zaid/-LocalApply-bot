// ============================================================
// Message Router — Central dispatcher for all cross-context messages
// src/background/messageRouter.ts
// ============================================================

import type { MessageType } from '../types/messages';
import { getOllamaClient } from '../ai/ollama/client';
import { getSettings, saveSettings, saveTabAnalysis, getTabAnalysis } from '../storage/chromeStorage';
import { profilesDB, jobsDB, applicationsDB } from '../storage/indexedDB';
import { parseResumeFile } from './resumeParser';
import { autoApplyEngine } from './autoApplyEngine';
import { QUESTION_ANSWERER_PROMPT, COVER_LETTER_PROMPT, JOB_MATCHER_PROMPT, interpolatePrompt, AI_FORM_FILLER_PROMPT, AI_QUESTION_ANSWERER_V2_PROMPT } from '../ai/prompts/index';
import { sendToContentScript } from '../utils/shared';

interface MessageSender {
  tab?: chrome.tabs.Tab;
  frameId?: number;
  id?: string;
}

type ResponseCallback = (response: unknown) => void;

class MessageRouter {
  async handle(
    message: { type: MessageType; payload: unknown; requestId?: string },
    sender: MessageSender,
    sendResponse: ResponseCallback
  ): Promise<void> {
    const { type, payload, requestId } = message;

    console.debug('[LocalApply Router]', type, payload);

    try {
      const result = await this.dispatch(type, payload, sender);
      sendResponse({ success: true, data: result, requestId });
    } catch (error) {
      console.error('[LocalApply Router] Error handling', type, error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        requestId,
      });
    }
  }

  private async dispatch(
    type: MessageType,
    payload: unknown,
    sender: MessageSender
  ): Promise<unknown> {
    switch (type) {

      // ---- Ollama ----

      case 'CHECK_OLLAMA_STATUS': {
        const settings = await getSettings();
        const client = getOllamaClient(settings.ai.ollamaUrl);
        const status = await client.getStatus();
        const models = status.models.map(m => m.name);
        status.primaryModelAvailable = models.some(m =>
          m === settings.ai.primaryModel || m.startsWith(settings.ai.primaryModel + ':')
        );
        status.embeddingModelAvailable = models.some(m =>
          m === settings.ai.embeddingModel || m.startsWith(settings.ai.embeddingModel + ':')
        );
        return status;
      }

      // ---- Settings ----

      case 'GET_SETTINGS': {
        return getSettings();
      }

      case 'SAVE_SETTINGS': {
        return saveSettings(payload as Parameters<typeof saveSettings>[0]);
      }

      // ---- Profile ----

      case 'GET_PROFILE': {
        const { profileId } = payload as { profileId: string };
        return profilesDB.get(profileId);
      }

      case 'GET_ALL_PROFILES': {
        return profilesDB.getAll();
      }

      case 'SAVE_PROFILE': {
        const profile = payload as Parameters<typeof profilesDB.save>[0];
        await profilesDB.save(profile);
        return profile;
      }

      // ---- Resumes ----

      case 'UPLOAD_RESUME': {
        const { data, type: mimeType, fileName } = payload as { data: number[]; type: string; fileName: string };
        // Convert number[] back to ArrayBuffer
        const buffer = new Uint8Array(data).buffer;
        return parseResumeFile(buffer, mimeType, fileName);
      }

      // ---- Jobs ----

      case 'MATCH_JOB': {
        const { resumeId, jobId } = payload as { resumeId: string; jobId: string };
        return this.matchJobToResume(resumeId, jobId);
      }

      // ---- Applications ----

      case 'SAVE_APPLICATION': {
        const app = payload as Parameters<typeof applicationsDB.save>[0];
        await applicationsDB.save(app);
        return app;
      }

      case 'GET_APPLICATIONS': {
        return applicationsDB.getAll();
      }

      // ---- AI Tasks ----

      case 'GENERATE_ANSWER': {
        const { question, context } = payload as {
          question: import('../types/ai').ApplicationQuestion;
          context: import('../types/ai').AnswerContext;
        };
        return this.generateAnswer(question, context);
      }

      case 'GENERATE_COVER_LETTER': {
        const { profileId, jobId, tone } = payload as { profileId: string; jobId: string; tone: string };
        return this.generateCoverLetter(profileId, jobId, tone);
      }

      // ---- Page Analysis (relay to content script) ----

      case 'PAGE_ANALYSIS_RESULT': {
        // Store analysis result from content script
        if (sender.tab?.id) {
          await saveTabAnalysis(sender.tab.id, payload);
          // Notify auto apply engine if running
          autoApplyEngine.handlePageAnalysis(payload as import('../types/messages').PageAnalysis, sender.tab.id);
        }
        // Broadcast to side panel (may not be open)
        chrome.runtime.sendMessage({ type: 'PAGE_ANALYSIS_RESULT', payload }).catch(() => {});
        return null;
      }

      case 'GET_PAGE_DATA': {
        const { tabId: dataTabId } = payload as { tabId: number };
        try {
          const result = await sendToContentScript(dataTabId, { type: 'GET_PAGE_DATA', payload: {} });
          return result;
        } catch {
          // Fallback to stored analysis
          return await getTabAnalysis(dataTabId);
        }
      }

      case 'ANALYZE_PAGE': {
        const { tabId } = payload as { tabId: number };
        // Inject content script command
        await sendToContentScript(tabId, { type: 'ANALYZE_PAGE', payload: {} });
        return null;
      }

      // ---- Autofill (relay to content script) ----

      case 'START_AUTOFILL': {
        const tabId = sender.tab?.id ?? (payload as { tabId?: number }).tabId;
        if (tabId) {
          await sendToContentScript(tabId, { type: 'START_AUTOFILL', payload });
        }
        return null;
      }

      case 'FILL_RESULT': {
        // Relay fill result from content script to side panel (may not be open)
        chrome.runtime.sendMessage({ type: 'FILL_RESULT', payload }).catch(() => {});
        return null;
      }

      case 'AUTOFILL_COMPLETE': {
        autoApplyEngine.handleAutofillComplete(payload as { success: boolean; reason?: string });
        return null;
      }

      case 'SAVE_FILL_TO_RAG': {
        const { filledData, url } = payload as { filledData: { label: string; value: string; mappedField: string }[]; url: string };
        try {
          const { addMemory } = await import('../rag/vectorStore');
          const content = filledData
            .map(f => `${f.label}: ${f.value} (mapped to ${f.mappedField})`)
            .join('\n');
          await addMemory(
            content,
            'application_answer',
            {
              source: 'autofill',
              tags: ['form_fill', new URL(url).hostname],
            },
            [], // embedding vector — computed later when available
            'none'
          );
        } catch (e) {
          console.warn('[LocalApply] Failed to save fill to RAG:', e);
        }
        return null;
      }

      // ---- AI-Powered Form Filling ----

      case 'AI_FILL_FIELD': {
        const { label, fieldType, options, jobTitle, companyName, profileId } = payload as {
          label: string; fieldType: string; options?: string[];
          jobTitle: string; companyName: string; profileId: string;
        };
        return this.aiFillField(label, fieldType, options, jobTitle, companyName, profileId);
      }

      case 'AI_FILL_FIELDS_BATCH': {
        const { fields, jobTitle, companyName, profileId } = payload as {
          fields: { label: string; fieldType: string; options?: string[] }[];
          jobTitle: string; companyName: string; profileId: string;
        };
        const results: { label: string; value: string; confidence: number }[] = [];
        for (const field of fields) {
          try {
            const result = await this.aiFillField(field.label, field.fieldType, field.options, jobTitle, companyName, profileId);
            results.push({ label: field.label, value: (result as { value: string; confidence: number }).value, confidence: (result as { value: string; confidence: number }).confidence });
          } catch {
            results.push({ label: field.label, value: '', confidence: 0 });
          }
        }
        return results;
      }

      case 'AI_ANSWER_QUESTION': {
        const { question, category, maxLength, jobTitle, companyName, profileId } = payload as {
          question: string; category: string; maxLength?: number;
          jobTitle: string; companyName: string; profileId: string;
        };
        return this.aiAnswerQuestion(question, category, maxLength, jobTitle, companyName, profileId);
      }

      // ---- Resume File & Cover Letter ----

      case 'GET_RESUME_FILE': {
        const { profileId: pid } = payload as { profileId: string };
        const prof = await profilesDB.get(pid);
        if (!prof) throw new Error('Profile not found');
        const activeResume = prof.resumes.find(r => r.id === prof.activeResumeId) ?? prof.resumes[0];
        if (!activeResume?.fileData) throw new Error('Resume file not found — re-upload your resume');
        return {
          fileData: activeResume.fileData,
          mimeType: activeResume.fileMimeType ?? 'application/pdf',
          fileName: activeResume.fileName ?? 'resume.pdf',
        };
      }

      case 'GENERATE_COVER_LETTER_TEXT': {
        const { profileId: clPid, jobTitle: clJobTitle, companyName: clCompany, jobDescription: clJd, tone: clTone } = payload as {
          profileId: string; jobTitle: string; companyName: string; jobDescription?: string; tone?: string;
        };
        return this.generateCoverLetterText(clPid, clJobTitle, clCompany, clJd, clTone ?? 'professional');
      }

      // ---- Auto Apply Loop ----

      case 'START_AUTO_APPLY_LOOP': {
        const { portal, tabId } = payload as { portal: 'linkedin' | 'naukri' | 'universal', tabId?: number };
        const targetTabId = sender.tab?.id || tabId;
        if (targetTabId) {
          await autoApplyEngine.start(targetTabId, portal);
        }
        return null;
      }

      case 'START_AUTOMATION': {
        const { portal, keywords, location } = payload as { portal: 'linkedin', keywords: string, location: string };
        
        // Build the LinkedIn search URL
        const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}`;
        
        // Open a new tab
        const tab = await chrome.tabs.create({ url: searchUrl, active: true });
        
        if (tab.id) {
          // Wait a bit for it to load, then start the engine
          setTimeout(async () => {
            await autoApplyEngine.start(tab.id!, portal);
          }, 3000);
        }
        
        return null;
      }

      case 'STOP_AUTO_APPLY_LOOP': {
        autoApplyEngine.stop();
        return null;
      }

      // ---- Side Panel ----

      case 'OPEN_SIDE_PANEL': {
        const targetTabId = sender.tab?.id ?? (payload as { tabId?: number })?.tabId;
        if (targetTabId) {
          await chrome.tabs.update(targetTabId, { active: true }).catch(() => {});
          try {
            await chrome.sidePanel.open({ tabId: targetTabId });
          } catch {
            // sidePanel.open may not be available in all contexts
          }
        }
        return null;
      }

      // ---- Get stored analysis for a tab ----

      case 'GET_TAB_ANALYSIS': {
        const { tabId: reqTabId } = payload as { tabId: number };
        const stored = await getTabAnalysis(reqTabId);
        return stored;
      }

      default:
        console.warn('[LocalApply Router] Unknown message type:', type);
        return null;
    }
  }

  // ---- AI Helpers ----

  private async aiFillField(
    label: string, fieldType: string, options: string[] | undefined,
    jobTitle: string, companyName: string, profileId: string
  ) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);

    // Get profile for context
    const profile = await profilesDB.get(profileId);
    const profileSummary = profile
      ? `${profile.personalInfo.firstName} ${profile.personalInfo.lastName}, ${profile.personalInfo.email}, ${profile.personalInfo.phone || ''}`
      : '';

    // Check RAG for similar past answers
    let pastAnswers = '';
    try {
      const { memoryDB } = await import('../storage/indexedDB');
      const memories = await memoryDB.getByType('application_answer');
      const relevant = memories.filter(m =>
        m.content.toLowerCase().includes(label.toLowerCase().split(' ')[0])
      ).slice(0, 3);
      if (relevant.length > 0) {
        pastAnswers = relevant.map(m => m.content).join('\n');
      }
    } catch { /* RAG not available */ }

    const userPrompt = interpolatePrompt(AI_FORM_FILLER_PROMPT.userPromptTemplate, {
      fieldLabel: label,
      fieldType,
      options: options?.join(', ') ?? '',
      jobTitle,
      companyName,
      profileSummary,
      pastAnswers,
    });

    const result = await client.generateJSON<{ value: string; confidence: number; reasoning: string }>({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: AI_FORM_FILLER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: AI_FORM_FILLER_PROMPT.temperature,
        num_predict: AI_FORM_FILLER_PROMPT.maxTokens,
      },
    });

    // Save to RAG for future reference
    if (result.value) {
      try {
        const { addMemory } = await import('../rag/vectorStore');
        await addMemory(
          `Field: ${label} → Value: ${result.value}`,
          'application_answer',
          { source: 'ai_fill', tags: ['ai_fill', label.toLowerCase()] },
          [],
          settings.ai.primaryModel
        );
      } catch { /* ignore RAG save errors */ }
    }

    return result;
  }

  private async aiAnswerQuestion(
    question: string, category: string, maxLength: number | undefined,
    jobTitle: string, companyName: string, profileId: string
  ) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);

    const profile = await profilesDB.get(profileId);
    const profileSummary = profile
      ? `${profile.personalInfo.firstName} ${profile.personalInfo.lastName}, ${profile.personalInfo.email}\nExperience: ${profile.resumes[0]?.summary ?? ''}\nSkills: ${profile.resumes[0]?.skills.flatMap(s => s.skills.map(sk => sk.name)).join(', ') ?? ''}`
      : '';

    // Check RAG for similar past answers
    let pastAnswers = '';
    try {
      const { memoryDB } = await import('../storage/indexedDB');
      const memories = await memoryDB.getByType('application_answer');
      const relevant = memories.filter(m =>
        m.content.toLowerCase().includes(category.toLowerCase()) ||
        m.content.toLowerCase().includes(question.toLowerCase().slice(0, 30))
      ).slice(0, 3);
      if (relevant.length > 0) {
        pastAnswers = relevant.map(m => m.content).join('\n');
      }
    } catch { /* RAG not available */ }

    const userPrompt = interpolatePrompt(AI_QUESTION_ANSWERER_V2_PROMPT.userPromptTemplate, {
      questionText: question,
      questionCategory: category,
      maxLength: maxLength ? String(maxLength) : '',
      profileSummary,
      jobTitle,
      companyName,
      pastAnswers,
    });

    const result = await client.generateJSON<{ answer: string; confidence: number; reasoning: string }>({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: AI_QUESTION_ANSWERER_V2_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: AI_QUESTION_ANSWERER_V2_PROMPT.temperature,
        num_predict: AI_QUESTION_ANSWERER_V2_PROMPT.maxTokens,
      },
    });

    // Save to RAG
    if (result.answer) {
      try {
        const { addMemory } = await import('../rag/vectorStore');
        await addMemory(
          `Question: ${question} → Answer: ${result.answer}`,
          'application_answer',
          { source: 'ai_answer', tags: ['ai_answer', category] },
          [],
          settings.ai.primaryModel
        );
      } catch { /* ignore */ }
    }

    return result;
  }

  private async generateCoverLetterText(
    profileId: string, jobTitle: string, companyName: string,
    jobDescription: string | undefined, tone: string
  ) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);
    const profile = await profilesDB.get(profileId);
    if (!profile) throw new Error('Profile not found');

    const activeResume = profile.resumes.find(r => r.id === profile.activeResumeId) ?? profile.resumes[0];

    const userPrompt = interpolatePrompt(COVER_LETTER_PROMPT.userPromptTemplate, {
      candidateName: `${profile.personalInfo.firstName} ${profile.personalInfo.lastName}`,
      candidateSummary: activeResume?.summary ?? '',
      topAchievements: activeResume?.experience
        .slice(0, 2)
        .flatMap(e => e.bullets.slice(0, 2))
        .join('\n') ?? '',
      skills: activeResume?.skills
        .flatMap(s => s.skills.map(sk => sk.name))
        .slice(0, 15)
        .join(', ') ?? '',
      jobTitle,
      companyName,
      requirements: jobDescription?.slice(0, 2000) ?? '',
      companyContext: '',
      tone,
    });

    const result = await client.generateJSON<{ coverLetter: string }>({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: COVER_LETTER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: COVER_LETTER_PROMPT.temperature,
        num_predict: COVER_LETTER_PROMPT.maxTokens,
      },
    });

    return { coverLetter: result.coverLetter ?? '' };
  }

  private async generateAnswer(
    question: import('../types/ai').ApplicationQuestion,
    context: import('../types/ai').AnswerContext
  ) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);

    const userPrompt = interpolatePrompt(QUESTION_ANSWERER_PROMPT.userPromptTemplate, {
      questionText: question.text,
      questionCategory: question.category,
      maxLength: String(question.maxLength ?? 'unlimited'),
      profileSummary: context.resume.summary ?? '',
      relevantExperience: context.resume.relevantExperience,
      jobTitle: context.jobDescription.title,
      companyName: context.jobDescription.company,
      requirements: context.jobDescription.requirements.join('\n'),
      pastAnswers: context.previousAnswers
        .map(a => `Q: ${a.question}\nA: ${a.answer}`)
        .join('\n---\n'),
    });

    return client.generateJSON({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: QUESTION_ANSWERER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: QUESTION_ANSWERER_PROMPT.temperature,
        num_predict: QUESTION_ANSWERER_PROMPT.maxTokens,
      },
    });
  }

  private async generateCoverLetter(profileId: string, jobId: string, tone: string) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);
    const profile = await profilesDB.get(profileId);
    const job = await jobsDB.get(jobId);

    if (!profile || !job) throw new Error('Profile or job not found');

    const activeResume = profile.resumes.find(r => r.id === profile.activeResumeId);

    const userPrompt = interpolatePrompt(COVER_LETTER_PROMPT.userPromptTemplate, {
      candidateName: `${profile.personalInfo.firstName} ${profile.personalInfo.lastName}`,
      candidateSummary: activeResume?.summary ?? '',
      topAchievements: activeResume?.experience
        .slice(0, 2)
        .flatMap(e => e.bullets.slice(0, 2))
        .join('\n') ?? '',
      skills: activeResume?.skills
        .flatMap(s => s.skills.map(sk => sk.name))
        .slice(0, 15)
        .join(', ') ?? '',
      jobTitle: job.parsed.title,
      companyName: job.parsed.company.name,
      requirements: job.parsed.requirements.required.join('\n'),
      companyContext: job.parsed.company.mission ?? job.parsed.company.description ?? '',
      tone,
    });

    return client.generateJSON({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: COVER_LETTER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: COVER_LETTER_PROMPT.temperature,
        num_predict: COVER_LETTER_PROMPT.maxTokens,
      },
    });
  }

  private async matchJobToResume(resumeId: string, jobId: string) {
    const settings = await getSettings();
    const client = getOllamaClient(settings.ai.ollamaUrl);
    const job = await jobsDB.get(jobId);

    if (!job) throw new Error('Job not found');

    // Find resume across all profiles
    const profiles = await profilesDB.getAll();
    let resume = null;
    for (const profile of profiles) {
      resume = profile.resumes.find(r => r.id === resumeId);
      if (resume) break;
    }

    if (!resume) throw new Error('Resume not found');

    const resumeSummary = [
      `Name: ${resume.contact.fullName}`,
      `Experience: ${resume.metadata.totalYearsExperience} years`,
      `Skills: ${resume.skills.flatMap(s => s.skills.map(sk => sk.name)).join(', ')}`,
      `Latest role: ${resume.experience[0]?.title} at ${resume.experience[0]?.company}`,
      resume.summary ?? '',
    ].join('\n');

    const userPrompt = interpolatePrompt(JOB_MATCHER_PROMPT.userPromptTemplate, {
      resumeSummary,
      jobDescription: job.parsed.rawDescription,
    });

    return client.generateJSON({
      model: settings.ai.primaryModel,
      messages: [
        { role: 'system', content: JOB_MATCHER_PROMPT.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      options: {
        temperature: JOB_MATCHER_PROMPT.temperature,
        num_predict: JOB_MATCHER_PROMPT.maxTokens,
      },
    });
  }
}

export const messageRouter = new MessageRouter();
